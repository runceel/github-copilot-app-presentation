param(
    [Parameter(Mandatory)]
    [int]$AppPid,
    [string]$FixturePath = (Join-Path $PSScriptRoot "fixtures\live-reload.md")
)

$ErrorActionPreference = "Stop"
$results = @()
$tempDeck = Join-Path $env:TEMP "presentation-ui-test-$([guid]::NewGuid().ToString('N')).md"
$screenshotDir = Join-Path $PSScriptRoot "screenshots"
New-Item -ItemType Directory -Force -Path $screenshotDir | Out-Null
Copy-Item $FixturePath $tempDeck

Add-Type @"
using System;
using System.Runtime.InteropServices;
public static class PresentationUiNative {
    [DllImport("user32.dll")]
    public static extern bool SetForegroundWindow(IntPtr hWnd);
    [DllImport("user32.dll")]
    public static extern bool ShowWindow(IntPtr hWnd, int command);
    [DllImport("user32.dll")]
    public static extern IntPtr GetDlgItem(IntPtr hDlg, int id);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    public static extern IntPtr FindWindowEx(IntPtr parent, IntPtr childAfter, string className, string windowName);
    [DllImport("user32.dll", EntryPoint = "SendMessageW", CharSet = CharSet.Unicode)]
    public static extern IntPtr SendMessageText(IntPtr hWnd, uint message, IntPtr wParam, string lParam);
    [DllImport("user32.dll", EntryPoint = "SendMessageW")]
    public static extern IntPtr SendMessage(IntPtr hWnd, uint message, IntPtr wParam, IntPtr lParam);
}
"@

function Invoke-Test {
    param([string]$Name, [scriptblock]$Action)
    try {
        & $Action
        $script:results += [pscustomobject]@{ name = $Name; status = "PASS"; detail = "" }
    }
    catch {
        $script:results += [pscustomobject]@{ name = $Name; status = "FAIL"; detail = "$_" }
    }
}

function Invoke-WinApp {
    $output = & winapp @args 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw ($output -join [Environment]::NewLine)
    }
    return $output
}

function Get-UiElements {
    param([object[]]$Elements)
    foreach ($element in $Elements) {
        $element
        if ($element.children) {
            Get-UiElements -Elements $element.children
        }
    }
}

function Open-Markdown {
    Invoke-WinApp ui invoke OpenMarkdownButton -a $AppPid | Out-Null
    Start-Sleep -Milliseconds 800
    $main = (winapp ui list-windows -a $AppPid --json | ConvertFrom-Json | Select-Object -First 1)
    $picker = winapp ui list-windows --json |
        ConvertFrom-Json |
        Where-Object { $_.ownerHwnd -eq $main.hwnd -and $_.processName -eq "PickerHost" } |
        Select-Object -First 1
    if (-not $picker) { throw "File picker did not open." }

    $combo = [PresentationUiNative]::GetDlgItem([IntPtr]$picker.hwnd, 1148)
    $edit = [PresentationUiNative]::FindWindowEx($combo, [IntPtr]::Zero, "Edit", $null)
    if ($edit -eq [IntPtr]::Zero) {
        $innerCombo = [PresentationUiNative]::FindWindowEx(
            $combo,
            [IntPtr]::Zero,
            "ComboBox",
            $null)
        $edit = [PresentationUiNative]::FindWindowEx(
            $innerCombo,
            [IntPtr]::Zero,
            "Edit",
            $null)
    }
    if ($edit -eq [IntPtr]::Zero) { throw "File picker filename field was not found." }
    [PresentationUiNative]::SendMessageText($edit, 0x000C, [IntPtr]::Zero, $tempDeck) | Out-Null

    $openButton = [PresentationUiNative]::GetDlgItem([IntPtr]$picker.hwnd, 1)
    if ($openButton -eq [IntPtr]::Zero) { throw "File picker Open button was not found." }
    [PresentationUiNative]::SendMessage($openButton, 0x00F5, [IntPtr]::Zero, [IntPtr]::Zero) | Out-Null
}

