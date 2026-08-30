using Microsoft.UI.Windowing;
using Microsoft.UI.Xaml;
using MarkdStageApp.Services;

namespace MarkdStageApp;

public sealed partial class MainWindow : Window
{
    private bool _shutdownStarted;
    private bool _shutdownComplete;

    public MainWindow()
    {
        InitializeComponent();

        ExtendsContentIntoTitleBar = true;
        SetTitleBar(AppTitleBar);
        AppWindow.SetIcon("Assets/AppIcon.ico");
        WindowSizing.ResizeToDips(AppWindow, 1400, 860);
        RootFrame.Navigate(typeof(MainPage));
        AppWindow.Closing += OnClosing;
    }

    private async void OnClosing(AppWindow sender, AppWindowClosingEventArgs args)
    {
        if (_shutdownComplete)
        {
            return;
        }

        args.Cancel = true;
        if (_shutdownStarted)
        {
            return;
        }

        _shutdownStarted = true;
        AppWindow.Hide();
        try
        {
            if (RootFrame.Content is MainPage page)
            {
                await page.ShutdownAsync();
            }
        }
        finally
        {
            _shutdownComplete = true;
            AppWindow.Closing -= OnClosing;
            Close();
        }
    }
}
