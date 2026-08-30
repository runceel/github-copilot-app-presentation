using System.Text.RegularExpressions;

namespace MarkdStage.Core;

public sealed partial class MarkdownDeckParser
{
    private const string DefaultBackCover = "---\nlayout: backcover\n---\n";

    private static readonly HashSet<string> NonInheritedKeys =
        new(StringComparer.OrdinalIgnoreCase) { "layout", "page" };

    private static readonly HashSet<string> UnnumberedLayouts =
        new(StringComparer.OrdinalIgnoreCase) { "title", "section", "backcover" };

    public DeckDocument Parse(string text, bool addBackCover = true)
    {
        var normalized = NormalizeText(text);
        var lines = normalized.Split('\n');
        var cursor = 0;

        while (cursor < lines.Length && string.IsNullOrWhiteSpace(lines[cursor]))
        {
            cursor++;
        }

        var deckMetadata = new Metadata();
        var deckFrontMatter = ReadFrontMatterAt(lines, cursor);
        if (deckFrontMatter is not null)
        {
            deckMetadata = deckFrontMatter.Metadata;
            cursor = deckFrontMatter.End + 1;
        }

        var parsedSlides = SplitSlides(lines, cursor);
        if (parsedSlides.Count == 0)
        {
            return new DeckDocument([], ToDictionary(deckMetadata), "dark", string.Empty);
        }

        var mergedSlides = new List<Slide>(parsedSlides.Count);
        for (var index = 0; index < parsedSlides.Count; index++)
        {
            var metadata = new Metadata();
            foreach (var entry in deckMetadata.Values)
            {
                if (NonInheritedKeys.Contains(entry.Key) &&
                    !(index == 0 && entry.Key.Equals("layout", StringComparison.OrdinalIgnoreCase)))
                {
                    continue;
                }

                metadata[entry.Key] = entry;
            }

            foreach (var entry in parsedSlides[index].Metadata.Values)
            {
                metadata[entry.Key] = entry;
            }

            mergedSlides.Add(new Slide(metadata, parsedSlides[index].Body));
        }

        var total = mergedSlides.Count(slide =>
            !GetLayout(slide.Metadata).Equals("backcover", StringComparison.OrdinalIgnoreCase));

        var ordinal = 0;
        var fragments = new List<string>(mergedSlides.Count + 1);
        foreach (var slide in mergedSlides)
        {
            var layout = GetLayout(slide.Metadata);
            if (!layout.Equals("backcover", StringComparison.OrdinalIgnoreCase))
            {
                ordinal++;
            }

            if (!UnnumberedLayouts.Contains(layout))
            {
                if (!slide.Metadata.ContainsKey("page"))
                {
                    slide.Metadata["page"] = new MetadataEntry("page", ordinal.ToString());
                }

                if (!slide.Metadata.ContainsKey("total"))
                {
                    slide.Metadata["total"] = new MetadataEntry("total", total.ToString());
                }
            }

            fragments.Add(FormatSlide(slide));
        }

        if (addBackCover && fragments.Count > 0)
        {
            var lastMetadata = GetFragmentMetadata(fragments[^1]);
            if (!lastMetadata.TryGetValue("layout", out var lastLayout) ||
                !lastLayout.Equals("backcover", StringComparison.OrdinalIgnoreCase))
            {
                fragments.Add(DefaultBackCover);
            }
        }

        var theme = "dark";
        var themeFile = string.Empty;
        foreach (var fragment in fragments)
        {
            var metadata = GetFragmentMetadata(fragment);
            if (metadata.TryGetValue("theme", out var candidateTheme) &&
                !string.IsNullOrWhiteSpace(candidateTheme))
            {
                theme = NormalizeTheme(candidateTheme);
                metadata.TryGetValue("theme-file", out themeFile);
                themeFile ??= string.Empty;
                break;
            }

            if (metadata.TryGetValue("theme-file", out var candidateThemeFile) &&
                !string.IsNullOrWhiteSpace(candidateThemeFile))
            {
                theme = "custom";
                themeFile = candidateThemeFile;
                break;
            }
        }

        return new DeckDocument(fragments, ToDictionary(deckMetadata), theme, themeFile);
    }

    public static IReadOnlyDictionary<string, string> GetFragmentMetadata(string markdown)
    {
        var normalized = NormalizeText(markdown).TrimStart('\n', ' ', '\t', '\uFEFF');
        if (!normalized.StartsWith("---\n", StringComparison.Ordinal) && normalized != "---")
        {
            return new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        }

        var lines = normalized.Split('\n');
        var result = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        for (var index = 1; index < lines.Length; index++)
        {
            if (SeparatorRegex().IsMatch(lines[index]))
            {
                break;
            }

            var separator = lines[index].IndexOf(':');
            if (separator <= 0)
            {
                continue;
            }

            var key = lines[index][..separator].Trim();
            var value = lines[index][(separator + 1)..]
                .Trim()
                .Trim('\'', '"');
            if (key.Length > 0)
            {
                result[key] = value;
            }
        }

        return result;
    }

