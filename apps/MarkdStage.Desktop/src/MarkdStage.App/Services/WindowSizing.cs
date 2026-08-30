using System.Runtime.InteropServices;
using Microsoft.UI;
using Microsoft.UI.Windowing;
using Windows.Graphics;

namespace MarkdStageApp.Services;

/// <summary>
/// Resizes an <see cref="AppWindow"/> using DIP measurements, converting them to the
/// physical pixels <see cref="AppWindow.Resize(SizeInt32)"/> expects for the window's
/// current monitor DPI. Shared by <c>MainWindow</c> and <c>PresenterWindow</c> so the
/// DPI lookup is not duplicated per window.
/// </summary>
internal static class WindowSizing
{
    public static void ResizeToDips(AppWindow appWindow, double widthDip, double heightDip)
    {
        var windowHandle = Win32Interop.GetWindowFromWindowId(appWindow.Id);
        var scale = GetDpiForWindow(windowHandle) / 96d;
        appWindow.Resize(new SizeInt32(
            (int)Math.Round(widthDip * scale),
            (int)Math.Round(heightDip * scale)));
    }

    [DllImport("user32.dll")]
    private static extern uint GetDpiForWindow(nint windowHandle);
}
