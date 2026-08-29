param(
    [ValidateSet("x64", "arm64")]
    [string]$Architecture = "x64",
    [string]$Configuration = "Release"
)

$ErrorActionPreference = "Stop"
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
    "THIRD-PARTY-NOTICES.md"
)
foreach ($relative in $required) {
    if (-not (Test-Path (Join-Path $output $relative) -PathType Leaf)) {
        throw "Publish output is missing $relative"
    }
}

Compress-Archive -Path (Join-Path $output "*") -DestinationPath $zip -CompressionLevel Optimal
$checksum = "$zip.sha256"
$hash = (Get-FileHash $zip -Algorithm SHA256).Hash.ToLowerInvariant()
"$hash  $(Split-Path $zip -Leaf)" | Set-Content -Encoding ascii $checksum
Write-Output $zip
Write-Output $checksum
