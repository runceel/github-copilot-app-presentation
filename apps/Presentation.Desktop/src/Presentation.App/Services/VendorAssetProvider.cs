using System.Security.Cryptography;
using System.Text.Json;

namespace PresentationApp.Services;

internal sealed class VendorAssetProvider
{
    private readonly string _vendorDirectory;
    private byte[]? _mermaid;

    public VendorAssetProvider(string webRoot)
    {
        _vendorDirectory = Path.Combine(webRoot, "vendor");
    }

    public async Task<byte[]> GetMermaidAsync(CancellationToken cancellationToken)
    {
        if (_mermaid is not null)
        {
            return _mermaid;
        }

        var manifestPath = Path.Combine(_vendorDirectory, "vendor-assets.lock.json");
        await using var manifestStream = File.OpenRead(manifestPath);
        using var manifest = await JsonDocument.ParseAsync(manifestStream, cancellationToken: cancellationToken);
        var asset = manifest.RootElement
            .GetProperty("assets")
            .GetProperty("mermaid.min.js");

        using var output = new MemoryStream(asset.GetProperty("size").GetInt32());
        foreach (var chunk in asset.GetProperty("chunks").EnumerateArray())
        {
            var file = chunk.GetProperty("file").GetString()
                ?? throw new InvalidDataException("Mermaid chunk file is missing.");
            var expectedHash = chunk.GetProperty("sha256").GetString()
                ?? throw new InvalidDataException("Mermaid chunk hash is missing.");
            var bytes = await File.ReadAllBytesAsync(
                Path.Combine(_vendorDirectory, file),
                cancellationToken);
            VerifyHash(bytes, expectedHash, file);
            await output.WriteAsync(bytes, cancellationToken);
        }

        var combined = output.ToArray();
        if (combined.Length != asset.GetProperty("size").GetInt32())
        {
            throw new InvalidDataException("Mermaid asset size does not match its manifest.");
        }

        VerifyHash(
            combined,
            asset.GetProperty("sha256").GetString()
                ?? throw new InvalidDataException("Mermaid asset hash is missing."),
            "mermaid.min.js");
        _mermaid = combined;
        return combined;
    }

    private static void VerifyHash(byte[] bytes, string expected, string name)
    {
        var actual = Convert.ToHexStringLower(SHA256.HashData(bytes));
        if (!actual.Equals(expected, StringComparison.OrdinalIgnoreCase))
        {
            throw new InvalidDataException($"{name} failed SHA-256 verification.");
        }
    }
}
