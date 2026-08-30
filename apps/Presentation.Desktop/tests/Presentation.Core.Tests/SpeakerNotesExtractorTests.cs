using Presentation.Core;

namespace Presentation.Core.Tests;

public sealed class SpeakerNotesExtractorTests
{
    [Fact]
    public void Extract_ReturnsTopLevelHtmlComments()
    {
        var notes = SpeakerNotesExtractor.Extract(
            """
            ## Slide

            <!--
            Start with **why**.
            Then show the demo.
            -->

            <!-- End with questions. -->
            """);

        Assert.Equal(
            "Start with **why**.\nThen show the demo.\n\nEnd with questions.",
            notes);
    }

    [Fact]
    public void Extract_IgnoresFencedExamplesAndSlideSizeDirective()
    {
        var notes = SpeakerNotesExtractor.Extract(
            """
            <!-- slide-size: large -->

            ```markdown
            <!-- This is an example, not a note. -->
            ```

            <!-- Actual note. -->
            """);

        Assert.Equal("Actual note.", notes);
    }

    [Fact]
    public void Extract_KeepsFencedCodeInsideSpeakerNote()
    {
        var notes = SpeakerNotesExtractor.Extract(
            """
            <!--
            Show this code:

            ```js
            const marker = "---";
            ```
            -->
            """);

        Assert.Contains("```js\nconst marker = \"---\";\n```", notes);
    }

    [Fact]
    public void Remove_StripsNotesButPreservesCommentsInFencedCode()
    {
        var markdown = SpeakerNotesExtractor.Remove(
            """
            Intro
            <!-- private note -->
            ```html
            <!-- visible example -->
            ```
            Outro
            """);

        Assert.Equal(
            "Intro\n\n```html\n<!-- visible example -->\n```\nOutro",
            markdown);
    }

    [Fact]
    public void Parse_IgnoresInlineAndIndentedCodeCommentMarkers()
    {
        const string markdown =
            "`<!-- inline code -->`\n" +
            "    <!-- indented code -->\n" +
            "<!-- actual note -->";

        Assert.Equal("actual note", SpeakerNotesExtractor.Extract(markdown));
        Assert.Equal(
            "`<!-- inline code -->`\n    <!-- indented code -->\n",
            SpeakerNotesExtractor.Remove(markdown));
    }
}
