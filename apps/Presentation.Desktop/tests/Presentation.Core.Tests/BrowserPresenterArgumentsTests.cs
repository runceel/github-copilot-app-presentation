using Presentation.Core;

namespace Presentation.Core.Tests;

public sealed class BrowserPresenterArgumentsTests
{
    [Fact]
    public void Build_UsesMovableAppWindowWithoutFullscreenFlags()
    {
        var arguments = BrowserPresenterArguments.Build(
            "C:\\Temp\\presentation-profile",
            new Uri("http://127.0.0.1:1234/session/?present=1"));

        Assert.Contains("--window-size=1280,720", arguments);
        Assert.Contains("--user-data-dir=C:\\Temp\\presentation-profile", arguments);
        Assert.Contains("--app=http://127.0.0.1:1234/session/?present=1", arguments);
        Assert.DoesNotContain("--start-fullscreen", arguments);
        Assert.DoesNotContain("--start-maximized", arguments);
    }
}
