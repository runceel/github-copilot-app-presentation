using System.ComponentModel;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using Presentation.Core;
using PresentationApp.Services;

namespace PresentationApp.ViewModels;

public sealed partial class MainPageViewModel : ObservableObject, IAsyncDisposable
{
    private readonly PresentationSession _session;
    private readonly PresentationServer _server;
    private readonly DeckLoader _loader;
    private readonly DeckWatcher _watcher;
    private readonly BrowserPresenterService _browserPresenter;
    private readonly FilePickerService _filePicker;
    private readonly Func<nint> _windowHandle;
    private readonly SynchronizationContext _uiContext;
    private readonly SemaphoreSlim _loadGate = new(1, 1);
    private string _currentPath = string.Empty;

    internal MainPageViewModel(
        PresentationSession session,
        PresentationServer server,
        DeckLoader loader,
        DeckWatcher watcher,
        BrowserPresenterService browserPresenter,
        FilePickerService filePicker,
        Func<nint> windowHandle)
    {
        _session = session;
        _server = server;
        _loader = loader;
        _watcher = watcher;
        _browserPresenter = browserPresenter;
        _filePicker = filePicker;
        _windowHandle = windowHandle;
        _uiContext = SynchronizationContext.Current
            ?? throw new InvalidOperationException("The presenter must be created on the UI thread.");

        _session.Changed += OnSessionChanged;
        _browserPresenter.StatusChanged += OnPresenterStatusChanged;
    }

    [ObservableProperty]
    public partial Uri? CurrentPreviewUri { get; set; }

    [ObservableProperty]
    public partial Uri? NextPreviewUri { get; set; }

    [ObservableProperty]
    public partial string SourceDisplayName { get; set; } = "Markdown が選択されていません";

    [ObservableProperty]
    public partial string PageCounter { get; set; } = "0 / 0";

    [ObservableProperty]
    public partial string ErrorMessage { get; set; } = string.Empty;

    [ObservableProperty]
    public partial bool IsErrorOpen { get; set; }

    [ObservableProperty]
    public partial bool IsDeckLoaded { get; set; }

    [ObservableProperty]
    public partial bool HasNextSlide { get; set; }

    [ObservableProperty]
    public partial bool IsPresenterRunning { get; set; }

    [ObservableProperty]
    public partial string PresenterButtonText { get; set; } = "発表を開始";

    public async Task InitializeAsync()
    {
        try
        {
            await _server.StartAsync();
            CurrentPreviewUri = BuildPreviewUri(offset: 0);
            NextPreviewUri = BuildPreviewUri(offset: 1);
        }
        catch (Exception error) when (
            error is InvalidOperationException or IOException or InvalidDataException)
        {
            ShowError(error.Message);
        }
    }

    [RelayCommand]
    private async Task OpenMarkdownAsync()
    {
        var path = await _filePicker.PickMarkdownAsync(_windowHandle());
        if (path is not null)
        {
            await LoadPathAsync(path, startWatching: true);
        }
    }

    [RelayCommand(CanExecute = nameof(CanGoPrevious))]
    private void Previous() => _session.NavigateBy(-1);

    [RelayCommand(CanExecute = nameof(CanGoNext))]
    private void Next() => _session.NavigateBy(1);

    [RelayCommand(CanExecute = nameof(CanTogglePresentation))]
    private async Task TogglePresentationAsync()
    {
        try
        {
            if (_browserPresenter.IsRunning)
            {
                await _browserPresenter.StopAsync();
            }
            else
            {
                var baseUri = _server.BaseUri
                    ?? throw new InvalidOperationException("The presentation server is not ready.");
                await _browserPresenter.OpenAsync(baseUri);
            }
        }
        catch (InvalidOperationException error)
        {
            ShowError(error.Message);
        }
    }

    public void GoHome() => _session.NavigateTo(0);

    public void GoEnd()
    {
        var snapshot = _session.GetSnapshot();
        if (snapshot.Total > 0)
        {
            _session.NavigateTo(snapshot.Total - 1);
        }
    }

