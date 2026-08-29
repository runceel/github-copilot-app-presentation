namespace PresentationApp.Services;

internal sealed class DeckWatcher : IAsyncDisposable
{
    private readonly object _gate = new();
    private FileSystemWatcher? _watcher;
    private CancellationTokenSource? _debounce;
    private CancellationTokenSource? _lifetime;
    private int _generation;
    private string _targetName = string.Empty;
    private Func<CancellationToken, Task>? _reload;
    private Task _activeTasks = Task.CompletedTask;

    public async Task WatchAsync(string path, Func<CancellationToken, Task> reload)
    {
        await StopAsync();

        var fullPath = Path.GetFullPath(path);
        _targetName = Path.GetFileName(fullPath);
        _reload = reload;
        _lifetime = new CancellationTokenSource();
        _generation++;

        var watcher = new FileSystemWatcher(Path.GetDirectoryName(fullPath)!)
        {
            IncludeSubdirectories = false,
            NotifyFilter =
                NotifyFilters.FileName |
                NotifyFilters.LastWrite |
                NotifyFilters.Size |
                NotifyFilters.CreationTime,
            EnableRaisingEvents = true,
        };

        watcher.Changed += OnChanged;
        watcher.Created += OnChanged;
        watcher.Deleted += OnChanged;
        watcher.Renamed += OnRenamed;
        watcher.Error += OnError;
        _watcher = watcher;
    }

    public async ValueTask StopAsync()
    {
        Task activeTasks;
        lock (_gate)
        {
            _generation++;
            _debounce?.Cancel();
            _debounce?.Dispose();
            _debounce = null;
            _lifetime?.Cancel();
            _lifetime?.Dispose();
            _lifetime = null;

            if (_watcher is not null)
            {
                _watcher.EnableRaisingEvents = false;
                _watcher.Changed -= OnChanged;
                _watcher.Created -= OnChanged;
                _watcher.Deleted -= OnChanged;
                _watcher.Renamed -= OnRenamed;
                _watcher.Error -= OnError;
                _watcher.Dispose();
                _watcher = null;
            }

            activeTasks = _activeTasks;
            _activeTasks = Task.CompletedTask;
        }

        try
        {
            await activeTasks;
        }
        catch (OperationCanceledException)
        {
        }
    }

    public ValueTask DisposeAsync() => StopAsync();

    private void OnChanged(object sender, FileSystemEventArgs args)
    {
        if (SameFileName(args.Name, _targetName))
        {
            Schedule();
        }
    }

    private void OnRenamed(object sender, RenamedEventArgs args)
    {
        if (SameFileName(args.Name, _targetName) ||
            SameFileName(args.OldName, _targetName))
        {
            Schedule();
        }
    }

    private void OnError(object sender, ErrorEventArgs args) => Schedule();

    private void Schedule()
    {
        lock (_gate)
        {
            if (_lifetime is null)
            {
                return;
            }

            _debounce?.Cancel();
            _debounce?.Dispose();
            var debounce = CancellationTokenSource.CreateLinkedTokenSource(_lifetime.Token);
            _debounce = debounce;
            var generation = _generation;
            var reload = _reload;
            var lifetimeToken = _lifetime.Token;
            var task = Task.Run(async () =>
            {
                try
                {
                    await Task.Delay(160, debounce.Token);
                    if (reload is null || generation != Volatile.Read(ref _generation))
                    {
                        return;
                    }

                    await reload(lifetimeToken);
                }
                catch (OperationCanceledException) when (debounce.IsCancellationRequested)
                {
                }
            });
            _activeTasks = Task.WhenAll(_activeTasks, task);
        }
    }

    private static bool SameFileName(string? left, string right) =>
        string.IsNullOrEmpty(left) ||
        left.Equals(right, StringComparison.OrdinalIgnoreCase);
}
