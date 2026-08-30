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
    private static readonly TimeSpan NavigationTimeout = TimeSpan.FromSeconds(10);

    private readonly CoreWebView2Environment _environment;
    private readonly Uri _presenterUri;
    private readonly nint _windowHandle;
    private readonly CancellationTokenSource _lifetime = new();
    private CoreWebView2Controller? _controller;
    private Task? _initializationTask;
    private bool _closed;
    private bool _fullScreenRequestQueued;

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
        Activated += OnActivated;
        Closed += OnClosed;
    }

    public Task InitializeAsync() =>
        _initializationTask ??= InitializeWebViewAsync();

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
            UpdateControllerBounds();

            // This host creates the initialized Win32 controller directly; WUI4001 only recognizes
            // the XAML WebView2 EnsureCoreWebView2Async initialization pattern.
#pragma warning disable WUI4001
            var webView = controller.CoreWebView2;
#pragma warning restore WUI4001
            WebViewPolicy.Configure(webView, () => _presenterUri);
            webView.ProcessFailed += OnProcessFailed;
            var navigationCompleted =
                new TaskCompletionSource<CoreWebView2NavigationCompletedEventArgs>(
                    TaskCreationOptions.RunContinuationsAsynchronously);
            void OnNavigationCompleted(
                CoreWebView2 sender,
                CoreWebView2NavigationCompletedEventArgs args) =>
                navigationCompleted.TrySetResult(args);

            webView.NavigationCompleted += OnNavigationCompleted;
            controller.IsVisible = true;
            webView.Navigate(_presenterUri.AbsoluteUri);
            CoreWebView2NavigationCompletedEventArgs navigation;
            try
            {
                navigation = await navigationCompleted.Task.WaitAsync(
                    NavigationTimeout,
                    _lifetime.Token);
            }
            finally
            {
                webView.NavigationCompleted -= OnNavigationCompleted;
            }

            if (!navigation.IsSuccess)
            {
                throw new InvalidOperationException(
                    $"The presentation renderer failed to load ({navigation.WebErrorStatus}).");
            }

            UpdateControllerBounds();
            controller.MoveFocus(CoreWebView2MoveFocusReason.Programmatic);
        }
        catch (OperationCanceledException) when (_closed)
        {
        }
        catch (Exception error) when (
            error is InvalidOperationException or COMException or TimeoutException)
        {
            throw new InvalidOperationException(
                "Microsoft Edge WebView2 Runtime を初期化できませんでした。Runtime を確認して発表画面を開き直してください。",
                error);
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
            args.Handled = true;
            if (args.PhysicalKeyStatus.WasKeyDown == 0)
            {
                QueueFullScreenChange(!IsFullScreen);
            }
        }
        else if (args.VirtualKey == (uint)VirtualKey.Escape && IsFullScreen)
        {
            args.Handled = true;
            if (args.PhysicalKeyStatus.WasKeyDown == 0)
            {
                QueueFullScreenChange(false);
            }
        }
    }

    private void OnHostKeyDown(object sender, Microsoft.UI.Xaml.Input.KeyRoutedEventArgs args)
    {
        if (args.Key == VirtualKey.F11)
        {
            args.Handled = true;
            if (!args.KeyStatus.WasKeyDown)
            {
                QueueFullScreenChange(!IsFullScreen);
            }
        }
        else if (args.Key == VirtualKey.Escape && IsFullScreen)
        {
            args.Handled = true;
            if (!args.KeyStatus.WasKeyDown)
            {
                QueueFullScreenChange(false);
            }
        }
    }

    private void OnActivated(object sender, WindowActivatedEventArgs args)
    {
        if (args.WindowActivationState == WindowActivationState.Deactivated)
        {
            return;
        }

        UpdateControllerBounds();
        if (_controller is null)
        {
            WebViewHost.Focus(Microsoft.UI.Xaml.FocusState.Programmatic);
        }
        else
        {
            _controller.MoveFocus(CoreWebView2MoveFocusReason.Programmatic);
        }
    }

    private void OnAppWindowChanged(AppWindow sender, AppWindowChangedEventArgs args) =>
        UpdateControllerBounds();

    private void OnProcessFailed(CoreWebView2 sender, CoreWebView2ProcessFailedEventArgs args) =>
        WebViewInitializationFailed?.Invoke(
            this,
            "発表画面の WebView2 プロセスが停止しました。発表画面を開き直してください。");

    private void OnClosed(object sender, WindowEventArgs args)
    {
        _closed = true;
        _lifetime.Cancel();
        Closed -= OnClosed;
        Activated -= OnActivated;
        AppWindow.Changed -= OnAppWindowChanged;
        if (_controller is not null)
        {
            _controller.CoreWebView2.ProcessFailed -= OnProcessFailed;
            _controller.AcceleratorKeyPressed -= OnAcceleratorKeyPressed;
            _controller.Close();
            _controller = null;
        }
        _lifetime.Dispose();
    }

    private void UpdateControllerBounds()
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
        _controller.NotifyParentWindowPositionChanged();
    }

    private bool IsFullScreen =>
        AppWindow.Presenter.Kind == AppWindowPresenterKind.FullScreen;

    private void QueueFullScreenChange(bool enable)
    {
        if (_closed || _fullScreenRequestQueued)
        {
            return;
        }

        _fullScreenRequestQueued = true;
        if (!DispatcherQueue.TryEnqueue(() =>
            {
                try
                {
                    if (!_closed && enable != IsFullScreen)
                    {
                        AppWindow.SetPresenter(
                            enable
                                ? AppWindowPresenterKind.FullScreen
                                : AppWindowPresenterKind.Default);
                    }

                    UpdateControllerBounds();
                    _controller?.MoveFocus(CoreWebView2MoveFocusReason.Programmatic);
                }
                finally
                {
                    _fullScreenRequestQueued = false;
                }
            }))
        {
            _fullScreenRequestQueued = false;
        }
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
