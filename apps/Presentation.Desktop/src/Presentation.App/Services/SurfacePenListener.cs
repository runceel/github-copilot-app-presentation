using System.Diagnostics;
using System.Text.Json;

namespace PresentationApp.Services;

/// <summary>
/// Runs the same Surface Pen tail-button bridge used by the presentation canvas.
/// The bridge is active only while the user-opened presenter window is active.
/// It accepts navigation messages only; pen input can never open or close a presenter.
/// </summary>
internal sealed class SurfacePenListener(Action<int> navigate) : IAsyncDisposable
{
    private static readonly TimeSpan StartTimeout = TimeSpan.FromSeconds(2);
    private static readonly TimeSpan StopTimeout = TimeSpan.FromSeconds(2);

    private readonly SemaphoreSlim _gate = new(1, 1);
    private Process? _process;
    private TaskCompletionSource<bool>? _ready;
    private bool _isReady;

    public async Task StartAsync()
    {
        await _gate.WaitAsync();
        try
        {
            if (_process is { HasExited: false })
            {
                return;
            }

            var script = Path.Combine(
                AppContext.BaseDirectory,
                "SurfacePen",
                "pen-button-listener.ps1");
            var systemRoot = Environment.GetFolderPath(Environment.SpecialFolder.Windows);
            var powerShell = Path.Combine(
                systemRoot,
                "System32",
                "WindowsPowerShell",
                "v1.0",
                "powershell.exe");
            if (!File.Exists(script) || !File.Exists(powerShell))
            {
                Debug.WriteLine(
                    "Surface Pen listener is unavailable because its script or Windows PowerShell is missing.");
                return;
            }

            var startInfo = new ProcessStartInfo
            {
                FileName = powerShell,
                CreateNoWindow = true,
                UseShellExecute = false,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
            };
            foreach (var argument in new[]
                     {
                         "-NoLogo",
                         "-NoProfile",
                         "-NonInteractive",
                         "-ExecutionPolicy",
                         "Bypass",
                         "-File",
                         script,
                         "-ParentProcessId",
                         Environment.ProcessId.ToString(),
                     })
            {
                startInfo.ArgumentList.Add(argument);
            }

            var process = new Process
            {
                StartInfo = startInfo,
                EnableRaisingEvents = true,
            };
            process.OutputDataReceived += OnOutputDataReceived;
            process.ErrorDataReceived += OnErrorDataReceived;
            process.Exited += OnProcessExited;
            try
            {
                if (!process.Start())
                {
                    Debug.WriteLine("Surface Pen listener process did not start.");
                    process.Dispose();
                    return;
                }

                _process = process;
                _ready = new TaskCompletionSource<bool>(
                    TaskCreationOptions.RunContinuationsAsynchronously);
                _isReady = false;
                process.BeginOutputReadLine();
                process.BeginErrorReadLine();

                bool ready;
                try
                {
                    ready = await _ready.Task.WaitAsync(StartTimeout);
                }
                catch (TimeoutException)
                {
                    ready = false;
                }

                if (!ready)
                {
                    _process = null;
                    _ready = null;
                    Detach(process);
                    await StopProcessAsync(process);
                }
            }
            catch (Exception error) when (
                error is InvalidOperationException or System.ComponentModel.Win32Exception)
            {
                process.OutputDataReceived -= OnOutputDataReceived;
                process.ErrorDataReceived -= OnErrorDataReceived;
                process.Exited -= OnProcessExited;
                process.Dispose();
                Debug.WriteLine($"Surface Pen listener could not start: {error.Message}");
            }
        }
        finally
        {
            _gate.Release();
        }
    }

    public async Task StopAsync()
    {
        await _gate.WaitAsync();
        try
        {
            var process = _process;
            _process = null;
            _ready?.TrySetResult(false);
            _ready = null;
            _isReady = false;
            if (process is null)
            {
                return;
            }

            Detach(process);
            await StopProcessAsync(process);
        }
        finally
        {
            _gate.Release();
        }
    }

    public async ValueTask DisposeAsync()
    {
        await StopAsync();
        _gate.Dispose();
    }

    private void OnOutputDataReceived(object sender, DataReceivedEventArgs args)
    {
        if (string.IsNullOrWhiteSpace(args.Data) ||
            !ReferenceEquals(sender, _process))
        {
            return;
        }

        try
        {
            using var document = JsonDocument.Parse(args.Data);
            var root = document.RootElement;
            if (!root.TryGetProperty("type", out var type))
            {
                return;
            }

            if (type.GetString() == "status" &&
                root.TryGetProperty("supported", out var supported) &&
                supported.ValueKind is JsonValueKind.True or JsonValueKind.False)
            {
                _isReady = supported.GetBoolean();
                _ready?.TrySetResult(_isReady);
                return;
            }

            if (!_isReady ||
                type.GetString() != "navigate" ||
                !root.TryGetProperty("action", out var action))
            {
                return;
            }

            var delta = action.GetString() switch
            {
                "next" => 1,
                "previous" => -1,
                _ => 0,
            };
            if (delta != 0)
            {
                navigate(delta);
            }
        }
        catch (JsonException error)
        {
            Debug.WriteLine($"Surface Pen listener returned invalid JSON: {error.Message}");
        }
    }

    private static void OnErrorDataReceived(object sender, DataReceivedEventArgs args)
    {
        if (!string.IsNullOrWhiteSpace(args.Data))
        {
            Debug.WriteLine($"Surface Pen listener: {args.Data}");
        }
    }

    private void OnProcessExited(object? sender, EventArgs args)
    {
        if (ReferenceEquals(sender, _process))
        {
            _ready?.TrySetResult(false);
        }
    }

    private void Detach(Process process)
    {
        process.OutputDataReceived -= OnOutputDataReceived;
        process.ErrorDataReceived -= OnErrorDataReceived;
        process.Exited -= OnProcessExited;
    }

    private static async Task StopProcessAsync(Process process)
    {
        try
        {
            process.CancelOutputRead();
            process.CancelErrorRead();
            if (!process.HasExited)
            {
                process.Kill(entireProcessTree: true);
                using var timeout = new CancellationTokenSource(StopTimeout);
                await process.WaitForExitAsync(timeout.Token);
            }
        }
        catch (Exception error) when (
            error is InvalidOperationException or OperationCanceledException)
        {
            Debug.WriteLine($"Surface Pen listener cleanup did not complete: {error.Message}");
        }
        finally
        {
            process.Dispose();
        }
    }
}
