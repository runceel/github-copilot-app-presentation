using System.Net;
using System.Text.Json.Nodes;
using System.Threading.Channels;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Hosting.Server;
using Microsoft.AspNetCore.Hosting.Server.Features;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Presentation.Core;

namespace PresentationApp.Services;

internal sealed class PresentationServer(
    PresentationSession session,
    Func<bool> presenterRunning) : IAsyncDisposable
{
    private static readonly TimeSpan ShutdownTimeout = TimeSpan.FromSeconds(2);

    private readonly string _token = Guid.NewGuid().ToString("N");
    private readonly CancellationTokenSource _shutdown = new();
    private readonly SemaphoreSlim _lifecycleGate = new(1, 1);
    private WebApplication? _application;
    private string _webRoot = string.Empty;
    private VendorAssetProvider? _vendorAssets;

    public Uri? BaseUri { get; private set; }

    public async Task StartAsync(CancellationToken cancellationToken = default)
    {
        using var startup = CancellationTokenSource.CreateLinkedTokenSource(
            cancellationToken,
            _shutdown.Token);
        await _lifecycleGate.WaitAsync(startup.Token);
        WebApplication? application = null;
        try
        {
            if (_application is not null)
            {
                return;
            }

            _webRoot = Path.Combine(AppContext.BaseDirectory, "Web");
            if (!File.Exists(Path.Combine(_webRoot, "index.html")))
            {
                throw new InvalidOperationException("Presentation renderer assets are missing.");
            }

            _vendorAssets = new VendorAssetProvider(_webRoot);
            _ = await _vendorAssets.GetMermaidAsync(startup.Token);

            var builder = WebApplication.CreateSlimBuilder(new WebApplicationOptions
            {
                ApplicationName = typeof(PresentationServer).Assembly.FullName,
                ContentRootPath = AppContext.BaseDirectory,
            });
            builder.Logging.ClearProviders();
            builder.WebHost.ConfigureKestrel(options => options.Listen(IPAddress.Loopback, 0));

            application = builder.Build();
            MapRoutes(application);
            await application.StartAsync(startup.Token);

            var addresses = application.Services
                .GetRequiredService<IServer>()
                .Features
                .Get<IServerAddressesFeature>()?
                .Addresses;
            var address = addresses?.SingleOrDefault()
                ?? throw new InvalidOperationException("Presentation server did not expose an address.");

            startup.Token.ThrowIfCancellationRequested();
            BaseUri = new Uri($"{address.TrimEnd('/')}/{_token}/", UriKind.Absolute);
            _application = application;
            application = null;
        }
        finally
        {
            if (application is not null)
            {
                await application.DisposeAsync();
            }
            _lifecycleGate.Release();
        }
    }

    public async ValueTask DisposeAsync()
    {
        _shutdown.Cancel();
        await _lifecycleGate.WaitAsync();
        WebApplication? application;
        try
        {
            application = _application;
            _application = null;
            BaseUri = null;
        }
        finally
        {
            _lifecycleGate.Release();
        }

        if (application is null)
        {
            return;
        }

        using var timeout = new CancellationTokenSource(ShutdownTimeout);
        try
        {
            await application.StopAsync(timeout.Token);
            await application.DisposeAsync().AsTask().WaitAsync(timeout.Token);
        }
        catch (OperationCanceledException) when (timeout.IsCancellationRequested)
        {
        }
    }

    private void MapRoutes(WebApplication application)
    {
        application.Use(async (context, next) =>
        {
            if (!context.Request.Host.Host.Equals("127.0.0.1", StringComparison.Ordinal))
            {
                context.Response.StatusCode = StatusCodes.Status403Forbidden;
                return;
            }

            var origin = context.Request.Headers.Origin.ToString();
            if (HttpMethods.IsPost(context.Request.Method) &&
                origin.Length > 0 &&
                !origin.Equals(
                    $"{context.Request.Scheme}://{context.Request.Host}",
                    StringComparison.OrdinalIgnoreCase))
            {
                context.Response.StatusCode = StatusCodes.Status403Forbidden;
                return;
            }

            context.Response.Headers.CacheControl = "no-store";
            context.Response.Headers.ContentSecurityPolicy =
                "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; " +
                "script-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'";
            context.Response.Headers.XContentTypeOptions = "nosniff";
            await next();
        });

        var prefix = $"/{_token}";
        application.MapGet($"{prefix}/", context => SendFileAsync(
            context,
            Path.Combine(_webRoot, "index.html"),
            "text/html; charset=utf-8"));
        application.MapGet($"{prefix}/index.html", context => SendFileAsync(
            context,
            Path.Combine(_webRoot, "index.html"),
            "text/html; charset=utf-8"));
        application.MapGet($"{prefix}/renderer/{{**path}}", (
            HttpContext context,
            string path) => SendStaticAsync(context, Path.Combine(_webRoot, "renderer"), path));
        application.MapGet($"{prefix}/vendor/mermaid.min.js", async context =>
        {
            var bytes = await _vendorAssets!.GetMermaidAsync(context.RequestAborted);
            context.Response.ContentType = "text/javascript; charset=utf-8";
            context.Response.ContentLength = bytes.Length;
            await context.Response.Body.WriteAsync(bytes, context.RequestAborted);
        });
        application.MapGet($"{prefix}/vendor/{{**path}}", (
            HttpContext context,
            string path) => SendStaticAsync(context, Path.Combine(_webRoot, "vendor"), path));

        application.MapGet($"{prefix}/state", (HttpContext context) =>
        {
            var snapshot = session.GetSnapshot();
            var offset = int.TryParse(context.Request.Query["offset"], out var parsedOffset)
                ? Math.Clamp(parsedOffset, -1, 1)
                : 0;
            var targetIndex = snapshot.Total == 0
                ? 0
                : Math.Clamp(snapshot.Index + offset, 0, snapshot.Total - 1);
            var markdown = snapshot.Total == 0 ? string.Empty : snapshot.Slides[targetIndex];
            var customThemeMetadata = string.IsNullOrWhiteSpace(snapshot.Theme.MetadataJson)
                ? null
                : JsonNode.Parse(snapshot.Theme.MetadataJson);

            return Results.Json(new
            {
                version = snapshot.Version,
                deckVersion = snapshot.DeckVersion,
                markdown,
                index = targetIndex,
                total = snapshot.Total,
                theme = snapshot.Theme.Name,
                themeLocked = false,
                customThemeCss = snapshot.Theme.Css,
                customThemeMeta = customThemeMetadata,
                mode = "deck",
                sourceBacked = !string.IsNullOrWhiteSpace(snapshot.SourcePath),
                sourceMode = "live",
                sourceWatchStatus = "watching",
                sourceWatchError = "",
                presenterRunning = presenterRunning(),
                architectureEdit = false,
                architectureDetailedEdit = false,
            });
        });

        application.MapGet($"{prefix}/deck", () =>
        {
            var snapshot = session.GetSnapshot();
            return Results.Json(new
            {
                deckVersion = snapshot.DeckVersion,
                slides = snapshot.Slides,
            });
        });

        application.MapPost($"{prefix}/navigate", async (HttpContext context) =>
        {
            var request = await context.Request.ReadFromJsonAsync<NavigationRequest>(
                cancellationToken: context.RequestAborted);
            if (request is null || (request.Index.HasValue == request.Delta.HasValue))
            {
                return Results.BadRequest(new
                {
                    ok = false,
                    error = "exactly one of index or delta is required",
                });
            }

            var snapshot = session.GetSnapshot();
            if (snapshot.Total == 0)
            {
                return Results.Conflict(new { ok = false, error = "no_deck" });
            }

            var changed = request.Index.HasValue
                ? session.NavigateTo(request.Index.Value)
                : session.NavigateBy(request.Delta!.Value);
            snapshot = session.GetSnapshot();

            return Results.Json(new
            {
                ok = true,
                changed,
                version = snapshot.Version,
                index = snapshot.Index,
                total = snapshot.Total,
                mode = "deck",
            });
        });

        application.MapGet($"{prefix}/events", async context =>
        {
            context.Response.ContentType = "text/event-stream";
            context.Response.Headers.CacheControl = "no-cache";
            context.Response.Headers.Connection = "keep-alive";

            var channel = Channel.CreateUnbounded<long>(new UnboundedChannelOptions
            {
                SingleReader = true,
                SingleWriter = false,
            });
            EventHandler<PresentationSnapshot> handler = (_, snapshot) =>
                channel.Writer.TryWrite(snapshot.Version);
            session.Changed += handler;
            using var lifetime = CancellationTokenSource.CreateLinkedTokenSource(
                context.RequestAborted,
                _shutdown.Token);

            try
            {
                await foreach (var version in channel.Reader.ReadAllAsync(lifetime.Token))
                {
                    await context.Response.WriteAsync(
                        $"data: {version}\n\n",
                        lifetime.Token);
                    await context.Response.Body.FlushAsync(lifetime.Token);
                }
            }
            catch (OperationCanceledException) when (lifetime.IsCancellationRequested)
            {
            }
            finally
            {
                session.Changed -= handler;
                channel.Writer.TryComplete();
            }
        });

        application.MapGet($"{prefix}/assets/{{**path}}", (
            HttpContext context,
            string path) => SendDeckAssetAsync(context, path));
        application.MapGet($"{prefix}/theme-assets/{{**path}}", (
            HttpContext context,
            string path) => SendThemeAssetAsync(context, path));
    }

    private async Task SendDeckAssetAsync(HttpContext context, string relativePath)
    {
        var snapshot = session.GetSnapshot();
        if (string.IsNullOrWhiteSpace(snapshot.SourcePath) ||
            string.IsNullOrWhiteSpace(snapshot.WorkspaceRoot))
        {
            context.Response.StatusCode = StatusCodes.Status404NotFound;
            return;
        }

        foreach (var root in new[]
                 {
                     Path.Combine(Path.GetDirectoryName(snapshot.SourcePath)!, "assets"),
                     Path.Combine(snapshot.WorkspaceRoot, "assets"),
                 }.Distinct(StringComparer.OrdinalIgnoreCase))
        {
            if (!Directory.Exists(root))
            {
                continue;
            }

            var resolved = PathSecurity.ResolveFileInside(root, relativePath);
            if (resolved is not null)
            {
                await SendFileAsync(context, resolved, MimeFor(resolved));
                return;
            }
        }

        context.Response.StatusCode = StatusCodes.Status404NotFound;
    }

    private async Task SendThemeAssetAsync(HttpContext context, string relativePath)
    {
        var root = session.GetSnapshot().Theme.AssetRoot;
        if (string.IsNullOrWhiteSpace(root) || !Directory.Exists(root))
        {
            context.Response.StatusCode = StatusCodes.Status404NotFound;
            return;
        }

        var resolved = PathSecurity.ResolveFileInside(root, relativePath);
        if (resolved is null)
        {
            context.Response.StatusCode = StatusCodes.Status404NotFound;
            return;
        }

        await SendFileAsync(context, resolved, MimeFor(resolved));
    }

    private static Task SendStaticAsync(
        HttpContext context,
        string root,
        string relativePath)
    {
        var resolved = PathSecurity.ResolveFileInside(root, relativePath);
        if (resolved is null)
        {
            context.Response.StatusCode = StatusCodes.Status404NotFound;
            return Task.CompletedTask;
        }

        return SendFileAsync(context, resolved, MimeFor(resolved));
    }

    private static async Task SendFileAsync(
        HttpContext context,
        string path,
        string contentType)
    {
        context.Response.ContentType = contentType;
        context.Response.ContentLength = new FileInfo(path).Length;
        await context.Response.SendFileAsync(path, context.RequestAborted);
    }

    private static string MimeFor(string path) =>
        Path.GetExtension(path).ToLowerInvariant() switch
        {
            ".html" => "text/html; charset=utf-8",
            ".css" => "text/css; charset=utf-8",
            ".js" or ".mjs" => "text/javascript; charset=utf-8",
            ".json" => "application/json; charset=utf-8",
            ".svg" => "image/svg+xml",
            ".png" => "image/png",
            ".jpg" or ".jpeg" => "image/jpeg",
            ".gif" => "image/gif",
            ".webp" => "image/webp",
            ".avif" => "image/avif",
            ".ico" => "image/x-icon",
            _ => "application/octet-stream",
        };

    private sealed record NavigationRequest(int? Index, int? Delta);
}
