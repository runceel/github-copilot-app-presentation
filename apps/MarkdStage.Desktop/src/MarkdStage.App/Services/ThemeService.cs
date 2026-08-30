using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;
using MarkdStage.Core;

namespace MarkdStageApp.Services;

internal sealed partial class ThemeService
{
    private const long ThemeFileMaxBytes = 64 * 1024;
    private const long ThemeAssetMaxBytes = 2 * 1024 * 1024;

    public async Task<ThemeState> LoadAsync(
        DeckDocument document,
        string sourcePath,
        string workspaceRoot,
        CancellationToken cancellationToken)
    {
        if (!document.Theme.Equals("custom", StringComparison.OrdinalIgnoreCase))
        {
            return new ThemeState(document.Theme);
        }

        if (string.IsNullOrWhiteSpace(document.ThemeFile))
        {
            throw new DeckLoadException("Custom theme requires a theme-file value.");
        }

        var themePath = ResolveThemeFile(sourcePath, workspaceRoot, document.ThemeFile)
            ?? throw new DeckLoadException($"Custom theme was not found: {document.ThemeFile}");

        var themeInfo = new FileInfo(themePath);
        if (themeInfo.Length > ThemeFileMaxBytes)
        {
            throw new DeckLoadException("Custom theme CSS must be 64 KiB or smaller.");
        }

        var css = await File.ReadAllTextAsync(themePath, cancellationToken);
        var serializedCss = ParseThemeVariables(css);
        var themeDirectory = Path.GetDirectoryName(themePath)!;
        var metadataPath = Path.Combine(themeDirectory, "theme.json");
        var metadataJson = string.Empty;

        if (File.Exists(metadataPath))
        {
            if (!PathSecurity.IsInside(themeDirectory, metadataPath))
            {
                throw new DeckLoadException("Custom theme metadata must stay inside its theme folder.");
            }

            var metadataInfo = new FileInfo(metadataPath);
            if (metadataInfo.Length > ThemeFileMaxBytes)
            {
                throw new DeckLoadException("Custom theme metadata must be 64 KiB or smaller.");
            }

            var source = await File.ReadAllTextAsync(metadataPath, cancellationToken);
            metadataJson = ValidateAndMapMetadata(source, themeDirectory);
        }

        return new ThemeState("custom", serializedCss, metadataJson, themeDirectory);
    }

    private static string? ResolveThemeFile(
        string sourcePath,
        string workspaceRoot,
        string themeFile)
    {
        if (Path.IsPathRooted(themeFile) || themeFile.Contains('\0'))
        {
            return null;
        }

        var roots = new[]
        {
            Path.GetDirectoryName(sourcePath)!,
            workspaceRoot,
        }.Distinct(StringComparer.OrdinalIgnoreCase);

        foreach (var root in roots)
        {
            var resolved = PathSecurity.ResolveFileInside(root, themeFile);
            if (resolved is not null && PathSecurity.IsInside(workspaceRoot, resolved))
            {
                return resolved;
            }
        }

        return null;
    }

    private static string ParseThemeVariables(string css)
    {
        var body = CssCommentRegex().Replace(css, string.Empty).Trim();
        if (body.StartsWith(":root", StringComparison.Ordinal))
        {
            var match = RootBlockRegex().Match(body);
            if (!match.Success)
            {
                throw new DeckLoadException(
                    "Custom theme CSS must contain only a complete :root block.");
            }

            body = match.Groups[1].Value.Trim();
        }

        var values = new List<string>();
        foreach (var declaration in body.Split(';'))
        {
            var item = declaration.Trim();
            if (item.Length == 0)
            {
                continue;
            }

            var match = VariableRegex().Match(item);
            if (!match.Success)
            {
                throw new DeckLoadException(
                    "Custom theme CSS may contain only custom property declarations.");
            }

            var value = match.Groups[2].Value.Trim();
            if (value.Length == 0 || UnsafeCssValueRegex().IsMatch(value))
            {
                throw new DeckLoadException(
                    $"Custom theme CSS contains an unsafe value for {match.Groups[1].Value}.");
            }

            values.Add($"{match.Groups[1].Value}:{value};");
        }

        if (values.Count == 0)
        {
            throw new DeckLoadException("Custom theme CSS must define at least one custom property.");
        }

        return string.Concat(values);
    }

    private static string ValidateAndMapMetadata(string source, string themeDirectory)
    {
        try
        {
            return ValidateAndMapMetadataCore(source, themeDirectory);
        }
        catch (DeckLoadException)
        {
            throw;
        }
        catch (Exception error) when (
            error is InvalidOperationException or FormatException or OverflowException)
        {
            throw new DeckLoadException("Custom theme metadata has an invalid value.", error);
        }
    }

