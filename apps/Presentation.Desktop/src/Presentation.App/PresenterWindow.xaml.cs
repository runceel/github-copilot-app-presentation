using System.Runtime.InteropServices;
using Microsoft.UI.Windowing;
using Microsoft.UI.Xaml;
using Microsoft.Web.WebView2.Core;
using PresentationApp.Services;
using Windows.Foundation;
using Windows.System;
using Windows.UI;

namespace PresentationApp;

/// <summary>
/// Native, in-process audience window: a full-bleed WebView2 hosted in a standard WinUI 3
/// <see cref="Window"/>. Replaces the previous external Edge/Chrome app-mode process.
/// </summary>
public sealed partial class PresenterWindow : Window
{
    private const int InitialWidthDip = 1280;
    private const int InitialHeightDip = 720;

    private readonly CoreWebView2Environment _environment;
    private readonly Uri _presenterUri;
    private readonly nint _windowHandle;
    private CoreWebView2Controller? _controller;
    private bool _closed;
    private bool _isFullScreen;

    /// <summary>
    /// Raised when the WebView2 could not be initialized (for example, the WebView2 Runtime is
    /// missing). The caller is expected to close the window and surface the message to the user.
    /// </summary>
    public event EventHandler<string>? WebViewInitializationFailed;

    public PresenterWindow(CoreWebView2Environment environment, Uri presenterUri)
    {
        InitializeComponent();
        _environment = environment;
        _presenterUri = presenterUri;
        _windowHandle = WinRT.Interop.WindowNative.GetWindowHandle(this);

        AppWindow.SetIcon("Assets/AppIcon.ico");
        WindowSizing.ResizeToDips(AppWindow, InitialWidthDip, InitialHeightDip);
        AppWindow.Changed += OnAppWindowChanged;
        Closed += OnClosed;

        _ = InitializeWebViewAsync();
    }

    private async Task InitializeWebViewAsync()
    {
        try
        {
            var windowReference =
                CoreWebView2ControllerWindowReference.CreateFromWindowHandle(
                    unchecked((ulong)_windowHandle));
            var controller = await _environment.CreateCoreWebView2ControllerAsync(windowReference);
            if (_closed)
            {
                controller.Close();
                return;
            }

            _controller = controller;
            controller.AcceleratorKeyPressed += OnAcceleratorKeyPressed;
            controller.DefaultBackgroundColor = Color.FromArgb(255, 0, 0, 0);
            ResizeWebView();

            var webView = controller.CoreWebView2;
            WebViewPolicy.Configure(webView, () => _presenterUri);
            webView.ProcessFailed += OnProcessFailed;
            webView.Navigate(_presenterUri.AbsoluteUri);
            controller.IsVisible = true;
            controller.MoveFocus(CoreWebView2MoveFocusReason.Programmatic);
        }
        catch (Exception error) when (
            error is InvalidOperationException or COMException)
        {
            if (!_closed)
            {
                WebViewInitializationFailed?.Invoke(
                    this,
                    "Microsoft Edge WebView2 Runtime が必要です。Runtime をインストールして再起動してください。");
            }
        }
    }

    private void OnAcceleratorKeyPressed(
        CoreWebView2Controller sender,
        CoreWebView2AcceleratorKeyPressedEventArgs args)
    {
        if (args.KeyEventKind is not (
            CoreWebView2KeyEventKind.KeyDown or
            CoreWebView2KeyEventKind.SystemKeyDown))
        {
            return;
        }

        if (args.VirtualKey == (uint)VirtualKey.F11)
        {
            SetFullScreen(!_isFullScreen);
            args.Handled = true;
        }
        else if (args.VirtualKey == (uint)VirtualKey.Escape && _isFullScreen)
        {
            SetFullScreen(false);
            args.Handled = true;
        }
    }

    private void OnAppWindowChanged(AppWindow sender, AppWindowChangedEventArgs args)
    {
        if (args.DidSizeChange)
        {
            ResizeWebView();
        }
    }

    private void OnProcessFailed(CoreWebView2 sender, CoreWebView2ProcessFailedEventArgs args) =>
        WebViewInitializationFailed?.Invoke(
            this,
            "発表画面の WebView2 プロセスが停止しました。発表画面を開き直してください。");

    private void OnClosed(object sender, WindowEventArgs args)
    {
        _closed = true;
        Closed -= OnClosed;
        AppWindow.Changed -= OnAppWindowChanged;
        if (_controller is not null)
        {
            _controller.CoreWebView2.ProcessFailed -= OnProcessFailed;
            _controller.AcceleratorKeyPressed -= OnAcceleratorKeyPressed;
            _controller.Close();
            _controller = null;
        }
    }

    private void ResizeWebView()
    {
        if (_controller is null ||
            !GetClientRect(_windowHandle, out var clientRect))
        {
            return;
        }

        _controller.Bounds = new Rect(
            clientRect.Left,
            clientRect.Top,
            clientRect.Right - clientRect.Left,
            clientRect.Bottom - clientRect.Top);
    }

    private void SetFullScreen(bool enable)
    {
        if (enable == _isFullScreen)
        {
            return;
        }

        _isFullScreen = enable;
        AppWindow.SetPresenter(
            enable ? AppWindowPresenterKind.FullScreen : AppWindowPresenterKind.Default);
        _controller?.MoveFocus(CoreWebView2MoveFocusReason.Programmatic);
    }

    [DllImport("user32.dll")]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool GetClientRect(nint windowHandle, out NativeRect clientRect);

    [StructLayout(LayoutKind.Sequential)]
    private struct NativeRect
    {
        public int Left;
        public int Top;
        public int Right;
        public int Bottom;
    }
}