    public async ValueTask DisposeAsync()
    {
        _session.Changed -= OnSessionChanged;
        _browserPresenter.StatusChanged -= OnPresenterStatusChanged;
        await _watcher.DisposeAsync();
        await _browserPresenter.DisposeAsync();
        await _server.DisposeAsync();
        _loadGate.Dispose();
    }

    private async Task LoadPathAsync(string path, bool startWatching)
    {
        LoadedDeck? loaded = null;
        await _loadGate.WaitAsync();
        try
        {
            loaded = await _loader.LoadAsync(path);
            _session.Load(
                loaded.Document,
                loaded.SourcePath,
                loaded.WorkspaceRoot,
                loaded.Theme);
            _currentPath = loaded.SourcePath;

            PostToUi(() =>
            {
                SourceDisplayName = Path.GetFileName(loaded.SourcePath);
                IsErrorOpen = false;
                ErrorMessage = string.Empty;
            });
        }
        catch (DeckLoadException error)
        {
            ShowError(error.Message);
        }
        catch (UnauthorizedAccessException)
        {
            ShowError("Markdown を読み取る権限がありません。");
        }
        finally
        {
            _loadGate.Release();
        }

        if (startWatching && loaded is not null)
        {
            await _watcher.WatchAsync(
                loaded.SourcePath,
                cancellationToken => ReloadWatchedFileAsync(loaded.SourcePath, cancellationToken));
        }
    }

    private async Task ReloadWatchedFileAsync(string path, CancellationToken cancellationToken)
    {
        await _loadGate.WaitAsync(cancellationToken);
        try
        {
            if (!_currentPath.Equals(path, StringComparison.OrdinalIgnoreCase))
            {
                return;
            }

            var loaded = await _loader.LoadAsync(path, cancellationToken);
            _session.Load(
                loaded.Document,
                loaded.SourcePath,
                loaded.WorkspaceRoot,
                loaded.Theme);
            PostToUi(() =>
            {
                IsErrorOpen = false;
                ErrorMessage = string.Empty;
            });
        }
        catch (DeckLoadException error)
        {
            ShowError($"{error.Message} 最後に正常表示できたスライドを保持しています。");
        }
        catch (UnauthorizedAccessException)
        {
            ShowError("Markdown を読み取れません。最後に正常表示できたスライドを保持しています。");
        }
        finally
        {
            _loadGate.Release();
        }
    }

    private bool CanGoPrevious() =>
        IsDeckLoaded && _session.GetSnapshot().Index > 0;

    private bool CanGoNext() =>
        IsDeckLoaded && _session.GetSnapshot().HasNext;

    private bool CanTogglePresentation() =>
        IsDeckLoaded && _server.BaseUri is not null;

    private Uri BuildPreviewUri(int offset)
    {
        var baseUri = _server.BaseUri
            ?? throw new InvalidOperationException("The presentation server is not ready.");
        return new UriBuilder(baseUri)
        {
            Query = $"preview=1&offset={offset}",
        }.Uri;
    }

    private void OnSessionChanged(object? sender, PresentationSnapshot snapshot) =>
        PostToUi(() => ApplySnapshot(snapshot));

    private void OnPresenterStatusChanged(object? sender, EventArgs args) =>
        PostToUi(UpdatePresenterStatus);

    private void ApplySnapshot(PresentationSnapshot snapshot)
    {
        IsDeckLoaded = snapshot.Total > 0;
        HasNextSlide = snapshot.HasNext;
        PageCounter = snapshot.Total == 0
            ? "0 / 0"
            : $"{snapshot.Index + 1} / {snapshot.Total}";
        PreviousCommand.NotifyCanExecuteChanged();
        NextCommand.NotifyCanExecuteChanged();
        TogglePresentationCommand.NotifyCanExecuteChanged();
    }

    private void UpdatePresenterStatus()
    {
        IsPresenterRunning = _browserPresenter.IsRunning;
        PresenterButtonText = IsPresenterRunning ? "発表を終了" : "発表を開始";
    }

    private void ShowError(string message) =>
        PostToUi(() =>
        {
            ErrorMessage = message;
            IsErrorOpen = true;
        });

    private void PostToUi(Action action)
    {
        if (SynchronizationContext.Current == _uiContext)
        {
            action();
            return;
        }

        _uiContext.Post(_ => action(), null);
    }
}
