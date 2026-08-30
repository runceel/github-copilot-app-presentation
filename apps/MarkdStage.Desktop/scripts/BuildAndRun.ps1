$ErrorActionPreference = "Stop"

$project = Join-Path $PSScriptRoot "..\src\MarkdStage.App\MarkdStage.App.csproj"
$candidates = @(
    (Join-Path $HOME ".copilot\installed-plugins\win-dev-skills\winui\skills\winui-dev-workflow\BuildAndRun.ps1"),
    (Join-Path $HOME ".copilot\installed-plugins\awesome-copilot\winui\skills\winui-dev-workflow\BuildAndRun.ps1")
)
$skillScript = $candidates | Where-Object { Test-Path $_ -PathType Leaf } | Select-Object -First 1

if (-not $skillScript) {
    throw "The winui plugin is required. Install winui@win-dev-skills and retry."
}

& $skillScript $project @args
exit $LASTEXITCODE