    private static List<Slide> SplitSlides(string[] lines, int cursor)
    {
        var slides = new List<Slide>();
        var metadata = new Metadata();
        var body = new List<string>();
        var sawContent = false;
        string? fence = null;

        void Flush()
        {
            var bodyText = string.Join('\n', body).Trim();
            if (bodyText.Length > 0 || metadata.Count > 0)
            {
                slides.Add(new Slide(metadata, bodyText));
            }

            metadata = new Metadata();
            body = [];
            sawContent = false;
        }

        for (var index = cursor; index < lines.Length; index++)
        {
            var line = lines[index];

            if (fence is not null)
            {
                body.Add(line);
                var fenceCharacter = Regex.Escape(fence[0].ToString());
                if (Regex.IsMatch(line, $@"^[ \t]{{0,3}}{fenceCharacter}{{{fence.Length},}}[ \t]*$"))
                {
                    fence = null;
                }

                continue;
            }

            var fenceMatch = FenceOpenRegex().Match(line);
            if (fenceMatch.Success)
            {
                fence = fenceMatch.Groups[2].Value;
                body.Add(line);
                sawContent = true;
                continue;
            }

            if (SeparatorRegex().IsMatch(line))
            {
                var previous = index > 0 ? lines[index - 1] : string.Empty;
                if (sawContent && !string.IsNullOrWhiteSpace(previous))
                {
                    body.Add(line);
                    continue;
                }

                var frontMatter = ReadFrontMatterAt(lines, index);
                if (frontMatter is not null)
                {
                    if (sawContent || metadata.Count > 0)
                    {
                        Flush();
                    }

                    metadata = frontMatter.Metadata;
                    index = frontMatter.End;
                    continue;
                }

                Flush();
                continue;
            }

            body.Add(line);
            if (!string.IsNullOrWhiteSpace(line))
            {
                sawContent = true;
            }
        }

        Flush();
        return slides;
    }

    private static FrontMatter? ReadFrontMatterAt(string[] lines, int start)
    {
        if (start < 0 || start >= lines.Length || !SeparatorRegex().IsMatch(lines[start]))
        {
            return null;
        }

        var metadata = new Metadata();
        for (var index = start + 1; index < lines.Length; index++)
        {
            var line = lines[index];
            if (SeparatorRegex().IsMatch(line))
            {
                return metadata.Count == 0 ? null : new FrontMatter(metadata, index);
            }

            if (string.IsNullOrWhiteSpace(line) || MetadataCommentRegex().IsMatch(line))
            {
                continue;
            }

            var match = MetadataLineRegex().Match(line);
            if (!match.Success)
            {
                return null;
            }

            var key = match.Groups[1].Value;
            metadata[key] = new MetadataEntry(key, match.Groups[2].Value.Trim());
        }

        return null;
    }

    private static string FormatSlide(Slide slide)
    {
        if (slide.Metadata.Count == 0)
        {
            return slide.Body;
        }

        var lines = new List<string> { "---" };
        lines.AddRange(slide.Metadata.Values.Select(entry =>
            entry.Value.Length == 0 ? $"{entry.Key}:" : $"{entry.Key}: {entry.Value}"));
        lines.Add("---");

        var frontMatter = string.Join('\n', lines);
        return slide.Body.Length == 0 ? frontMatter : $"{frontMatter}\n{slide.Body}";
    }

    private static string GetLayout(Metadata metadata) =>
        metadata.TryGetValue("layout", out var entry) ? entry.Value.ToLowerInvariant() : string.Empty;

    private static IReadOnlyDictionary<string, string> ToDictionary(Metadata metadata) =>
        metadata.Values.ToDictionary(
            entry => entry.Key,
            entry => entry.Value,
            StringComparer.OrdinalIgnoreCase);

    private static string NormalizeText(string? text) =>
        (text ?? string.Empty)
            .Replace("\r\n", "\n", StringComparison.Ordinal)
            .Replace('\r', '\n')
            .TrimStart('\uFEFF');

    private static string NormalizeTheme(string value) =>
        value.Trim().ToLowerInvariant() is "light" or "microsoft" or "custom"
            ? value.Trim().ToLowerInvariant()
            : "dark";

    [GeneratedRegex(@"^([ \t]{0,3})(`{3,}|~{3,})[ \t]*([^\s`~]*)[ \t]*$")]
    private static partial Regex FenceOpenRegex();

    [GeneratedRegex(@"^[ \t]{0,3}-{3,}[ \t]*$")]
    private static partial Regex SeparatorRegex();

    [GeneratedRegex(@"^([A-Za-z][A-Za-z0-9_-]*)[ \t]*:(.*)$")]
    private static partial Regex MetadataLineRegex();

    [GeneratedRegex(@"^[ \t]*#")]
    private static partial Regex MetadataCommentRegex();

    private sealed class Metadata : Dictionary<string, MetadataEntry>
    {
        public Metadata() : base(StringComparer.OrdinalIgnoreCase)
        {
        }
    }

    private sealed record MetadataEntry(string Key, string Value);

    private sealed record FrontMatter(Metadata Metadata, int End);

    private sealed record Slide(Metadata Metadata, string Body);
}
