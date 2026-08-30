namespace MarkdStage.Core;

public sealed class PresentationSession
{
    private readonly object _gate = new();
    private PresentationSnapshot _snapshot =
        new([], 0, 0, 0, string.Empty, string.Empty, new ThemeState("dark"));

    public event EventHandler<PresentationSnapshot>? Changed;

    public PresentationSnapshot GetSnapshot()
    {
        lock (_gate)
        {
            return _snapshot;
        }
    }

    public PresentationSnapshot Load(
        DeckDocument document,
        string sourcePath,
        string workspaceRoot,
        ThemeState? theme = null)
    {
        PresentationSnapshot next;
        lock (_gate)
        {
            var index = document.Slides.Count == 0
                ? 0
                : Math.Clamp(_snapshot.Index, 0, document.Slides.Count - 1);

            next = new PresentationSnapshot(
                document.Slides.ToArray(),
                index,
                _snapshot.Version + 1,
                _snapshot.DeckVersion + 1,
                sourcePath,
                workspaceRoot,
                theme ?? new ThemeState(document.Theme));
            _snapshot = next;
        }

        Changed?.Invoke(this, next);
        return next;
    }

    public bool NavigateBy(int delta) => NavigateTo(GetSnapshot().Index + delta);

    public bool NavigateTo(int index)
    {
        PresentationSnapshot? next = null;
        lock (_gate)
        {
            if (_snapshot.Total == 0)
            {
                return false;
            }

            var target = Math.Clamp(index, 0, _snapshot.Total - 1);
            if (target == _snapshot.Index)
            {
                return false;
            }

            next = _snapshot with
            {
                Index = target,
                Version = _snapshot.Version + 1,
            };
            _snapshot = next;
        }

        Changed?.Invoke(this, next);
        return true;
    }
}
