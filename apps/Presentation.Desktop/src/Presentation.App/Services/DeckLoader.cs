using Presentation.Core;

namespace PresentationApp.Services;

internal sealed record LoadedDeck(
    DeckDocument Document,
    ThemeState Theme,
    string SourcePath,
    string WorkspaceRoot);

internal sealed class DeckLoadException : Exception
{
    public DeckLoadException(string message) : base(message)
    {
    }

    public DeckLoadException(string message, Exception innerException)
        : base(message, innerException)
    {
    }
}

internal sealed class DeckLoader(
    MarkdownDeckParser parser,
    ThemeService themeService)
{
    private const long MarkdownMaxBytes = 2 * 1024 * 1024;

    public async Task<LoadedDeck> LoadAsync(
        string path,
        CancellationToken cancellationToken = default)
    {
        var fullPath = Path.GetFullPath(path);
        var extension = Path.GetExtension(fullPath);
        if (!extension.Equals(".md", StringComparison.OrdinalIgnoreCase) &&
            !extension.Equals(".markdown", StringComparison.OrdinalIgnoreCase))
        {
            throw new DeckLoadException("Select a .md or .markdown file.");
        }

        var text = await ReadWithRetryAsync(fullPath, cancellationToken);
        var document = parser.Parse(text);
        if (document.Slides.Count == 0)
        {
            throw new DeckLoadException("Markdown is empty.");
        }

        var workspaceRoot = FindWorkspaceRoot(fullPath);
        var theme = await themeService.LoadAsync(
            document,
            fullPath,
            workspaceRoot,
            cancellationToken);

        return new LoadedDeck(document, theme, fullPath, workspaceRoot);
    }

    private static async Task<string> ReadWithRetryAsync(
        string path,
        CancellationToken cancellationToken)
    {
        IOException? lastError = null;
        for (var attempt = 0; attempt < 5; attempt++)
        {
            cancellationToken.ThrowIfCancellationRequested();
            try
            {
                var before = new FileInfo(path);
                if (!before.Exists)
                {
                    throw new FileNotFoundException("Markdown was not found.", path);
                }
                if (before.Length > MarkdownMaxBytes)
                {
                    throw new DeckLoadException("Markdown must be 2 MiB or smaller.");
                }

                var beforeLength = before.Length;
                var beforeWriteTime = before.LastWriteTimeUtc;
                await using var stream = new FileStream(
                    path,
                    FileMode.Open,
                    FileAccess.Read,
                    FileShare.ReadWrite | FileShare.Delete,
                    64 * 1024,
                    FileOptions.Asynchronous | FileOptions.SequentialScan);

                using var reader = new StreamReader(stream, detectEncodingFromByteOrderMarks: true);
                var text = await reader.ReadToEndAsync(cancellationToken);
                await Task.Delay(40, cancellationToken);

                var after = new FileInfo(path);
                after.Refresh();
                if (!after.Exists ||
                    after.Length != beforeLength ||
                    after.LastWriteTimeUtc != beforeWriteTime)
                {
                    throw new IOException("Markdown changed while it was being read.");
                }

                return text;
            }
            catch (IOException error) when (attempt < 4)
            {
                lastError = error;
                await Task.Delay(50 * (attempt + 1), cancellationToken);
            }
        }

        throw new DeckLoadException(
            File.Exists(path) ? "Markdown could not be read." : "Markdown was not found.",
            lastError ?? new FileNotFoundException("Markdown was not found.", path));
    }

    private static string FindWorkspaceRoot(string sourcePath)
    {
        var directory = new DirectoryInfo(Path.GetDirectoryName(sourcePath)!);
        for (var current = directory; current is not null; current = current.Parent)
        {
            var git = Path.Combine(current.FullName, ".git");
            if (Directory.Exists(git) || File.Exists(git))
            {
                return PathSecurity.CanonicalizeExisting(current.FullName);
            }
        }

        return PathSecurity.CanonicalizeExisting(directory.FullName);
    }
}
