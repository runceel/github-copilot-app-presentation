using System.ComponentModel;
using System.Runtime.InteropServices;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Input;
using Microsoft.Web.WebView2.Core;
using Presentation.Core;
using PresentationApp.Services;
using PresentationApp.ViewModels;
using Windows.System;

namespace PresentationApp;

public sealed partial class MainPage : Page
{
    private readonly PresenterWindowService _presenterWindowService;
    private CoreWebView2Environment? _webViewEnvironment;
    private bool _shutdownStarted;
    private bool _isSlideOverviewDialogOpen;

    public MainPageViewModel ViewModel { get; }

    public MainPage()
    {
        InitializeComponent();

        var session = new PresentationSession();
        _presenterWindowService = new PresenterWindowService(delta =>
        {
            session.NavigateBy(delta);
        });
        var server = new PresentationServer(session, () => _presenterWindowService.IsRunning);
        ViewModel = new MainPageViewModel(
            session,
            server,
            new DeckLoader(new MarkdownDeckParser(), new ThemeService()),
            new DeckWatcher(),
            _presenterWindowService,
            new FilePickerService(),
            () => App.WindowHandle);
        ViewModel.PropertyChanged += OnViewModelPropertyChanged;
        Loaded += OnLoaded;
    }

    public static Visibility InvertVisibility(bool value) =>
        value ? Visibility.Collapsed : Visibility.Visible;

    public static Visibility BoolToVisibility(bool value) =>
        value ? Visibility.Visible : Visibility.Collapsed;

    public static Visibility NextPlaceholderVisibility(bool deckLoaded, bool hasNext) =>
        deckLoaded && hasNext ? Visibility.Collapsed : Visibility.Visible;

    public async ValueTask ShutdownAsync()
    {
        if (_shutdownStarted)
        {
            return;
        }

        _shutdownStarted = true;
        Loaded -= OnLoaded;
        ViewModel.PropertyChanged -= OnViewModelPropertyChanged;
        if (_isSlideOverviewDialogOpen)
        {
            SlideOverviewDialog.Hide();
        }

        CurrentSlideWebView.Close();
        NextSlideWebView.Close();
        await ViewModel.DisposeAsync();
    }

