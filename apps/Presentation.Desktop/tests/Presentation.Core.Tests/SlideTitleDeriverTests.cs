using Presentation.Core;

namespace Presentation.Core.Tests;

public sealed class SlideTitleDeriverTests
{
    [Fact]
    public void Derive_PrefersFirstAtxHeading()
    {
        var title = SlideTitleDeriver.Derive(
            """
            Introductory text

            ## Selected heading
            # Later heading
            """);

        Assert.Equal("Selected heading", title);
    }

    [Fact]
    public void Derive_FallsBackToFirstNonEmptyBodyLine()
    {
        var title = SlideTitleDeriver.Derive("\n\n  First body line  \nSecond body line");

        Assert.Equal("First body line", title);
    }

    [Fact]
    public void Derive_StripsLeadingSlideFrontMatter()
    {
        var title = SlideTitleDeriver.Derive(
            """

              ---
            layout: section
            page: 2
              ---
            # Deck content
            """);

        Assert.Equal("Deck content", title);
    }

    [Fact]
    public void Derive_StripsMarkdownDecorationsAndLinkWrappers()
    {
        var title = SlideTitleDeriver.Derive(
            "### > **[`Linked_title`](https://example.com)** and ![image](asset.png) ~tag~");

        Assert.Equal("Linkedtitle and image tag", title);
    }

    [Fact]
    public void Derive_TruncatesAfterFortyCharacters()
    {
        var title = SlideTitleDeriver.Derive($"# {new string('あ', 41)}");

        Assert.Equal($"{new string('あ', 40)}…", title);
    }

    [Theory]
    [InlineData("")]
    [InlineData(" \n\t")]
    [InlineData("# ~_`*_")]
    [InlineData("---\nlayout: backcover\n---\n")]
    public void Derive_ReturnsUntitledWhenNoTitleRemains(string markdown)
    {
        Assert.Equal("（無題）", SlideTitleDeriver.Derive(markdown));
    }
}
