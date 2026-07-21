param(
    [Parameter(Mandatory = $true)]
    [ValidateRange(1, [int]::MaxValue)]
    [int]$ParentProcessId
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$bridgeLoaded = $false

$bridgeSource = @'
using System;
using System.ComponentModel;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Threading;

public static class PresentationPenHotkeyBridge
{
    private const int WhKeyboardLl = 13;
    private const int WmKeyDown = 0x0100;
    private const int WmKeyUp = 0x0101;
    private const int WmSysKeyDown = 0x0104;
    private const int WmSysKeyUp = 0x0105;
    private const int WmQuit = 0x0012;
    private const int VkLeftWindows = 0x5B;
    private const int VkRightWindows = 0x5C;
    private const int VkF18 = 0x81;
    private const int VkF20 = 0x83;
    private const byte VkMenuMask = 0xE8;
    private const uint KeyEventKeyUp = 0x0002;

    private static readonly object OutputLock = new object();
    private static readonly LowLevelKeyboardProc HookCallbackDelegate = HookCallback;
    private static IntPtr hook = IntPtr.Zero;
    private static bool leftWindowsDown;
    private static bool rightWindowsDown;
    private static bool f18Handled;
    private static bool f20Handled;

    public static int Run(int parentProcessId)
    {
        uint threadId = GetCurrentThreadId();
        hook = SetWindowsHookEx(
            WhKeyboardLl,
            HookCallbackDelegate,
            GetModuleHandle(null),
            0);
        if (hook == IntPtr.Zero)
        {
            WriteError(new Win32Exception(Marshal.GetLastWin32Error()).Message);
            return 1;
        }

        WriteStatus(true);

        using (Timer parentMonitor = new Timer(
            delegate
            {
                if (!IsProcessAlive(parentProcessId))
                {
                    PostThreadMessage(threadId, WmQuit, UIntPtr.Zero, IntPtr.Zero);
                }
            },
            null,
            500,
            500))
        {
            try
            {
                Message message;
                int result;
                while ((result = GetMessage(out message, IntPtr.Zero, 0, 0)) > 0)
                {
                    TranslateMessage(ref message);
                    DispatchMessage(ref message);
                }

                if (result < 0)
                {
                    WriteError(new Win32Exception(Marshal.GetLastWin32Error()).Message);
                    return 1;
                }
            }
            finally
            {
                if (hook != IntPtr.Zero)
                {
                    UnhookWindowsHookEx(hook);
                    hook = IntPtr.Zero;
                }
            }
        }

        return 0;
    }

    private static IntPtr HookCallback(int code, IntPtr messagePointer, IntPtr dataPointer)
    {
        if (code >= 0)
        {
            int message = messagePointer.ToInt32();
            bool isDown = message == WmKeyDown || message == WmSysKeyDown;
            bool isUp = message == WmKeyUp || message == WmSysKeyUp;
            KeyboardData data = (KeyboardData)Marshal.PtrToStructure(
                dataPointer,
                typeof(KeyboardData));
            int virtualKey = unchecked((int)data.VirtualKey);

            if (virtualKey == VkLeftWindows)
            {
                leftWindowsDown = isDown ? true : isUp ? false : leftWindowsDown;
            }
            else if (virtualKey == VkRightWindows)
            {
                rightWindowsDown = isDown ? true : isUp ? false : rightWindowsDown;
            }

            if (virtualKey == VkF20 &&
                HandlePenShortcut(isDown, isUp, ref f20Handled, "next"))
            {
                return new IntPtr(1);
            }

            if (virtualKey == VkF18 &&
                HandlePenShortcut(isDown, isUp, ref f18Handled, "previous"))
            {
                return new IntPtr(1);
            }
        }

        return CallNextHookEx(hook, code, messagePointer, dataPointer);
    }

    private static bool HandlePenShortcut(
        bool isDown,
        bool isUp,
        ref bool handled,
        string action)
    {
        if (isDown && (leftWindowsDown || rightWindowsDown))
        {
            if (!handled)
            {
                handled = true;
                MaskWindowsMenu();
                WriteNavigate(action);
            }
            return true;
        }

        if (isUp && handled)
        {
            handled = false;
            return true;
        }

        return false;
    }

    private static void MaskWindowsMenu()
    {
        // The pen shortcut's F-key is suppressed, so send an inert key while
        // Win is held to prevent Windows from treating Win-up as a solo press.
        keybd_event(VkMenuMask, 0, 0, UIntPtr.Zero);
        keybd_event(VkMenuMask, 0, KeyEventKeyUp, UIntPtr.Zero);
    }

    private static bool IsProcessAlive(int processId)
    {
        try
        {
            using (Process process = Process.GetProcessById(processId))
            {
                return !process.HasExited;
            }
        }
        catch (ArgumentException)
        {
            return false;
        }
    }

    private static void WriteNavigate(string action)
    {
        WriteLine("{\"type\":\"navigate\",\"action\":\"" + action + "\"}");
    }

    private static void WriteStatus(bool supported)
    {
        WriteLine("{\"type\":\"status\",\"supported\":" +
            (supported ? "true" : "false") + "}");
    }

    private static void WriteError(string message)
    {
        WriteLine("{\"type\":\"error\",\"message\":\"" + EscapeJson(message) + "\"}");
    }

    private static void WriteLine(string value)
    {
        lock (OutputLock)
        {
            Console.Out.WriteLine(value);
            Console.Out.Flush();
        }
    }

    private static string EscapeJson(string value)
    {
        if (String.IsNullOrEmpty(value))
        {
            return String.Empty;
        }

        return value
            .Replace("\\", "\\\\")
            .Replace("\"", "\\\"")
            .Replace("\r", "\\r")
            .Replace("\n", "\\n");
    }

    private delegate IntPtr LowLevelKeyboardProc(
        int code,
        IntPtr messagePointer,
        IntPtr dataPointer);

    [StructLayout(LayoutKind.Sequential)]
    private struct KeyboardData
    {
        public uint VirtualKey;
        public uint ScanCode;
        public uint Flags;
        public uint Time;
        public UIntPtr ExtraInfo;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct Point
    {
        public int X;
        public int Y;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct Message
    {
        public IntPtr Window;
        public uint Id;
        public UIntPtr WParam;
        public IntPtr LParam;
        public uint Time;
        public Point Position;
        public uint Private;
    }

    [DllImport("user32.dll", SetLastError = true)]
    private static extern IntPtr SetWindowsHookEx(
        int hookId,
        LowLevelKeyboardProc callback,
        IntPtr module,
        uint threadId);

    [DllImport("user32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool UnhookWindowsHookEx(IntPtr hookHandle);

    [DllImport("user32.dll")]
    private static extern IntPtr CallNextHookEx(
        IntPtr hookHandle,
        int code,
        IntPtr messagePointer,
        IntPtr dataPointer);

    [DllImport("user32.dll")]
    private static extern void keybd_event(
        byte virtualKey,
        byte scanCode,
        uint flags,
        UIntPtr extraInfo);

    [DllImport("user32.dll", SetLastError = true)]
    private static extern int GetMessage(
        out Message message,
        IntPtr window,
        uint minimumMessage,
        uint maximumMessage);

    [DllImport("user32.dll")]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool TranslateMessage(ref Message message);

    [DllImport("user32.dll")]
    private static extern IntPtr DispatchMessage(ref Message message);

    [DllImport("user32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool PostThreadMessage(
        uint threadId,
        uint message,
        UIntPtr wParam,
        IntPtr lParam);

    [DllImport("kernel32.dll")]
    private static extern uint GetCurrentThreadId();

    [DllImport("kernel32.dll", CharSet = CharSet.Auto)]
    private static extern IntPtr GetModuleHandle(string moduleName);
}
'@

try {
    Add-Type -TypeDefinition $bridgeSource -Language CSharp
    $bridgeLoaded = $true
    exit [PresentationPenHotkeyBridge]::Run($ParentProcessId)
}
catch {
    if ($bridgeLoaded) {
        $message = $_.Exception.GetBaseException().Message
    }
    else {
        $message = "Failed to load the Surface Pen hotkey bridge: " +
            $_.Exception.GetBaseException().Message
    }

    $jsonMessage = $message | ConvertTo-Json -Compress
    [Console]::Out.WriteLine(
        "{`"type`":`"error`",`"message`":$jsonMessage}")
    [Console]::Out.Flush()
    exit 1
}
