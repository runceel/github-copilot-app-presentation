param(
    [Parameter(Mandatory)]
    [ValidatePattern("^v\d+\.\d+\.\d+$")]
    [string]$Version
)

$ErrorActionPreference = "Stop"
$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$releaseDirectory = Join-Path $repoRoot "artifacts\releases\$Version"
$desktopArtifacts = Join-Path $repoRoot "apps\Presentation.Desktop\artifacts"
$desktopPublisher = Join-Path $repoRoot "apps\Presentation.Desktop\scripts\Publish.ps1"
$extensionSource = Join-Path $repoRoot ".github\extensions\presentation"
$stagingDirectory = Join-Path $env:TEMP "presentation-release-$([guid]::NewGuid().ToString('N'))"

function Write-Checksum {
    param([Parameter(Mandatory)][string]$Path)

    $hash = (Get-FileHash $Path -Algorithm SHA256).Hash.ToLowerInvariant()
    $checksumPath = "$Path.sha256"
    "$hash  $(Split-Path $Path -Leaf)" | Set-Content -Encoding ascii $checksumPath
    return $checksumPath
}

if (Test-Path $releaseDirectory) {
    Remove-Item $releaseDirectory -Recurse -Force
}
New-Item -ItemType Directory -Path $releaseDirectory | Out-Null

try {
    & $desktopPublisher -Architecture x64
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    & $desktopPublisher -Architecture arm64
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

    foreach ($name in @(
        "Presentation-win-x64.zip",
        "Presentation-win-x64.zip.sha256",
        "Presentation-win-arm64.zip",
        "Presentation-win-arm64.zip.sha256"
    )) {
        Copy-Item (Join-Path $desktopArtifacts $name) $releaseDirectory
    }

    New-Item -ItemType Directory -Path $stagingDirectory | Out-Null
    Copy-Item $extensionSource -Destination $stagingDirectory -Recurse
    $extensionTests = Join-Path $stagingDirectory "presentation\test"
    if (Test-Path $extensionTests) {
        Remove-Item $extensionTests -Recurse -Force
    }

    $extensionZip = Join-Path $releaseDirectory "presentation-$Version.zip"
    Compress-Archive `
        -Path (Join-Path $stagingDirectory "presentation") `
        -DestinationPath $extensionZip `
        -CompressionLevel Optimal
    Write-Checksum $extensionZip | Out-Null

    $verificationDirectory = Join-Path $stagingDirectory "verify"
    Expand-Archive $extensionZip -DestinationPath $verificationDirectory
    if (-not (Test-Path (Join-Path $verificationDirectory "presentation\extension.mjs"))) {
        throw "The extension ZIP does not contain presentation/extension.mjs."
    }
    if (Test-Path (Join-Path $verificationDirectory "presentation\test")) {
        throw "The extension ZIP contains development tests."
    }

    foreach ($zip in Get-ChildItem $releaseDirectory -Filter "*.zip") {
        $checksumPath = "$($zip.FullName).sha256"
        if (-not (Test-Path $checksumPath)) {
            throw "Missing checksum: $($zip.Name)"
        }
        $expected = (Get-Content $checksumPath).Split(" ")[0]
        $actual = (Get-FileHash $zip.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
        if ($expected -ne $actual) {
            throw "Checksum mismatch: $($zip.Name)"
        }
    }

    Get-ChildItem $releaseDirectory |
        Sort-Object Name |
        Select-Object Name, Length, FullName
}
finally {
    if (Test-Path $stagingDirectory) {
        Remove-Item $stagingDirectory -Recurse -Force
    }
}
