using System.Text;
using System.Text.RegularExpressions;

namespace MarkdStage.Core;

public static partial class SpeakerNotesExtractor
{
    public static string Extract(string? markdown) => Parse(markdown).Notes;

    public static string Remove(string? markdown) => Parse(markdown).Markdown;

    private static ParsedSpeakerNotes Parse(string? markdown)
    {
        var notes = new List<string>();
        var output = new List<string>();
        var lines = NormalizeText(markdown).Split('\n');
        string? fence = null;
        StringBuilder? comment = null;

        foreach (var line in lines)
        {
            if (comment is null && fence is not null)
            {
                if (ClosesFence(line, fence))
                {
                    fence = null;
                }

                output.Add(line);
                continue;
            }

            if (comment is null)
            {
                var opening = FenceOpenRegex().Match(line);
                if (opening.Success)
                {
                    fence = opening.Groups[2].Value;
                    output.Add(line);
                    continue;
                }
            }

            var visible = new StringBuilder();
            var cursor = 0;
            while (cursor <= line.Length)
            {
                if (comment is null)
                {
                    var start = line.IndexOf("<!--", cursor, StringComparison.Ordinal);
                    if (start < 0)
                    {
                        visible.Append(line.AsSpan(cursor));
                        break;
                    }

                    var before = visible.ToString() + line[cursor..start];
                    if (!string.IsNullOrWhiteSpace(before) || before.Length > 3)
                    {
                        visible.Append(line.AsSpan(cursor));
                        break;
                    }

                    visible.Clear();
                    visible.Append(before);
                    comment = new StringBuilder();
                    cursor = start + 4;
                }

                var end = line.IndexOf("-->", cursor, StringComparison.Ordinal);
                if (end < 0)
                {
                    comment.Append(line.AsSpan(cursor));
                    comment.Append('\n');
                    break;
                }

                comment.Append(line.AsSpan(cursor, end - cursor));
                AddNote(notes, comment.ToString());
                comment = null;
                cursor = end + 3;
            }
            output.Add(visible.ToString());
        }

        return new ParsedSpeakerNotes(
            string.Join('\n', output),
            string.Join("\n\n", notes));
    }

    private static void AddNote(List<string> notes, string candidate)
    {
        var note = NormalizeIndentation(candidate);
        if (note.Length > 0 && !SlideSizeDirectiveRegex().IsMatch(note))
        {
            notes.Add(note);
        }
    }

    private static string NormalizeIndentation(string value)
    {
        var lines = NormalizeText(value).Split('\n').ToList();
        while (lines.Count > 0 && string.IsNullOrWhiteSpace(lines[0]))
        {
            lines.RemoveAt(0);
        }

        while (lines.Count > 0 && string.IsNullOrWhiteSpace(lines[^1]))
        {
            lines.RemoveAt(lines.Count - 1);
        }

        if (lines.Count == 0)
        {
            return string.Empty;
        }

        var indentation = lines
            .Where(line => !string.IsNullOrWhiteSpace(line))
            .Select(LeadingWhitespaceLength)
            .DefaultIfEmpty(0)
            .Min();
        return string.Join(
                '\n',
                lines.Select(line => line.Length >= indentation ? line[indentation..] : string.Empty))
            .Trim();
    }

    private static int LeadingWhitespaceLength(string value)
    {
        var index = 0;
        while (index < value.Length && value[index] is ' ' or '\t')
        {
            index++;
        }

        return index;
    }

    private static bool ClosesFence(string line, string fence)
    {
        var indentation = LeadingWhitespaceLength(line);
        if (indentation > 3)
        {
            return false;
        }

        var trimmed = line[indentation..].TrimEnd();
        if (trimmed.Length < fence.Length || trimmed[0] != fence[0])
        {
            return false;
        }

        var count = 0;
        while (count < trimmed.Length && trimmed[count] == fence[0])
        {
            count++;
        }

        return count >= fence.Length && string.IsNullOrWhiteSpace(trimmed[count..]);
    }

    private static string NormalizeText(string? text) =>
        (text ?? string.Empty)
            .Replace("\r\n", "\n", StringComparison.Ordinal)
            .Replace('\r', '\n');

    [GeneratedRegex(@"^([ \t]{0,3})(`{3,}|~{3,})[ \t]*([^\s`~]*)[ \t]*$")]
    private static partial Regex FenceOpenRegex();

    [GeneratedRegex(@"^slide-size[ \t]*:", RegexOptions.IgnoreCase)]
    private static partial Regex SlideSizeDirectiveRegex();

    private sealed record ParsedSpeakerNotes(string Markdown, string Notes);
}
