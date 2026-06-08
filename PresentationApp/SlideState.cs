using System.Net;
using System.Text;
using Markdig;

namespace PresentationApp;

/// <summary>
/// Watches slides/current.md (a tiny markdown fragment written by the agent)
/// and renders it into a fully themed standalone HTML slide. The agent only
/// has to emit small markdown, so switching slides is fast; all styling,
/// layout, and chrome live here in the app.
/// </summary>
public sealed class SlideState : IDisposable
{
    private static readonly MarkdownPipeline Pipeline = new MarkdownPipelineBuilder()
        .UseAdvancedExtensions()
        .UseEmojiAndSmiley()
        .Build();

    private readonly string _file;
    private readonly FileSystemWatcher _watcher;
    private readonly Timer _debounce;
    private readonly object _gate = new();
    private string? _lastGoodHtml;

    public int Version { get; private set; }
    public event Action? Changed;

    public SlideState(IWebHostEnvironment env)
    {
        var dir = Path.Combine(env.ContentRootPath, "slides");
        Directory.CreateDirectory(dir);
        _file = Path.Combine(dir, "current.md");
        Version = File.Exists(_file) ? 1 : 0;

        _debounce = new Timer(_ => Bump(), null, Timeout.Infinite, Timeout.Infinite);
        _watcher = new FileSystemWatcher(dir, "current.md")
        {
            NotifyFilter = NotifyFilters.LastWrite | NotifyFilters.Size
                         | NotifyFilters.FileName | NotifyFilters.CreationTime,
            EnableRaisingEvents = true,
        };
        _watcher.Changed += OnFsEvent;
        _watcher.Created += OnFsEvent;
        _watcher.Renamed += OnFsEvent;
    }

    // FileSystemWatcher fires several events per save; coalesce them.
    private void OnFsEvent(object sender, FileSystemEventArgs e)
        => _debounce.Change(120, Timeout.Infinite);

    private void Bump()
    {
        lock (_gate)
        {
            Version++;
        }
        Changed?.Invoke();
    }

    /// <summary>
    /// Reads the current markdown fragment (with brief retries to tolerate the
    /// moment it is being replaced) and renders it to a complete themed HTML
    /// document. Falls back to the last good slide or a placeholder so the
    /// iframe never goes blank.
    /// </summary>
    public string ReadCurrentHtml()
    {
        for (var attempt = 0; attempt < 6; attempt++)
        {
            try
            {
                var md = File.ReadAllText(_file, Encoding.UTF8);
                if (!string.IsNullOrWhiteSpace(md))
                {
                    var html = Render(md);
                    _lastGoodHtml = html;
                    return html;
                }
            }
            catch (FileNotFoundException) { break; }
            catch (DirectoryNotFoundException) { break; }
            catch (IOException) { Thread.Sleep(25); }
        }

        return _lastGoodHtml ?? Render(PlaceholderMarkdown);
    }

    /// <summary>
    /// Renders a markdown fragment (optionally prefixed with a small YAML-ish
    /// front matter block) into a complete, self-contained HTML slide.
    /// </summary>
    public static string Render(string markdown)
    {
        var (meta, body) = SplitFrontMatter(markdown);
        var bodyHtml = Markdown.ToHtml(body, Pipeline);

        var layout = Get(meta, "layout");
        var deckClass = string.Equals(layout, "title", StringComparison.OrdinalIgnoreCase)
            ? "deck title-slide"
            : "deck";

        var title = Enc(Get(meta, "title") ?? Get(meta, "deck") ?? "Slide");
        var kicker = Get(meta, "kicker");
        var deck = Get(meta, "deck");
        var page = Get(meta, "page");
        var total = Get(meta, "total");

        var kickerHtml = string.IsNullOrWhiteSpace(kicker)
            ? ""
            : $"<div class=\"kicker\">{Enc(kicker)}</div>";

        var pageHtml = (!string.IsNullOrWhiteSpace(page) && !string.IsNullOrWhiteSpace(total))
            ? $"<span class=\"page\">{Enc(page)} / {Enc(total)}</span>"
            : "<span></span>";

        var deckHtml = string.IsNullOrWhiteSpace(deck) ? "" : Enc(deck);

        var footerHtml = (string.IsNullOrWhiteSpace(deck)
                          && (string.IsNullOrWhiteSpace(page) || string.IsNullOrWhiteSpace(total)))
            ? ""
            : $"<footer><span>{deckHtml}</span>{pageHtml}</footer>";

        return $$"""
        <!doctype html>
        <html lang="ja">
        <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>{{title}}</title>
        <style>{{Css}}</style>
        </head>
        <body>
          <div class="{{deckClass}}">
            <header>
              {{kickerHtml}}
            </header>
            <div class="body">
              {{bodyHtml}}
            </div>
            {{footerHtml}}
          </div>
        </body>
        </html>
        """;
    }

