using PresentationApp;
using PresentationApp.Components;

var builder = WebApplication.CreateBuilder(args);

// Add services to the container.
builder.Services.AddRazorComponents()
    .AddInteractiveServerComponents();
builder.Services.AddSingleton<SlideState>();

var app = builder.Build();

// Configure the HTTP request pipeline.
if (!app.Environment.IsDevelopment())
{
    app.UseExceptionHandler("/Error", createScopeForErrors: true);
    // The default HSTS value is 30 days. You may want to change this for production scenarios, see https://aka.ms/aspnetcore-hsts.
    app.UseHsts();
}
app.UseStatusCodePagesWithReExecute("/not-found", createScopeForStatusCodePages: true);
app.UseAntiforgery();

app.MapStaticAssets();
app.MapRazorComponents<App>()
    .AddInteractiveServerRenderMode();

// Liveness probe used by the presentation skill before opening the canvas.
app.MapGet("/health", (SlideState s) => Results.Json(new { ok = true, version = s.Version }));

// Serves the current slide as a standalone HTML document (no caching so the
// iframe always gets the latest content).
app.MapGet("/slide", (SlideState s, HttpContext ctx) =>
{
    ctx.Response.Headers.CacheControl = "no-store, no-cache, must-revalidate";
    return Results.Content(s.ReadCurrentHtml(), "text/html; charset=utf-8");
});

// Force-create the singleton so the file watcher starts before the first request.
_ = app.Services.GetRequiredService<SlideState>();

app.Run();
