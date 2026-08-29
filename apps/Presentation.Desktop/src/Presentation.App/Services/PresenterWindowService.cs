using Microsoft.UI.Xaml;
using Microsoft.Web.WebView2.Core;

namespace PresentationApp.Services;

/// <summary>
/// Owns the lifecycle of the native, in-process presenter <see cref="PresenterWindow"/> that
/// hosts the audience-facing WebView2. Replaces the previous external Edge/Chrome app-mode
/// process launcher: opening/stopping now creates or closes a WinUI window instead of a
/// separate OS process.
/// </summary>
internal sealed class PresenterWindowService : IAsyncDisposable
{
    private CoreWebView2Environment? _environment;
    private PresenterWindow? _window;

    public event EventHandler? StatusChanged;

    /// <summary>
    /// Raised when the presenter window could not initialize its WebView2 (for example, the
    /// WebView2 Runtime is missing). The window is closed automatically after this fires.
    /// </summary>
    public event EventHandler<string>? InitializationFailed;

    public bool IsRunning => _window is not null;

    /// <summary>
    /// Supplies the shared <see cref="CoreWebView2Environment"/> created once by <c>MainPage</c>
    /// so the presenter window reuses the same WebView2 runtime and user data folder instead of
    /// creating its own.
    /// </summary>
    public void SetEnvironment(CoreWebView2Environment environment) => _environment = environment;

    public Task OpenAsync(Uri baseUri)
    {
        if (IsRunning)
        {
            return Task.CompletedTask;
        }

        var environment = _environment
            ?? throw new InvalidOperationException(
                "Microsoft Edge WebView2 Runtime is still initializing. Try again in a moment.");

        var presenterUri = new UriBuilder(baseUri) { Query = "present=1" }.Uri;
        var window = new PresenterWindow(environment, presenterUri);
        window.Closed += OnWindowClosed;
        window.WebViewInitializationFailed += OnWebViewInitializationFailed;
        _window = window;
        window.Activate();

        StatusChanged?.Invoke(this, EventArgs.Empty);
        return Task.CompletedTask;
    }

    public Task StopAsync()
    {
        _window?.Close();
        return Task.CompletedTask;
    }

    public async ValueTask DisposeAsync() => await StopAsync();

    private void OnWindowClosed(object sender, WindowEventArgs args)
    {
        if (!ReferenceEquals(sender, _window))
        {
            return;
        }

        DetachWindow((PresenterWindow)sender);
        StatusChanged?.Invoke(this, EventArgs.Empty);
    }

    private void OnWebViewInitializationFailed(object? sender, string message)
    {
        InitializationFailed?.Invoke(this, message);
        _window?.Close();
    }

    private void DetachWindow(PresenterWindow window)
    {
        window.Closed -= OnWindowClosed;
        window.WebViewInitializationFailed -= OnWebViewInitializationFailed;
        _window = null;
    }
}
