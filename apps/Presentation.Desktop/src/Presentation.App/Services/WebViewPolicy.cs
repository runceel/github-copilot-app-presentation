using Microsoft.UI.Xaml.Controls;
using Microsoft.Web.WebView2.Core;

namespace PresentationApp.Services;

/// <summary>
/// Applies the app's safe-browsing policy to a <see cref="WebView2"/> instance: same-origin
/// navigation only, no new-window popups, no DevTools, no context menu. Shared by the
/// preview panes in <c>MainPage</c> and the audience-facing <c>PresenterWindow</c> so the
/// policy is defined once instead of being duplicated (and risking drift) per host.
/// </summary>
/// <remarks>
/// Callers must call <see cref="WebView2.EnsureCoreWebView2Async(CoreWebView2Environment)"/>
/// themselves before invoking <see cref="Configure"/> — keeping that call in the host class lets
/// the WinUI analyzer verify each host's <c>CoreWebView2</c> usage instead of only seeing it here.
/// </remarks>
internal static class WebViewPolicy
{
    // WUI4001 flags any use of CoreWebView2 in a class that doesn't itself call
    // EnsureCoreWebView2Async — it can't see across the caller/helper boundary. Every caller of
    // Configure is required (and, in this codebase, verified) to await EnsureCoreWebView2Async
    // before calling this method, so the WebView2 is always initialized here.
#pragma warning disable WUI4001
    public static void Configure(WebView2 webView, Func<Uri?> allowedOriginProvider)
    {
        Configure(webView.CoreWebView2, allowedOriginProvider);
    }

    public static void Configure(
        CoreWebView2 webView,
        Func<Uri?> allowedOriginProvider)
    {
        webView.Settings.AreDefaultContextMenusEnabled = false;
        webView.Settings.AreDevToolsEnabled = false;
        webView.Settings.IsZoomControlEnabled = false;
        webView.NavigationStarting += (_, args) => EnforceSameOrigin(args, allowedOriginProvider());
        webView.NewWindowRequested += (_, args) => args.Handled = true;
    }
#pragma warning restore WUI4001

    private static void EnforceSameOrigin(
        CoreWebView2NavigationStartingEventArgs args,
        Uri? allowedOrigin)
    {
        if (!Uri.TryCreate(args.Uri, UriKind.Absolute, out var target))
        {
            args.Cancel = true;
            return;
        }

        if (allowedOrigin is null ||
            !target.GetLeftPart(UriPartial.Authority).Equals(
                allowedOrigin.GetLeftPart(UriPartial.Authority),
                StringComparison.OrdinalIgnoreCase))
        {
            args.Cancel = true;
        }
    }
}
