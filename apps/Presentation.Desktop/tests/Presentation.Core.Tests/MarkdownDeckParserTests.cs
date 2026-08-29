using Presentation.Core;
using System.Text.Json;

namespace Presentation.Core.Tests;

public sealed class MarkdownDeckParserTests
{
    private readonly MarkdownDeckParser _parser = new();

    [Fact]
    public void Parse_InheritsDeckMetadataAndAddsPageNumbersAndBackCover()
    {
        var document = _parser.Parse(
            """
            ---
            deck: Demo
            layout: title
            theme: microsoft
            ---
            # Cover

            ---

            ## Details

            - One
            """);

        Assert.Equal(3, document.Slides.Count);
        Assert.Contains("layout: title", document.Slides[0]);
        Assert.DoesNotContain("page:", document.Slides[0]);
        Assert.Contains("page: 2", document.Slides[1]);
        Assert.Contains("total: 2", document.Slides[1]);
        Assert.Contains("layout: backcover", document.Slides[2]);
        Assert.Equal("microsoft", document.Theme);
    }

    [Fact]
    public void Parse_DoesNotSplitInsideCodeFenceOrSetextHeading()
    {
        var document = _parser.Parse(
            """
            ## Code

            ```text
            ---
            ```

            Heading
            ---

            Text
            """);

        Assert.Equal(2, document.Slides.Count);
        Assert.Contains("```text\n---\n```", document.Slides[0]);
        Assert.Contains("Heading\n---", document.Slides[0]);
    }

    [Fact]
    public void Parse_EmptyMarkdownProducesNoSlides()
    {
        var document = _parser.Parse(" \r\n\t");

        Assert.Empty(document.Slides);
    }

    [Fact]
    public async Task Parse_MatchesSharedJavaScriptCorpus()
    {
        var path = Path.Combine(
            AppContext.BaseDirectory,
            "Fixtures",
            "markdown-deck-corpus.json");
        await using var stream = File.OpenRead(path);
        var corpus = await JsonSerializer.DeserializeAsync<List<CorpusEntry>>(
                stream,
                new JsonSerializerOptions { PropertyNameCaseInsensitive = true })
            ?? throw new InvalidDataException("Parser corpus is empty.");

        foreach (var entry in corpus)
        {
            var document = _parser.Parse(entry.Markdown, addBackCover: false);
            Assert.Equal(entry.Slides, document.Slides);
        }
    }

    private sealed record CorpusEntry(string Name, string Markdown, string[] Slides);
}
