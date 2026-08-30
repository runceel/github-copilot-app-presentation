using System.Collections.ObjectModel;
using System.ComponentModel;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using MarkdStage.Core;
using MarkdStageApp.Services;

namespace MarkdStageApp.ViewModels;

public sealed partial class MainPageViewModel : ObservableObject, IAsyncDisposable
{
    private readonly PresentationSession _session;
    private readonly PresentationServer _server;
    private readonly DeckLoader _loader;
    private readonly DeckWatcher _watcher;
    private readonly PresenterWindowService _presenterWindow;
    private readonly FilePickerService _filePicker;
    private readonly Func<nint> _windowHandle;
    private readonly SynchronizationContext _uiContext;
    private readonly SemaphoreSlim _loadGate = new(1, 1);
    private readonly ObservableCollection<SlideOverviewItem> _slideOverviews = [];
    private string _currentPath = string.Empty;
    private long _slideOverviewDeckVersion = -1;

    internal MainPageViewModel(
        PresentationSession session,
        PresentationServer server,
        DeckLoader loader,
        DeckWatcher watcher,
        PresenterWindowService presenterWindow,
        FilePickerService filePicker,
        Func<nint> windowHandle)
    {
        _session = session;
        _server = server;
        _loader = loader;
        _watcher = watcher;
        _presenterWindow = presenterWindow;
        _filePicker = filePicker;
        _windowHandle = windowHandle;
        _uiContext = SynchronizationContext.Current
            ?? throw new InvalidOperationException("The presenter must be created on the UI thread.");
        SlideOverviews = new ReadOnlyObservableCollection<SlideOverviewItem>(_slideOverviews);

        _session.Changed += OnSessionChanged;
        _presenterWindow.StatusChanged += OnPresenterStatusChanged;
        _presenterWindow.InitializationFailed += OnPresenterInitializationFailed;
    }

    [ObservableProperty]
    public partial Uri? CurrentPreviewUri { get; set; }

    [ObservableProperty]
    public partial Uri? NextPreviewUri { get; set; }

    [ObservableProperty]
    public partial string SourceDisplayName { get; set; } = "No Markdown file selected";

    [ObservableProperty]
    public partial string PageCounter { get; set; } = "0 / 0";

    [ObservableProperty]
    public partial string CurrentSpeakerNotes { get; set; } = "No speaker notes";

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
    public partial int CurrentSlideIndex { get; set; } = -1;

    [ObservableProperty]
    public partial string PresenterButtonText { get; set; } = "Start presentation";

    public ReadOnlyObservableCollection<SlideOverviewItem> SlideOverviews { get; }

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
            if (_presenterWindow.IsRunning)
            {
                await _presenterWindow.StopAsync();
            }
            else
            {
                var baseUri = _server.BaseUri
                    ?? throw new InvalidOperationException("The presentation server is not ready.");
                await _presenterWindow.OpenAsync(baseUri);
            }
        }
        catch (InvalidOperationException error)
        {
            ShowError(error.Message);
        }
    }

    public void GoHome() => _session.NavigateTo(0);

    public bool NavigateToSlide(int index) => _session.NavigateTo(index);

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
        _presenterWindow.StatusChanged -= OnPresenterStatusChanged;
        _presenterWindow.InitializationFailed -= OnPresenterInitializationFailed;
        await _watcher.DisposeAsync();
        await _presenterWindow.DisposeAsync();
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
            ShowError("You don't have permission to read this Markdown file.");
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
            ShowError($"{error.Message} The last successfully rendered deck is still displayed.");
        }
        catch (UnauthorizedAccessException)
        {
            ShowError("The Markdown file couldn't be read. The last successfully rendered deck is still displayed.");
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
            Query = offset == 0
                ? "preview=1&offset=0&navigate=1"
                : $"preview=1&offset={offset}",
        }.Uri;
    }

    private void OnSessionChanged(object? sender, PresentationSnapshot snapshot) =>
        PostToUi(() => ApplySnapshot(snapshot));

    private void OnPresenterStatusChanged(object? sender, EventArgs args) =>
        PostToUi(UpdatePresenterStatus);

    private void OnPresenterInitializationFailed(object? sender, string message) =>
        ShowError(message);

    private void ApplySnapshot(PresentationSnapshot snapshot)
    {
        if (_slideOverviewDeckVersion != snapshot.DeckVersion)
        {
            _slideOverviewDeckVersion = snapshot.DeckVersion;
            CurrentSlideIndex = -1;
            _slideOverviews.Clear();
            for (var index = 0; index < snapshot.Slides.Count; index++)
            {
                _slideOverviews.Add(new SlideOverviewItem(
                    index,
                    index + 1,
                    SlideTitleDeriver.Derive(snapshot.Slides[index])));
            }
        }

        IsDeckLoaded = snapshot.Total > 0;
        CurrentSlideIndex = snapshot.Total > 0 ? snapshot.Index : -1;
        HasNextSlide = snapshot.HasNext;
        PageCounter = snapshot.Total == 0
            ? "0 / 0"
            : $"{snapshot.Index + 1} / {snapshot.Total}";
        var notes = SpeakerNotesExtractor.Extract(snapshot.CurrentMarkdown);
        CurrentSpeakerNotes = string.IsNullOrWhiteSpace(notes)
            ? "No speaker notes"
            : notes;
        PreviousCommand.NotifyCanExecuteChanged();
        NextCommand.NotifyCanExecuteChanged();
        TogglePresentationCommand.NotifyCanExecuteChanged();
    }

    private void UpdatePresenterStatus()
    {
        IsPresenterRunning = _presenterWindow.IsRunning;
        PresenterButtonText = IsPresenterRunning ? "End presentation" : "Start presentation";
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

public sealed record SlideOverviewItem(int Index, int PageNumber, string Title)
{
    public string AccessibleName => $"Page {PageNumber}, {Title}";
}