    private static (Dictionary<string, string> meta, string body) SplitFrontMatter(string md)
    {
        var meta = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        // Normalise newlines for simple parsing.
        var text = md.Replace("\r\n", "\n").Replace("\r", "\n");
        var trimmed = text.TrimStart('\n', ' ', '\t', '\uFEFF');
        if (!trimmed.StartsWith("---\n") && trimmed != "---")
            return (meta, md);

        var lines = trimmed.Split('\n');
        var end = -1;
        for (var i = 1; i < lines.Length; i++)
        {
            if (lines[i].Trim() == "---")
            {
                end = i;
                break;
            }
        }
        if (end < 0)
            return (meta, md); // no closing fence: treat whole thing as body

        for (var i = 1; i < end; i++)
        {
            var line = lines[i];
            var idx = line.IndexOf(':');
            if (idx <= 0) continue;
            var key = line[..idx].Trim();
            var value = line[(idx + 1)..].Trim().Trim('"', '\'');
            if (key.Length > 0)
                meta[key] = value;
        }

        var body = string.Join('\n', lines.Skip(end + 1));
        return (meta, body);
    }

    private static string? Get(Dictionary<string, string> meta, string key)
        => meta.TryGetValue(key, out var v) && !string.IsNullOrWhiteSpace(v) ? v : null;

    private static string Enc(string? s) => WebUtility.HtmlEncode(s ?? "");

    private const string PlaceholderMarkdown = """
        ---
        layout: title
        kicker: Presentation
        ---
        # 🖥️ プレゼンの準備ができました

        スライドの表示をお待ちしています…
        """;

    private const string Css = """
        :root{
          --bg:#0b1021; --fg:#e6edf6; --muted:#9aa6c2;
          --accent:#6ea8fe; --accent2:#b08cff; --code:#0e1530; --border:#26314f;
        }
        *{box-sizing:border-box}
        html,body{height:100%;margin:0}
        body{
          font-family:"Segoe UI","Hiragino Kaku Gothic ProN","Yu Gothic UI",system-ui,sans-serif;
          background:radial-gradient(1200px 800px at 80% -10%, #1b2547 0%, var(--bg) 55%);
          color:var(--fg);
        }
        .deck{height:100vh;width:100vw;display:flex;flex-direction:column;
              padding:clamp(28px,5vh,64px) clamp(36px,6vw,96px);
              animation:fade .35s ease both;}
        @keyframes fade{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
        .deck>header{flex:0 0 auto;}
        .deck>header:empty{display:none;}
        .kicker{color:var(--accent);font-weight:700;letter-spacing:.08em;
                text-transform:uppercase;font-size:clamp(12px,1.6vh,16px);margin-bottom:.3em;}
        h1{font-size:clamp(30px,6.4vh,70px);line-height:1.1;margin:.1em 0 .25em;}
        h2{font-size:clamp(24px,4.8vh,48px);line-height:1.15;margin:.1em 0 .4em;}
        h3{font-size:clamp(20px,3.4vh,32px);margin:.2em 0 .3em;color:var(--accent2);}
        .body{flex:1 1 auto;display:flex;flex-direction:column;justify-content:center;
              font-size:clamp(18px,3vh,30px);line-height:1.55;gap:.5em;min-height:0;overflow:auto;}
        .body>:first-child{margin-top:0}
        .body ul,.body ol{margin:.2em 0;padding-left:1.3em;}
        .body li{margin:.35em 0;}
        .body li::marker{color:var(--accent);}
        strong{color:#fff;}
        em{color:var(--accent2);font-style:normal;}
        a{color:var(--accent);}
        code{font-family:"Cascadia Code",Consolas,monospace;background:var(--code);
             border:1px solid var(--border);border-radius:6px;padding:.08em .35em;font-size:.92em;}
        pre{background:var(--code);border:1px solid var(--border);border-radius:12px;
            padding:1em 1.2em;overflow:auto;font-size:clamp(14px,2.1vh,22px);line-height:1.45;}
        pre code{background:none;border:0;padding:0;}
        blockquote{margin:.2em 0;padding:.4em 1em;border-left:4px solid var(--accent);
                   color:var(--muted);background:rgba(110,168,254,.07);border-radius:0 10px 10px 0;}
        table{border-collapse:collapse;width:100%;font-size:.9em;}
        th,td{border:1px solid var(--border);padding:.5em .7em;text-align:left;}
        th{background:rgba(110,168,254,.12);}
        img{max-width:100%;max-height:48vh;border-radius:12px;}
        hr{border:0;border-top:1px solid var(--border);margin:.6em 0;}
        footer{flex:0 0 auto;display:flex;justify-content:space-between;align-items:center;
               color:var(--muted);font-size:clamp(12px,1.7vh,16px);
               margin-top:clamp(10px,2vh,24px);border-top:1px solid var(--border);padding-top:10px;}
        .deck.title-slide{justify-content:center;text-align:center;}
        .deck.title-slide .body{justify-content:flex-start;}
        .deck.title-slide .kicker{margin-bottom:.6em;}
        """;

    public void Dispose()
    {
        _watcher.Dispose();
        _debounce.Dispose();
    }
}