    private static string ValidateAndMapMetadataCore(string source, string themeDirectory)
    {
        JsonNode root;
        try
        {
            root = JsonNode.Parse(source)
                ?? throw new DeckLoadException("Custom theme metadata is empty.");
        }
        catch (JsonException error)
        {
            throw new DeckLoadException("Custom theme metadata is not valid JSON.", error);
        }

        if (root is not JsonObject metadata ||
            metadata["version"] is not JsonValue versionValue ||
            !versionValue.TryGetValue<int>(out var version) ||
            version != 1)
        {
            throw new DeckLoadException("Custom theme metadata version must be 1.");
        }

        ValidateOnlyKeys(metadata, "$schema", "version", "cover", "backcover");
        ValidateSection(metadata["cover"], themeDirectory, "background", "logo");
        ValidateSection(metadata["backcover"], themeDirectory, "logo", "copyright");

        foreach (var imageNode in metadata
                     .AsObject()
                     .SelectMany(pair => EnumerateImageNodes(pair.Value)))
        {
            if (imageNode["image"] is not JsonValue imageValue ||
                !imageValue.TryGetValue<string>(out var relative))
            {
                throw new DeckLoadException("Theme image path must be a string.");
            }

            imageNode["image"] = $"theme-assets/{relative.Replace('\\', '/')}";
        }

        return metadata.ToJsonString();
    }

    private static void ValidateSection(
        JsonNode? node,
        string themeDirectory,
        params string[] allowedKeys)
    {
        if (node is null)
        {
            return;
        }

        if (node is not JsonObject section)
        {
            throw new DeckLoadException("Custom theme metadata sections must be objects.");
        }

        ValidateOnlyKeys(section, allowedKeys);
        foreach (var pair in section)
        {
            if (pair.Key == "copyright")
            {
                if (pair.Value is not JsonValue copyright ||
                    !copyright.TryGetValue<string>(out _))
                {
                    throw new DeckLoadException("Theme copyright must be a string.");
                }
                continue;
            }

            if (pair.Value is not JsonObject image)
            {
                throw new DeckLoadException("Theme image entries must be objects.");
            }

            ValidateOnlyKeys(image, "image", "alt");
            if (image["image"] is not JsonValue imagePath ||
                !imagePath.TryGetValue<string>(out var relative))
            {
                throw new DeckLoadException("Theme image path must be a string.");
            }

            if (!ThemeAssetRegex().IsMatch(relative))
            {
                throw new DeckLoadException($"Invalid custom theme asset path: {relative}");
            }

            var asset = PathSecurity.ResolveFileInside(themeDirectory, relative)
                ?? throw new DeckLoadException($"Custom theme asset was not found: {relative}");
            if (new FileInfo(asset).Length > ThemeAssetMaxBytes)
            {
                throw new DeckLoadException($"Custom theme asset must be 2 MiB or smaller: {relative}");
            }

            if (pair.Key == "logo")
            {
                if (image["alt"] is not JsonValue altValue ||
                    !altValue.TryGetValue<string>(out var alt) ||
                    string.IsNullOrWhiteSpace(alt))
                {
                    throw new DeckLoadException("Theme logos require non-empty alt text.");
                }
            }
            else if (image["alt"] is JsonValue optionalAlt &&
                     !optionalAlt.TryGetValue<string>(out _))
            {
                throw new DeckLoadException("Theme image alt text must be a string.");
            }
        }
    }

    private static IEnumerable<JsonObject> EnumerateImageNodes(JsonNode? node)
    {
        if (node is JsonObject objectNode)
        {
            if (objectNode.ContainsKey("image"))
            {
                yield return objectNode;
            }

            foreach (var child in objectNode)
            {
                foreach (var nested in EnumerateImageNodes(child.Value))
                {
                    yield return nested;
                }
            }
        }
    }

    private static void ValidateOnlyKeys(JsonObject value, params string[] allowedKeys)
    {
        var allowed = allowedKeys.ToHashSet(StringComparer.Ordinal);
        var unsupported = value.Select(pair => pair.Key).FirstOrDefault(key => !allowed.Contains(key));
        if (unsupported is not null)
        {
            throw new DeckLoadException($"Custom theme metadata key is not supported: {unsupported}");
        }
    }

    [GeneratedRegex(@"/\*[\s\S]*?\*/")]
    private static partial Regex CssCommentRegex();

    [GeneratedRegex(@"^:root\s*\{([\s\S]*)\}\s*$")]
    private static partial Regex RootBlockRegex();

    [GeneratedRegex(@"^(--[A-Za-z0-9_-]+)\s*:\s*(.+)$", RegexOptions.Singleline)]
    private static partial Regex VariableRegex();

    [GeneratedRegex(@"</?style\b|@import\b|expression\s*\(|javascript\s*:|url\s*\(", RegexOptions.IgnoreCase)]
    private static partial Regex UnsafeCssValueRegex();

    [GeneratedRegex(
        @"^assets/(?:[A-Za-z0-9][A-Za-z0-9_-]*(?:\.[A-Za-z0-9_-]+)*/)*[A-Za-z0-9][A-Za-z0-9_-]*(?:\.[A-Za-z0-9_-]+)*\.(?:svg|png|webp|jpg|jpeg)$",
        RegexOptions.IgnoreCase)]
    private static partial Regex ThemeAssetRegex();
}