try {
    Invoke-Test "Open Markdown from the system picker" {
        Open-Markdown
        Invoke-WinApp ui wait-for PageCounterText -a $AppPid --value "1 / 3" -t 5000 | Out-Null
    }

    Invoke-Test "Navigate to the next slide" {
        Invoke-WinApp ui invoke NextSlideButton -a $AppPid | Out-Null
        Invoke-WinApp ui wait-for PageCounterText -a $AppPid --value "2 / 3" -t 3000 | Out-Null
    }

    Invoke-Test "Live reload preserves the current page" {
        Add-Content -Path $tempDeck -Value "`n---`n`n## Added slide`n`nReloaded"
        Invoke-WinApp ui wait-for PageCounterText -a $AppPid --value "2 / 4" -t 5000 | Out-Null
    }

    Invoke-Test "Invalid save retains the last valid deck" {
        $validContent = Get-Content $tempDeck -Raw
        Set-Content -Path $tempDeck -Value ""
        Invoke-WinApp ui wait-for PresentationErrorInfoBar -a $AppPid -t 5000 | Out-Null
        Invoke-WinApp ui wait-for PageCounterText -a $AppPid --value "2 / 4" -t 3000 | Out-Null
        Set-Content -Path $tempDeck -Value $validContent
        Invoke-WinApp ui wait-for PresentationErrorInfoBar -a $AppPid --gone -t 5000 | Out-Null
    }

    Invoke-Test "Open and close the audience window" {
        $before = @(Get-Process -Name msedge,chrome,chromium -ErrorAction SilentlyContinue |
            Select-Object -ExpandProperty Id)
        Invoke-WinApp ui invoke StartPresentationButton -a $AppPid | Out-Null
        $audience = $null
        for ($attempt = 0; $attempt -lt 50 -and -not $audience; $attempt++) {
            Start-Sleep -Milliseconds 100
            $audience = Get-Process -Name msedge,chrome,chromium -ErrorAction SilentlyContinue |
                Where-Object { $_.Id -notin $before -and $_.MainWindowHandle -ne 0 } |
                Select-Object -First 1
        }
        if (-not $audience) { throw "Audience browser window did not open." }
        $audiencePid = $audience.Id
        $audience.Dispose()
        Invoke-WinApp ui invoke StartPresentationButton -a $AppPid | Out-Null
        for ($attempt = 0; $attempt -lt 50; $attempt++) {
            if (-not (Get-Process -Id $audiencePid -ErrorAction SilentlyContinue)) { break }
            Start-Sleep -Milliseconds 100
        }
        if (Get-Process -Id $audiencePid -ErrorAction SilentlyContinue) {
            throw "Audience browser process did not stop."
        }
    }

    Invoke-Test "Interactive controls expose stable AutomationIds" {
        $tree = winapp ui inspect -a $AppPid --interactive --json | ConvertFrom-Json
        $required = @(
            "OpenMarkdownButton",
            "StartPresentationButton",
            "PreviousSlideButton",
            "NextSlideButton"
        )
        $elements = @(Get-UiElements -Elements $tree.windows[0].elements)
        foreach ($id in $required) {
            if (-not ($elements | Where-Object automationId -eq $id)) {
                throw "Missing AutomationId: $id"
            }
        }
    }

    winapp ui screenshot -a $AppPid -o (Join-Path $screenshotDir "final.png") | Out-Null
}
finally {
    Remove-Item $tempDeck -Force -ErrorAction SilentlyContinue
}

$results | ConvertTo-Json | Set-Content (Join-Path $PSScriptRoot "test-results.json")
$failed = @($results | Where-Object status -eq "FAIL")
$results | Format-Table -AutoSize
if ($failed.Count -gt 0) { exit 1 }
