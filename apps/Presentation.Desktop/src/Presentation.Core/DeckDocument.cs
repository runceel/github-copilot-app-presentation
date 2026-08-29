namespace Presentation.Core;

public sealed record DeckDocument(
    IReadOnlyList<string> Slides,
    IReadOnlyDictionary<string, string> Metadata,
    string Theme,
    string ThemeFile);

public sealed record ThemeState(
    string Name,
    string Css = "",
    string MetadataJson = "",
    string AssetRoot = "");

public sealed record PresentationSnapshot(
    IReadOnlyList<string> Slides,
    int Index,
    long Version,
    long DeckVersion,
    string SourcePath,
    string WorkspaceRoot,
    ThemeState Theme)
{
    public int Total => Slides.Count;

    public string CurrentMarkdown =>
        Total == 0 ? string.Empty : Slides[Math.Clamp(Index, 0, Total - 1)];

    public string MarkdownAtOffset(int offset)
    {
        if (Total == 0)
        {
            return string.Empty;
        }

        var target = Math.Clamp(Index + offset, 0, Total - 1);
        return Slides[target];
    }

    public bool HasNext => Index + 1 < Total;
}
