param(
    [Parameter(Mandatory)]
    [int]$AppPid,
    [string]$FixturePath = ""
)

$ErrorActionPreference = "Stop"
if ([string]::IsNullOrWhiteSpace($FixturePath)) {
    $FixturePath = Join-Path $PSScriptRoot "fixtures\live-reload.md"
}
$results = @()
$tempDeck = Join-Path $env:TEMP "presentation-ui-test-$([guid]::NewGuid().ToString('N')).md"
$screenshotDir = Join-Path $PSScriptRoot "screenshots"
New-Item -ItemType Directory -Force -Path $screenshotDir | Out-Null
Copy-Item $FixturePath $tempDeck

Add-Type @"
using System;
using System.Runtime.InteropServices;
using System.Threading;
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
    [DllImport("user32.dll")]
    public static extern bool GetWindowRect(IntPtr hWnd, out RECT rect);
    [DllImport("user32.dll")]
    private static extern bool GetClientRect(IntPtr hWnd, out RECT rect);
    [DllImport("user32.dll")]
    private static extern bool ClientToScreen(IntPtr hWnd, ref POINT point);
    [DllImport("user32.dll")]
    private static extern IntPtr GetDC(IntPtr hWnd);
    [DllImport("user32.dll")]
    private static extern int ReleaseDC(IntPtr hWnd, IntPtr hDc);
    [DllImport("user32.dll")]
    private static extern IntPtr GetForegroundWindow();
    [DllImport("gdi32.dll")]
    private static extern uint GetPixel(IntPtr hDc, int x, int y);
    [DllImport("user32.dll")]
    private static extern bool SetCursorPos(int x, int y);
    [DllImport("user32.dll")]
    private static extern void mouse_event(uint flags, uint dx, uint dy, uint data, UIntPtr extraInfo);
    [DllImport("user32.dll")]
    private static extern void keybd_event(byte virtualKey, byte scanCode, uint flags, UIntPtr extraInfo);
    [DllImport("user32.dll")]
    private static extern uint GetWindowThreadProcessId(IntPtr hWnd, IntPtr processId);
    [DllImport("user32.dll")]
    private static extern bool GetGUIThreadInfo(uint threadId, ref GUITHREADINFO info);

    [StructLayout(LayoutKind.Sequential)]
    public struct RECT {
        public int Left;
        public int Top;
        public int Right;
        public int Bottom;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct POINT {
        public int X;
        public int Y;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct GUITHREADINFO {
        public int Size;
        public uint Flags;
        public IntPtr Active;
        public IntPtr Focus;
        public IntPtr Capture;
        public IntPtr MenuOwner;
        public IntPtr MoveSize;
        public IntPtr Caret;
        public RECT CaretRect;
    }

    public static void SendKey(IntPtr windowHandle, int virtualKey) {
        var info = new GUITHREADINFO();
        info.Size = Marshal.SizeOf<GUITHREADINFO>();
        var threadId = GetWindowThreadProcessId(windowHandle, IntPtr.Zero);
        if (!GetGUIThreadInfo(threadId, ref info) || info.Focus == IntPtr.Zero) {
            throw new InvalidOperationException("The presenter does not have a focused WebView2 window.");
        }

        SendMessage(info.Focus, 0x0100, (IntPtr)virtualKey, (IntPtr)1);
        SendMessage(
            info.Focus,
            0x0101,
            (IntPtr)virtualKey,
            new IntPtr(unchecked((long)0xC0000001)));
    }

    public static void SendKeyWithRepeat(IntPtr windowHandle, int virtualKey) {
        var info = new GUITHREADINFO();
        info.Size = Marshal.SizeOf<GUITHREADINFO>();
        var threadId = GetWindowThreadProcessId(windowHandle, IntPtr.Zero);
        if (!GetGUIThreadInfo(threadId, ref info) || info.Focus == IntPtr.Zero) {
            throw new InvalidOperationException("The presenter does not have a focused WebView2 window.");
        }

        SendMessage(info.Focus, 0x0100, (IntPtr)virtualKey, (IntPtr)1);
        SendMessage(
            info.Focus,
            0x0100,
            (IntPtr)virtualKey,
            new IntPtr(unchecked((long)0x40000001)));
        SendMessage(
            info.Focus,
            0x0101,
            (IntPtr)virtualKey,
            new IntPtr(unchecked((long)0xC0000001)));
    }

    public static void ClickSlideMargin(IntPtr windowHandle, bool rightButton) {
        ClickClientPoint(windowHandle, rightButton, 30, 2);
    }

    private static void ClickClientPoint(
        IntPtr windowHandle,
        bool rightButton,
        int horizontalDivisor,
        int verticalDivisor) {
        ShowWindow(windowHandle, 5);
        SetForegroundWindow(windowHandle);

        RECT rect;
        if (!GetClientRect(windowHandle, out rect)) {
            throw new InvalidOperationException("Could not read the presentation window bounds.");
        }

        var x = Math.Max(1, (rect.Right - rect.Left) / horizontalDivisor);
        var y = Math.Max(1, (rect.Bottom - rect.Top) / verticalDivisor);
        var point = new POINT { X = x, Y = y };
        if (!ClientToScreen(windowHandle, ref point) || !SetCursorPos(point.X, point.Y)) {
            throw new InvalidOperationException("Could not position the mouse over the slide margin.");
        }

        Thread.Sleep(50);
        mouse_event(rightButton ? 0x0008u : 0x0002u, 0, 0, 0, UIntPtr.Zero);
        mouse_event(rightButton ? 0x0010u : 0x0004u, 0, 0, 0, UIntPtr.Zero);
    }

    public static void SendPenShortcut(byte virtualKey) {
        const byte leftWindows = 0x5B;
        const uint keyUp = 0x0002;
        keybd_event(leftWindows, 0, 0, UIntPtr.Zero);
        keybd_event(virtualKey, 0, 0, UIntPtr.Zero);
        keybd_event(virtualKey, 0, keyUp, UIntPtr.Zero);
        keybd_event(leftWindows, 0, keyUp, UIntPtr.Zero);
    }

    public static double GetClientAverageLuminance(IntPtr windowHandle) {
        RECT rect;
        var origin = new POINT();
        if (!GetClientRect(windowHandle, out rect) ||
            !ClientToScreen(windowHandle, ref origin)) {
            throw new InvalidOperationException("Could not read the presenter client area.");
        }

        var width = rect.Right - rect.Left;
        var height = rect.Bottom - rect.Top;
        if (width <= 0 || height <= 0) {
            throw new InvalidOperationException("The presenter client area is empty.");
        }

        var screenDc = GetDC(IntPtr.Zero);
        if (screenDc == IntPtr.Zero) {
            throw new InvalidOperationException("Could not capture the desktop.");
        }

        try {
            long luminance = 0;
            var samples = 0;
            var stepX = Math.Max(1, width / 48);
            var stepY = Math.Max(1, height / 27);
            for (var y = stepY / 2; y < height; y += stepY) {
                for (var x = stepX / 2; x < width; x += stepX) {
                    var color = GetPixel(screenDc, origin.X + x, origin.Y + y);
                    if (color == 0xFFFFFFFF) {
                        continue;
                    }

                    var red = color & 0xFF;
                    var green = (color >> 8) & 0xFF;
                    var blue = (color >> 16) & 0xFF;
                    luminance += (red * 299 + green * 587 + blue * 114) / 1000;
                    samples++;
                }
            }

            if (samples == 0) {
                throw new InvalidOperationException("No presenter pixels could be sampled.");
            }

            return (double)luminance / samples;
        }
        finally {
            ReleaseDC(IntPtr.Zero, screenDc);
        }
    }

    public static bool IsForegroundWindow(IntPtr windowHandle) {
        return GetForegroundWindow() == windowHandle;
    }
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

function Get-WindowBounds {
    param([IntPtr]$WindowHandle)
    $rect = [PresentationUiNative+RECT]::new()
    if (-not [PresentationUiNative]::GetWindowRect($WindowHandle, [ref]$rect)) {
        throw "Could not read window bounds for $WindowHandle."
    }
    return [pscustomobject]@{
        left = $rect.Left
        top = $rect.Top
        right = $rect.Right
        bottom = $rect.Bottom
    }
}

function Wait-PageCounter {
    param(
        [string]$Expected,
        [int]$TimeoutMilliseconds = 3000
    )
    $timer = [Diagnostics.Stopwatch]::StartNew()
    do {
        $tree = winapp ui inspect -w $script:mainHwnd --depth 12 --json | ConvertFrom-Json
        $elements = @(Get-UiElements -Elements $tree.windows[0].elements)
        $counter = $elements | Where-Object automationId -eq "PageCounterText"
        if ($counter -and ($counter.name -eq $Expected -or $counter.value -eq $Expected)) {
            return
        }
        Start-Sleep -Milliseconds 100
    } while ($timer.ElapsedMilliseconds -lt $TimeoutMilliseconds)

    $actual = if ($counter) { "$($counter.name)" } else { "<missing>" }
    throw "Page counter did not become '$Expected' within ${TimeoutMilliseconds}ms (actual: '$actual')."
}

function Wait-PresenterRunning {
    $expected = [string]::Concat(
        [char]0x767A,
        [char]0x8868,
        [char]0x3092,
        [char]0x7D42,
        [char]0x4E86)
    for ($attempt = 0; $attempt -lt 50; $attempt++) {
        $tree = winapp ui inspect -w $script:mainHwnd --interactive --json | ConvertFrom-Json
        $elements = @(Get-UiElements -Elements $tree.windows[0].elements)
        $button = $elements | Where-Object automationId -eq "StartPresentationButton"
        if ($button -and $button.name -eq $expected) {
            return
        }
        Start-Sleep -Milliseconds 100
    }
    throw "Presenter WebView and Surface Pen listener did not become ready."
}

function Wait-PresenterRendered {
    param(
        [IntPtr]$WindowHandle,
        [int]$TimeoutMilliseconds = 12000
    )
    $timer = [Diagnostics.Stopwatch]::StartNew()
    do {
        if ([PresentationUiNative]::IsForegroundWindow($WindowHandle)) {
            $luminance = [PresentationUiNative]::GetClientAverageLuminance($WindowHandle)
            # The dark fixture is well above 6; an unpainted black host is 0.
            if ($luminance -ge 6) {
                return
            }
        }
        Start-Sleep -Milliseconds 100
    } while ($timer.ElapsedMilliseconds -lt $TimeoutMilliseconds)

    $actual = if ($null -eq $luminance) { "<not foreground>" } else { [Math]::Round($luminance, 2) }
    throw "Presenter remained black after opening (average luminance: $actual)."
}

function Test-SameBounds {
    param(
        [object]$Left,
        [object]$Right,
        [int]$Tolerance = 2
    )
    return [Math]::Abs($Left.left - $Right.left) -le $Tolerance -and
        [Math]::Abs($Left.top - $Right.top) -le $Tolerance -and
        [Math]::Abs($Left.right - $Right.right) -le $Tolerance -and
        [Math]::Abs($Left.bottom - $Right.bottom) -le $Tolerance
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

    Invoke-Test "Presenter view slide margins navigate with physical mouse input" {
        $script:mainHwnd = (winapp ui list-windows -a $AppPid --json |
            ConvertFrom-Json |
            Select-Object -First 1).hwnd
        $windowHandle = [IntPtr]$script:mainHwnd
        [PresentationUiNative]::ClickSlideMargin($windowHandle, $false)
        Wait-PageCounter -Expected "3 / 4"
        [PresentationUiNative]::ClickSlideMargin($windowHandle, $true)
        Wait-PageCounter -Expected "2 / 4"
    }

    Invoke-Test "Presenter view keeps Home and End after mouse focus" {
        $windowHandle = [IntPtr]$script:mainHwnd
        [PresentationUiNative]::SendKey($windowHandle, 0x23)
        Wait-PageCounter -Expected "4 / 4"
        [PresentationUiNative]::SendKey($windowHandle, 0x24)
        Wait-PageCounter -Expected "1 / 4"
        Invoke-WinApp ui invoke NextSlideButton -a $AppPid | Out-Null
        Wait-PageCounter -Expected "2 / 4"
    }

    Invoke-Test "Presenter opens a second top-level window in the same process" {
        $before = @(winapp ui list-windows -a $AppPid --json | ConvertFrom-Json | Select-Object -ExpandProperty hwnd)
        $script:mainHwnd = $before[0]
        Invoke-WinApp ui invoke StartPresentationButton -a $AppPid | Out-Null
        $presenter = $null
        for ($attempt = 0; $attempt -lt 50 -and -not $presenter; $attempt++) {
            Start-Sleep -Milliseconds 100
            $presenter = winapp ui list-windows -a $AppPid --json |
                ConvertFrom-Json |
                Where-Object { $_.hwnd -notin $before } |
                Select-Object -First 1
        }
        if (-not $presenter) { throw "Presenter window did not open in the app process." }
        $script:presenterHwnd = $presenter.hwnd
        Wait-PresenterRendered -WindowHandle ([IntPtr]$script:presenterHwnd)
        Wait-PresenterRunning
    }

    Invoke-Test "Presentation screen slide margins navigate with physical mouse input" {
        $windowHandle = [IntPtr]$script:presenterHwnd
        [PresentationUiNative]::ClickSlideMargin($windowHandle, $false)
        Wait-PageCounter -Expected "3 / 4"
        [PresentationUiNative]::ClickSlideMargin($windowHandle, $true)
        Wait-PageCounter -Expected "2 / 4"
    }

    Invoke-Test "Surface Pen shortcuts navigate only while the presenter is active" {
        [PresentationUiNative]::SendPenShortcut(0x83)
        Wait-PageCounter -Expected "3 / 4"
        [PresentationUiNative]::SendPenShortcut(0x81)
        Wait-PageCounter -Expected "2 / 4"
    }

    Invoke-Test "F11 and Escape toggle native fullscreen" {
        $windowHandle = [IntPtr]$script:presenterHwnd
        $windowedBounds = Get-WindowBounds -WindowHandle $windowHandle
        [PresentationUiNative]::SendKeyWithRepeat($windowHandle, 0x7A)

        $fullScreenBounds = $windowedBounds
        for ($attempt = 0; $attempt -lt 30; $attempt++) {
            Start-Sleep -Milliseconds 100
            $fullScreenBounds = Get-WindowBounds -WindowHandle $windowHandle
            if (-not (Test-SameBounds $windowedBounds $fullScreenBounds)) { break }
        }
        if (Test-SameBounds $windowedBounds $fullScreenBounds) {
            throw "F11 did not change the presenter window bounds."
        }

        [PresentationUiNative]::SendKey($windowHandle, 0x1B)
        $restoredBounds = $fullScreenBounds
        for ($attempt = 0; $attempt -lt 30; $attempt++) {
            Start-Sleep -Milliseconds 100
            $restoredBounds = Get-WindowBounds -WindowHandle $windowHandle
            if (-not (Test-SameBounds $fullScreenBounds $restoredBounds)) { break }
        }
        if (Test-SameBounds $fullScreenBounds $restoredBounds) {
            throw "Escape did not leave fullscreen: fullscreen $($fullScreenBounds | ConvertTo-Json -Compress), actual $($restoredBounds | ConvertTo-Json -Compress)."
        }
        if (-not (Test-SameBounds $windowedBounds $restoredBounds)) {
            throw "Escape did not restore the original bounds: expected $($windowedBounds | ConvertTo-Json -Compress), actual $($restoredBounds | ConvertTo-Json -Compress)."
        }
    }

    Invoke-Test "Closing the presenter window restores the main screen state" {
        Invoke-WinApp ui invoke Close -w $script:presenterHwnd | Out-Null
        for ($attempt = 0; $attempt -lt 50; $attempt++) {
            $remaining = winapp ui list-windows -a $AppPid --json |
                ConvertFrom-Json |
                Where-Object { $_.hwnd -eq $script:presenterHwnd }
            if (-not $remaining) { break }
            Start-Sleep -Milliseconds 100
        }
        $remaining = winapp ui list-windows -a $AppPid --json |
            ConvertFrom-Json |
            Where-Object { $_.hwnd -eq $script:presenterHwnd }
        if ($remaining) { throw "Presenter window did not close." }

        Start-Sleep -Milliseconds 300
        [PresentationUiNative]::SendPenShortcut(0x83)
        Start-Sleep -Milliseconds 300
        Wait-PageCounter -Expected "2 / 4"

        $tree = winapp ui inspect -a $AppPid --interactive --json | ConvertFrom-Json
        $elements = @(Get-UiElements -Elements $tree.windows[0].elements)
        $startButton = $elements | Where-Object automationId -eq "StartPresentationButton"
        $expectedStartLabel = [string]::Concat(
            [char]0x767A,
            [char]0x8868,
            [char]0x3092,
            [char]0x958B,
            [char]0x59CB)
        if (-not $startButton -or $startButton.name -ne $expectedStartLabel) {
            throw "Main window did not revert to the 'start presentation' state after the audience closed the presenter window."
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

    Invoke-Test "Top-right Close exits promptly with active WebViews" {
        Invoke-WinApp ui invoke StartPresentationButton -a $AppPid | Out-Null
        $presenter = $null
        for ($attempt = 0; $attempt -lt 50 -and -not $presenter; $attempt++) {
            Start-Sleep -Milliseconds 100
            $windows = @(winapp ui list-windows -a $AppPid --json | ConvertFrom-Json)
            $presenter = $windows |
                Where-Object { $_.hwnd -ne $script:mainHwnd } |
                Select-Object -First 1
        }
        if (-not $presenter) { throw "Presenter did not reopen before the shutdown test." }

        Wait-PresenterRunning

        $timer = [Diagnostics.Stopwatch]::StartNew()
        Invoke-WinApp ui invoke Close -w $script:mainHwnd | Out-Null
        while ((Get-Process -Id $AppPid -ErrorAction SilentlyContinue) -and $timer.ElapsedMilliseconds -lt 3000) {
            Start-Sleep -Milliseconds 50
        }
        $timer.Stop()
        if (Get-Process -Id $AppPid -ErrorAction SilentlyContinue) {
            throw "The app was still running $($timer.ElapsedMilliseconds) ms after Close."
        }
    }
}
finally {
    Remove-Item $tempDeck -Force -ErrorAction SilentlyContinue
}

$results | ConvertTo-Json | Set-Content (Join-Path $PSScriptRoot "test-results.json")
$failed = @($results | Where-Object status -eq "FAIL")
$results | Format-Table -AutoSize
if ($failed.Count -gt 0) { exit 1 }
