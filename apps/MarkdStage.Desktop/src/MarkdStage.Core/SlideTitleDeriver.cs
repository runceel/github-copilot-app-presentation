using System.Text.RegularExpressions;

namespace MarkdStage.Core;

public static partial class SlideTitleDeriver
{
    private const string Untitled = "(Untitled)";
    private const int MaximumLength = 40;

    public static string Derive(string? markdown)
    {
        var body = SpeakerNotesExtractor.Remove(
            RemoveLeadingFrontMatter(markdown ?? string.Empty));
        var fallback = string.Empty;

        foreach (var rawLine in body.Replace("\r\n", "\n", StringComparison.Ordinal)
                     .Replace('\r', '\n')
                     .Split('\n'))
        {
            var line = rawLine.Trim();
            if (line.Length == 0)
            {
                continue;
            }

            var heading = HeadingRegex().Match(line);
            if (heading.Success)
            {
                return TrimTitle(heading.Groups[1].Value);
            }

            if (fallback.Length == 0)
            {
                fallback = line;
            }
        }

        return fallback.Length == 0 ? Untitled : TrimTitle(fallback);
    }

    private static string RemoveLeadingFrontMatter(string markdown)
    {
        var normalized = markdown.Replace("\r\n", "\n", StringComparison.Ordinal)
            .Replace('\r', '\n');
        var trimmed = normalized.TrimStart('\n', ' ', '\t', '\uFEFF');
        if (!trimmed.StartsWith("---\n", StringComparison.Ordinal) &&
            !trimmed.Equals("---", StringComparison.Ordinal))
        {
            return markdown;
        }

        var lines = trimmed.Split('\n');
        for (var index = 1; index < lines.Length; index++)
        {
            if (lines[index].Trim().Equals("---", StringComparison.Ordinal))
            {
                return string.Join('\n', lines[(index + 1)..]);
            }
        }

        return markdown;
    }

    private static string TrimTitle(string text)
    {
        var stripped = MarkdownPunctuationRegex().Replace(text, string.Empty);
        stripped = MarkdownLinkRegex().Replace(stripped, "$1").Trim();
        if (stripped.Length == 0)
        {
            return Untitled;
        }

        return stripped.Length > MaximumLength
            ? $"{stripped[..MaximumLength]}…"
            : stripped;
    }

    [GeneratedRegex(@"^#{1,6}\s+(.*\S)\s*$")]
    private static partial Regex HeadingRegex();

    [GeneratedRegex(@"[*_`>#~]")]
    private static partial Regex MarkdownPunctuationRegex();

    [GeneratedRegex(@"!?\[([^\]]*)\]\([^)]*\)")]
    private static partial Regex MarkdownLinkRegex();
}
