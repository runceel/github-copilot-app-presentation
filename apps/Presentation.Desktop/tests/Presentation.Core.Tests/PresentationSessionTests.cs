using Presentation.Core;

namespace Presentation.Core.Tests;

public sealed class PresentationSessionTests
{
    [Fact]
    public void Load_PreservesAndClampsCurrentIndex()
    {
        var session = new PresentationSession();
        session.Load(
            new DeckDocument(["a", "b", "c"], new Dictionary<string, string>(), "dark", ""),
            "a.md",
            "C:\\deck");
        session.NavigateTo(2);

        var snapshot = session.Load(
            new DeckDocument(["x", "y"], new Dictionary<string, string>(), "light", ""),
            "a.md",
            "C:\\deck");

        Assert.Equal(1, snapshot.Index);
        Assert.Equal("y", snapshot.CurrentMarkdown);
        Assert.Equal(2, snapshot.DeckVersion);
    }

    [Fact]
    public void Navigate_ClampsAtDeckEdges()
    {
        var session = new PresentationSession();
        session.Load(
            new DeckDocument(["a", "b"], new Dictionary<string, string>(), "dark", ""),
            "a.md",
            "C:\\deck");

        Assert.False(session.NavigateBy(-1));
        Assert.True(session.NavigateBy(1));
        Assert.False(session.NavigateBy(1));
        Assert.Equal(1, session.GetSnapshot().Index);
    }
}
