using System.Diagnostics;
using Presentation.Core;

namespace PresentationApp.Services;

internal sealed class BrowserPresenterService : IAsyncDisposable
{
    private readonly SemaphoreSlim _gate = new(1, 1);
    private Process? _process;
    private BrowserProcessJob? _job;
    private string _profileDirectory = string.Empty;

    public event EventHandler? StatusChanged;

    public bool IsRunning
    {
        get
        {
            var process = _process;
            return process is not null && !process.HasExited;
        }
    }

    public async Task OpenAsync(Uri baseUri)
    {
        await _gate.WaitAsync();
        try
        {
            if (IsRunning)
            {
                return;
            }

            await StopCoreAsync();
            var browser = FindBrowser()
                ?? throw new InvalidOperationException(
                    "Microsoft Edge, Google Chrome, or Chromium is required.");
            var existingBrowserProcesses =
                Process.GetProcessesByName(Path.GetFileNameWithoutExtension(browser));
            var existingBrowserProcessIds =
                existingBrowserProcesses.Select(process => process.Id).ToHashSet();
            foreach (var existingProcess in existingBrowserProcesses)
            {
                existingProcess.Dispose();
            }
            var profileDirectory = Path.Combine(
                Path.GetTempPath(),
                $"presentation-app-window-{Guid.NewGuid():N}");
            Directory.CreateDirectory(profileDirectory);

            var presenterUri = new UriBuilder(baseUri)
            {
                Query = "present=1",
            }.Uri;
            var startInfo = new ProcessStartInfo(browser)
            {
                UseShellExecute = false,
                CreateNoWindow = false,
            };
            foreach (var argument in BrowserPresenterArguments.Build(
                         profileDirectory,
                         presenterUri))
            {
                startInfo.ArgumentList.Add(argument);
            }

            var process = Process.Start(startInfo)
                ?? throw new InvalidOperationException("The presentation browser did not start.");
            if (existingBrowserProcessIds.Contains(process.Id))
            {
                process.Dispose();
                await DeleteProfileAsync(profileDirectory);
                throw new InvalidOperationException(
                    "The presentation browser reused an existing process. Try closing the audience window and start again.");
            }

            process.EnableRaisingEvents = true;
            process.Exited += OnProcessExited;

            _process = process;
            _profileDirectory = profileDirectory;
            _job = BrowserProcessJob.TryAttach(process);
            if (_job is null)
            {
                await StopCoreAsync();
                throw new InvalidOperationException(
                    "The presentation browser could not be isolated for safe cleanup.");
            }

            var opened = false;
            for (var attempt = 0; attempt < 50; attempt++)
            {
                await Task.Delay(100);
                process.Refresh();
                if (process.HasExited)
                {
                    break;
                }

                if (process.MainWindowHandle != nint.Zero)
                {
                    opened = true;
                    break;
                }
            }

            if (!opened)
            {
                var detail = process.HasExited
                    ? $"exited with code {process.ExitCode}"
                    : "did not create a visible window";
                await StopCoreAsync();
                throw new InvalidOperationException(
                    $"The presentation browser {detail}.");
            }
            StatusChanged?.Invoke(this, EventArgs.Empty);
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
            await StopCoreAsync();
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

    private async Task StopCoreAsync()
    {
        var process = _process;
        var job = _job;
        var profileDirectory = _profileDirectory;
        _process = null;
        _job = null;
        _profileDirectory = string.Empty;

        if (process is not null)
        {
            process.Exited -= OnProcessExited;
        }

        job?.Dispose();
        if (process is not null)
        {
            try
            {
                if (!process.HasExited)
                {
                    process.Kill(entireProcessTree: true);
                }

                await process.WaitForExitAsync().WaitAsync(TimeSpan.FromSeconds(3));
            }
            catch (InvalidOperationException)
            {
            }
            catch (TimeoutException)
            {
            }
            finally
            {
                process.Dispose();
            }
        }

        if (profileDirectory.Length > 0)
        {
            await DeleteProfileAsync(profileDirectory);
        }

        StatusChanged?.Invoke(this, EventArgs.Empty);
    }

    private void OnProcessExited(object? sender, EventArgs args)
    {
        _ = Task.Run(async () =>
        {
            await _gate.WaitAsync();
            try
            {
                if (!ReferenceEquals(sender, _process))
                {
                    return;
                }

                await StopCoreAsync();
            }
            finally
            {
                _gate.Release();
            }
        });
    }

    private static string? FindBrowser()
    {
        var candidates = new[]
        {
            Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles),
                "Microsoft",
                "Edge",
                "Application",
                "msedge.exe"),
            Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86),
                "Microsoft",
                "Edge",
                "Application",
                "msedge.exe"),
            Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                "Microsoft",
                "Edge",
                "Application",
                "msedge.exe"),
            Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles),
                "Google",
                "Chrome",
                "Application",
                "chrome.exe"),
            Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86),
                "Google",
                "Chrome",
                "Application",
                "chrome.exe"),
            Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                "Google",
                "Chrome",
                "Application",
                "chrome.exe"),
        };

        return candidates.FirstOrDefault(File.Exists) ?? FindOnPath("msedge.exe", "chrome.exe", "chromium.exe");
    }

    private static string? FindOnPath(params string[] names)
    {
        foreach (var name in names)
        {
            var startInfo = new ProcessStartInfo("where.exe", name)
            {
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                UseShellExecute = false,
                CreateNoWindow = true,
            };
            using var process = Process.Start(startInfo);
            if (process is null)
            {
                continue;
            }

            var output = process.StandardOutput.ReadToEnd();
            process.WaitForExit();
            var candidate = output
                .Split(['\r', '\n'], StringSplitOptions.RemoveEmptyEntries)
                .Select(value => value.Trim())
                .FirstOrDefault(File.Exists);
            if (candidate is not null)
            {
                return candidate;
            }
        }

        return null;
    }

    private static async Task DeleteProfileAsync(string directory)
    {
        for (var attempt = 0; attempt < 10; attempt++)
        {
            try
            {
                Directory.Delete(directory, recursive: true);
                return;
            }
            catch (IOException) when (attempt < 9)
            {
                await Task.Delay(200);
            }
            catch (UnauthorizedAccessException) when (attempt < 9)
            {
                await Task.Delay(200);
            }
            catch (IOException)
            {
                return;
            }
            catch (UnauthorizedAccessException)
            {
                return;
            }
        }
    }
}