    private async void OnLoaded(object sender, RoutedEventArgs args)
    {
        Loaded -= OnLoaded;
        try
        {
            await ViewModel.InitializeAsync();
            if (_shutdownStarted)
            {
                return;
            }

            var userDataFolder = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                "PresentationApp",
                "WebView2");
            Directory.CreateDirectory(userDataFolder);
            Environment.SetEnvironmentVariable(
                "WEBVIEW2_USER_DATA_FOLDER",
                userDataFolder,
                EnvironmentVariableTarget.Process);
            _webViewEnvironment = await CoreWebView2Environment.CreateAsync();
            if (_shutdownStarted)
            {
                return;
            }

            _presenterWindowService.SetEnvironment(_webViewEnvironment);
            await InitializeWebViewAsync(
                CurrentSlideWebView,
                ViewModel.CurrentPreviewUri,
                _webViewEnvironment);
            await InitializeWebViewAsync(
                NextSlideWebView,
                ViewModel.NextPreviewUri,
                _webViewEnvironment);
            Focus(FocusState.Programmatic);
        }
        catch (Exception error) when (
            error is InvalidOperationException or COMException or IOException)
        {
            if (_shutdownStarted)
            {
                return;
            }

            ViewModel.IsErrorOpen = true;
            ViewModel.ErrorMessage =
                "Microsoft Edge WebView2 Runtime を初期化できませんでした。Runtime と保存先の権限を確認してください。";
        }
        catch (OperationCanceledException) when (_shutdownStarted)
        {
        }
    }

    private async Task InitializeWebViewAsync(
        WebView2 webView,
        Uri? source,
        CoreWebView2Environment environment)
    {
        try
        {
            await webView.EnsureCoreWebView2Async(environment);
            if (_shutdownStarted)
            {
                webView.Close();
                return;
            }

            WebViewPolicy.Configure(webView, () => ViewModel.CurrentPreviewUri);
            if (source is not null)
            {
                webView.Source = source;
            }
        }
        catch (Exception error) when (
            error is InvalidOperationException or COMException)
        {
            if (_shutdownStarted)
            {
                return;
            }

            ViewModel.IsErrorOpen = true;
            ViewModel.ErrorMessage =
                "Microsoft Edge WebView2 Runtime が必要です。Runtime をインストールして再起動してください。";
        }
    }

    private void OnViewModelPropertyChanged(object? sender, PropertyChangedEventArgs args)
    {
        if (args.PropertyName == nameof(MainPageViewModel.CurrentPreviewUri) &&
            ViewModel.CurrentPreviewUri is not null &&
            CurrentSlideWebView.CoreWebView2 is not null)
        {
            CurrentSlideWebView.Source = ViewModel.CurrentPreviewUri;
        }
        else if (args.PropertyName == nameof(MainPageViewModel.NextPreviewUri) &&
                 ViewModel.NextPreviewUri is not null &&
                 NextSlideWebView.CoreWebView2 is not null)
        {
            NextSlideWebView.Source = ViewModel.NextPreviewUri;
        }
    }

    private void OnPageKeyDown(object sender, KeyRoutedEventArgs args)
    {
        if (args.Handled || args.KeyStatus.IsMenuKeyDown || _isSlideOverviewDialogOpen)
        {
            return;
        }

        switch (args.Key)
        {
            case VirtualKey.Home:
                ViewModel.GoHome();
                args.Handled = true;
                break;
            case VirtualKey.End:
                ViewModel.GoEnd();
                args.Handled = true;
                break;
        }
    }

    private async void OnSlideOverviewClick(object sender, RoutedEventArgs args)
    {
        if (_isSlideOverviewDialogOpen || !ViewModel.IsDeckLoaded)
        {
            return;
        }

        _isSlideOverviewDialogOpen = true;
        SlideOverviewDialog.XamlRoot = XamlRoot;
        try
        {
            await SlideOverviewDialog.ShowAsync();
        }
        finally
        {
            _isSlideOverviewDialogOpen = false;
            if (!_shutdownStarted)
            {
                Focus(FocusState.Programmatic);
            }
        }
    }

    private void OnSlideOverviewDialogOpened(
        ContentDialog sender,
        ContentDialogOpenedEventArgs args) =>
        DispatcherQueue.TryEnqueue(FocusCurrentSlideOverview);

    private void OnSlideOverviewItemClick(object sender, ItemClickEventArgs args)
    {
        if (args.ClickedItem is not SlideOverviewItem item)
        {
            return;
        }

        ViewModel.NavigateToSlide(item.Index);
        SlideOverviewDialog.Hide();
    }

    private void FocusCurrentSlideOverview()
    {
        var index = ViewModel.CurrentSlideIndex;
        if (index < 0 || index >= ViewModel.SlideOverviews.Count)
        {
            SlideOverviewListView.Focus(FocusState.Programmatic);
            return;
        }

        var currentItem = ViewModel.SlideOverviews[index];
        SlideOverviewListView.SelectedItem = currentItem;
        SlideOverviewListView.ScrollIntoView(currentItem, ScrollIntoViewAlignment.Leading);
        SlideOverviewListView.UpdateLayout();

        if (SlideOverviewListView.ContainerFromItem(currentItem) is ListViewItem container)
        {
            container.Focus(FocusState.Programmatic);
        }
        else
        {
            SlideOverviewListView.Focus(FocusState.Programmatic);
        }
    }

    private void OnPreviewBorderSizeChanged(object sender, SizeChangedEventArgs args)
    {
        const double ratio = 16d / 9d;
        var width = Math.Max(0, args.NewSize.Width - 2);
        var height = Math.Max(0, args.NewSize.Height - 2);
        if (height > 0 && width / height > ratio)
        {
            width = height * ratio;
        }
        else if (width > 0)
        {
            height = width / ratio;
        }

        var host = ReferenceEquals(sender, CurrentPreviewBorder)
            ? CurrentAspectHost
            : NextAspectHost;
        host.Width = width;
        host.Height = height;
    }
}
