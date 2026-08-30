param(
    [ValidateSet("x64", "arm64")]
    [string]$Architecture = "x64",
    [string]$Configuration = "Release"
)

$ErrorActionPreference = "Stop"

function Get-Sha256Hex {
    param(
        [Parameter(Mandatory)]
        [byte[]]$Bytes
    )

    $digest = [Security.Cryptography.SHA256]::HashData($Bytes)
    return [Convert]::ToHexString($digest).ToLowerInvariant()
}

function Test-VendorAssetIntegrity {
    param(
        [Parameter(Mandatory)]
        [string]$VendorDirectory
    )

    $manifestPath = Join-Path $VendorDirectory "vendor-assets.lock.json"
    if (-not (Test-Path -LiteralPath $manifestPath -PathType Leaf)) {
        throw "Publish output is missing Web\vendor\vendor-assets.lock.json"
    }

    $manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
    $asset = $manifest.assets.'mermaid.min.js'
    $chunks = @($asset.chunks)
    if ($null -eq $asset -or $chunks.Count -eq 0) {
        throw "Vendor asset manifest is missing mermaid.min.js chunks."
    }

    $combinedHash = [Security.Cryptography.IncrementalHash]::CreateHash(
        [Security.Cryptography.HashAlgorithmName]::SHA256)
    $totalLength = [long]0
    try {
        for ($index = 0; $index -lt $chunks.Count; $index++) {
            $chunk = $chunks[$index]
            $name = [string]$chunk.file
            if ([int]$chunk.index -ne ($index + 1) -or [string]::IsNullOrWhiteSpace($name)) {
                throw "Vendor asset manifest contains an invalid Mermaid chunk entry."
            }

            $chunkPath = Join-Path $VendorDirectory $name
            if (-not (Test-Path -LiteralPath $chunkPath -PathType Leaf)) {
                throw "Publish output is missing Web\vendor\$name"
            }

            $bytes = [IO.File]::ReadAllBytes($chunkPath)
            if ($bytes.LongLength -ne [long]$chunk.size) {
                throw "$name failed size verification."
            }

            $actualHash = Get-Sha256Hex -Bytes $bytes
            $expectedHash = [string]$chunk.sha256
            if (-not $actualHash.Equals($expectedHash, [StringComparison]::OrdinalIgnoreCase)) {
                throw "$name failed SHA-256 verification."
            }

            $combinedHash.AppendData($bytes)
            $totalLength += $bytes.LongLength
        }

        $actualCombinedHash = [Convert]::ToHexString(
            $combinedHash.GetHashAndReset()).ToLowerInvariant()
    }
    finally {
        $combinedHash.Dispose()
    }

    if ($totalLength -ne [long]$asset.size) {
        throw "mermaid.min.js failed size verification."
    }

    $expectedCombinedHash = [string]$asset.sha256
    if (-not $actualCombinedHash.Equals(
        $expectedCombinedHash,
        [StringComparison]::OrdinalIgnoreCase)) {
        throw "mermaid.min.js failed SHA-256 verification."
    }
}

$appRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$project = Join-Path $appRoot "src\Presentation.App\Presentation.App.csproj"
$runtime = "win-$Architecture"
$platform = if ($Architecture -eq "arm64") { "ARM64" } else { "x64" }
$output = Join-Path $appRoot "artifacts\$runtime"
$zip = Join-Path $appRoot "artifacts\Presentation-$runtime.zip"

if (Test-Path $output) {
    Remove-Item $output -Recurse -Force
}
if (Test-Path $zip) {
    Remove-Item $zip -Force
}

dotnet publish $project `
    -c $Configuration `
    -r $runtime `
    -p:Platform=$platform `
    -p:SelfContained=true `
    -p:WindowsAppSDKSelfContained=true `
    -p:PublishSingleFile=false `
    -p:PublishTrimmed=false `
    -p:PublishReadyToRun=false `
    -o $output
if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
}

$required = @(
    "PresentationApp.exe",
    "PresentationApp.dll",
    "App.xbf",
    "MainPage.xbf",
    "MainWindow.xbf",
    "PresenterWindow.xbf",
    "PresentationApp.pri",
    "Assets\AppIcon.ico",
    "Web\index.html",
    "Web\renderer\renderer.js",
    "Web\vendor\vendor-assets.lock.json",
    "SurfacePen\pen-button-listener.ps1",
    "THIRD-PARTY-NOTICES.md"
)
foreach ($relative in $required) {
    if (-not (Test-Path (Join-Path $output $relative) -PathType Leaf)) {
        throw "Publish output is missing $relative"
    }
}

Test-VendorAssetIntegrity -VendorDirectory (Join-Path $output "Web\vendor")

Compress-Archive -Path (Join-Path $output "*") -DestinationPath $zip -CompressionLevel Optimal
$checksum = "$zip.sha256"
$hash = (Get-FileHash $zip -Algorithm SHA256).Hash.ToLowerInvariant()
"$hash  $(Split-Path $zip -Leaf)" | Set-Content -Encoding ascii $checksum
Write-Output $zip
Write-Output $checksum
