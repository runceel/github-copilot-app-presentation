using System.Runtime.InteropServices;
using Microsoft.UI.Windowing;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Input;
using Microsoft.Web.WebView2.Core;
using PresentationApp.Services;
using Windows.System;

namespace PresentationApp;

/// <summary>
/// Native, in-process audience window with a full-bleed XAML WebView2.
/// </summary>
public sealed partial class PresenterWindow : Window
{
    private const int InitialWidthDip = 1280;
    private const int InitialHeightDip = 720;
    private const string PresenterShortcutScript =
        """
        let presentationHostFullScreen = false;
        window.chrome.webview.addEventListener("message", event => {
          presentationHostFullScreen = event.data === "fullscreen";
        });
        document.addEventListener("keydown", event => {
          if (event.repeat) return;
          if (event.key !== "F11" && !(event.key === "Escape" && presentationHostFullScreen)) {
            return;
          }
          window.chrome.webview.postMessage(event.key);
          event.preventDefault();
        }, true);
        """;
    private static readonly TimeSpan NavigationTimeout = TimeSpan.FromSeconds(10);

    private readonly CoreWebView2Environment _environment;
    private readonly Uri _presenterUri;
    private readonly CancellationTokenSource _lifetime = new();
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

        AppWindow.SetIcon("Assets/AppIcon.ico");
        WindowSizing.ResizeToDips(AppWindow, InitialWidthDip, InitialHeightDip);
        Activated += OnActivated;
        Closed += OnClosed;
    }

    public Task InitializeAsync() =>
        _initializationTask ??= InitializeWebViewAsync();

    private async Task InitializeWebViewAsync()
    {
        try
        {
            await PresenterWebView.EnsureCoreWebView2Async(_environment);
            if (_closed)
            {
                PresenterWebView.Close();
                return;
            }

            WebViewPolicy.Configure(PresenterWebView, () => _presenterUri);
            var webView = PresenterWebView.CoreWebView2;
            webView.Settings.AreBrowserAcceleratorKeysEnabled = false;
            webView.WebMessageReceived += OnWebMessageReceived;
            await webView.AddScriptToExecuteOnDocumentCreatedAsync(PresenterShortcutScript);
            if (_closed)
            {
                return;
            }

            webView.ProcessFailed += OnProcessFailed;
            webView.NavigationCompleted += OnPresenterNavigationCompleted;
            var navigationCompleted =
                new TaskCompletionSource<CoreWebView2NavigationCompletedEventArgs>(
                    TaskCreationOptions.RunContinuationsAsynchronously);
            void OnNavigationCompleted(
                CoreWebView2 sender,
                CoreWebView2NavigationCompletedEventArgs args) =>
                navigationCompleted.TrySetResult(args);

            webView.NavigationCompleted += OnNavigationCompleted;
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

            PresenterWebView.Focus(FocusState.Programmatic);
        }
        catch (OperationCanceledException) when (_closed)
        {
        }
        catch (InvalidOperationException) when (_closed)
        {
        }
        catch (COMException) when (_closed)
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

    private void OnHostKeyDown(object sender, KeyRoutedEventArgs args)
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
        if (args.WindowActivationState != WindowActivationState.Deactivated)
        {
            PresenterWebView.Focus(FocusState.Programmatic);
        }
    }

    private void OnProcessFailed(CoreWebView2 sender, CoreWebView2ProcessFailedEventArgs args) =>
        WebViewInitializationFailed?.Invoke(
            this,
            "発表画面の WebView2 プロセスが停止しました。発表画面を開き直してください。");

    private void OnPresenterNavigationCompleted(
        CoreWebView2 sender,
        CoreWebView2NavigationCompletedEventArgs args)
    {
        if (args.IsSuccess &&
            Uri.TryCreate(sender.Source, UriKind.Absolute, out var source) &&
            source == _presenterUri)
        {
            UpdateShortcutFullScreenState();
        }
    }

    private void OnWebMessageReceived(CoreWebView2 sender, CoreWebView2WebMessageReceivedEventArgs args)
    {
        if (!Uri.TryCreate(args.Source, UriKind.Absolute, out var source) ||
            source != _presenterUri)
        {
            return;
        }

        if (args.WebMessageAsJson == "\"F11\"")
        {
            QueueFullScreenChange(!IsFullScreen);
        }
        else if (args.WebMessageAsJson == "\"Escape\"" && IsFullScreen)
        {
            QueueFullScreenChange(false);
        }
    }

    private void OnClosed(object sender, WindowEventArgs args)
    {
        _closed = true;
        _lifetime.Cancel();
        Closed -= OnClosed;
        Activated -= OnActivated;
        if (PresenterWebView.CoreWebView2 is not null)
        {
            PresenterWebView.CoreWebView2.ProcessFailed -= OnProcessFailed;
            PresenterWebView.CoreWebView2.WebMessageReceived -= OnWebMessageReceived;
            PresenterWebView.CoreWebView2.NavigationCompleted -= OnPresenterNavigationCompleted;
        }
        PresenterWebView.Close();
        _lifetime.Dispose();
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

                    PresenterWebView.Focus(FocusState.Programmatic);
                    UpdateShortcutFullScreenState();
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

    private void UpdateShortcutFullScreenState()
    {
        PresenterWebView.CoreWebView2?.PostWebMessageAsString(
            IsFullScreen ? "fullscreen" : "windowed");
    }
}
