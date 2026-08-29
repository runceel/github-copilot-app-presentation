using System.Runtime.InteropServices;
using System.Text;
using Microsoft.Win32.SafeHandles;

namespace PresentationApp.Services;

internal static class PathSecurity
{
    private const uint FileFlagBackupSemantics = 0x02000000;

    public static string CanonicalizeExisting(string path)
    {
        using var handle = CreateFile(
            Path.GetFullPath(path),
            0,
            FileShare.Read | FileShare.Write | FileShare.Delete,
            nint.Zero,
            FileMode.Open,
            FileFlagBackupSemantics,
            nint.Zero);

        if (handle.IsInvalid)
        {
            throw new IOException(
                $"Could not resolve path '{path}'.",
                Marshal.GetExceptionForHR(Marshal.GetHRForLastWin32Error()));
        }

        var capacity = 512u;
        while (true)
        {
            var builder = new StringBuilder((int)capacity);
            var length = GetFinalPathNameByHandle(handle, builder, capacity, 0);
            if (length == 0)
            {
                throw new IOException(
                    $"Could not resolve path '{path}'.",
                    Marshal.GetExceptionForHR(Marshal.GetHRForLastWin32Error()));
            }

            if (length < capacity)
            {
                return NormalizeDevicePath(builder.ToString());
            }

            capacity = length + 1;
        }
    }

    public static bool IsInside(string root, string candidate)
    {
        var canonicalRoot = CanonicalizeExisting(root).TrimEnd(Path.DirectorySeparatorChar);
        var canonicalCandidate = CanonicalizeExisting(candidate);
        return canonicalCandidate.Equals(canonicalRoot, StringComparison.OrdinalIgnoreCase) ||
               canonicalCandidate.StartsWith(
                   canonicalRoot + Path.DirectorySeparatorChar,
                   StringComparison.OrdinalIgnoreCase);
    }

    public static string? ResolveFileInside(string root, string relativePath)
    {
        if (string.IsNullOrWhiteSpace(relativePath) ||
            Path.IsPathRooted(relativePath) ||
            relativePath.Contains('\0'))
        {
            return null;
        }

        var candidate = Path.GetFullPath(Path.Combine(root, relativePath));
        var fullRoot = Path.GetFullPath(root).TrimEnd(Path.DirectorySeparatorChar);
        if (!candidate.Equals(fullRoot, StringComparison.OrdinalIgnoreCase) &&
            !candidate.StartsWith(
                fullRoot + Path.DirectorySeparatorChar,
                StringComparison.OrdinalIgnoreCase))
        {
            return null;
        }

        if (!File.Exists(candidate) || !IsInside(root, candidate))
        {
            return null;
        }

        return CanonicalizeExisting(candidate);
    }

    private static string NormalizeDevicePath(string path)
    {
        const string uncPrefix = @"\\?\UNC\";
        const string devicePrefix = @"\\?\";

        if (path.StartsWith(uncPrefix, StringComparison.OrdinalIgnoreCase))
        {
            return @"\\" + path[uncPrefix.Length..];
        }

        return path.StartsWith(devicePrefix, StringComparison.OrdinalIgnoreCase)
            ? path[devicePrefix.Length..]
            : path;
    }

    [DllImport(
        "kernel32.dll",
        EntryPoint = "CreateFileW",
        SetLastError = true,
        CharSet = CharSet.Unicode)]
    private static extern SafeFileHandle CreateFile(
        string fileName,
        uint desiredAccess,
        FileShare shareMode,
        nint securityAttributes,
        FileMode creationDisposition,
        uint flagsAndAttributes,
        nint templateFile);

    [DllImport(
        "kernel32.dll",
        EntryPoint = "GetFinalPathNameByHandleW",
        SetLastError = true,
        CharSet = CharSet.Unicode)]
    private static extern uint GetFinalPathNameByHandle(
        SafeFileHandle file,
        [Out] StringBuilder filePath,
        uint filePathLength,
        uint flags);
}
