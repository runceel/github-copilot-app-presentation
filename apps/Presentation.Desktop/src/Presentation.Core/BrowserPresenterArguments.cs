namespace Presentation.Core;

public static class BrowserPresenterArguments
{
    public const int WindowWidth = 1280;
    public const int WindowHeight = 720;

    public static IReadOnlyList<string> Build(string profileDirectory, Uri presenterUri) =>
    [
        "--disable-background-mode",
        "--disable-component-update",
        "--disable-default-apps",
        "--disable-extensions",
        "--disable-session-crashed-bubble",
        "--no-default-browser-check",
        "--no-first-run",
        "--new-window",
        $"--window-size={WindowWidth},{WindowHeight}",
        $"--user-data-dir={profileDirectory}",
        $"--app={presenterUri}",
    ];
}
