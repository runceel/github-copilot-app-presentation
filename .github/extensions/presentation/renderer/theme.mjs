export const BUILTIN_THEMES = new Set(["dark", "light", "microsoft"]);
export const THEMES = new Set([...BUILTIN_THEMES, "custom"]);
export const DEFAULT_THEME = "dark";
export const THEME_METADATA_VERSION = 1;
export const THEME_ASSET_MAX_BYTES = 2 * 1024 * 1024;

const THEME_ASSET_SEGMENT = "[A-Za-z0-9][A-Za-z0-9_-]*(?:\\.[A-Za-z0-9_-]+)*";
const THEME_ASSET_PATTERN = new RegExp(
  `^assets/(?:${THEME_ASSET_SEGMENT}/)*${THEME_ASSET_SEGMENT}\\.(?:svg|png|webp|jpg|jpeg)$`,
  "i",
);

export function normalizeTheme(value) {
  const theme = typeof value === "string" ? value.trim().toLowerCase() : "";
  return THEMES.has(theme) ? theme : DEFAULT_THEME;
}

export function parseFrontMatter(markdown) {
  const meta = {};
  const text = String(markdown ?? "").replace(/\r\n?/g, "\n");
  const trimmed = text.replace(/^[\n \t\uFEFF]+/, "");
  if (!trimmed.startsWith("---\n") && trimmed !== "---") return meta;
  const lines = trimmed.split("\n");
  for (let index = 1; index < lines.length; index += 1) {
    if (lines[index].trim() === "---") break;
    const separator = lines[index].indexOf(":");
    if (separator <= 0) continue;
    const key = lines[index].slice(0, separator).trim();
    const value = lines[index]
      .slice(separator + 1)
      .trim()
      .replace(/^["']+|["']+$/g, "");
    if (key) meta[key] = value;
  }
  return meta;
}

export function resolveFrontMatterTheme(slides) {
  for (const slide of Array.isArray(slides) ? slides : []) {
    const meta = parseFrontMatter(slide);
    if (typeof meta.theme === "string" && meta.theme.trim()) {
      return {
        theme: normalizeTheme(meta.theme),
        themeFile: typeof meta["theme-file"] === "string" ? meta["theme-file"].trim() : "",
      };
    }
    if (typeof meta["theme-file"] === "string" && meta["theme-file"].trim()) {
      return { theme: "custom", themeFile: meta["theme-file"].trim() };
    }
  }
  return { theme: DEFAULT_THEME, themeFile: "" };
}

function stripCssComments(css) {
  return String(css ?? "").replace(/\/\*[\s\S]*?\*\//g, "");
}

export function parseThemeVariables(css) {
  let body = stripCssComments(css).trim();
  if (body.startsWith(":root")) {
    const match = body.match(/^:root\s*\{([\s\S]*)\}\s*$/);
    if (!match) throw new Error("custom theme CSS must contain only a complete :root block");
    body = match[1].trim();
  }
  const variables = {};
  for (const declaration of body.split(";")) {
    const item = declaration.trim();
    if (!item) continue;
    const match = item.match(/^(--[A-Za-z0-9_-]+)\s*:\s*(.+)$/s);
    if (!match) {
      throw new Error("custom theme CSS may contain only --custom-property declarations");
    }
    const value = match[2].trim();
    if (
      !value ||
      /<\/?style\b|@import\b|expression\s*\(|javascript\s*:|url\s*\(/i.test(value)
    ) {
      throw new Error(`custom theme CSS contains an unsafe value for ${match[1]}`);
    }
    variables[match[1]] = value;
  }
  if (Object.keys(variables).length === 0) {
    throw new Error("custom theme CSS must define at least one custom property");
  }
  return variables;
}

export function serializeThemeVariables(variables) {
  return Object.entries(variables)
    .map(([name, value]) => `${name}:${value};`)
    .join("");
}

function assertPlainObject(value, path) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${path} must be an object`);
  }
  return value;
}

function assertOnlyKeys(value, allowed, path) {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) throw new Error(`${path}.${key} is not supported`);
  }
}

function parseImage(value, path, { altRequired = false } = {}) {
  const image = assertPlainObject(value, path);
  assertOnlyKeys(image, new Set(["image", "alt"]), path);
  if (
    typeof image.image !== "string" ||
    image.image.length > 200 ||
    !THEME_ASSET_PATTERN.test(image.image)
  ) {
    throw new Error(
      `${path}.image must be a safe path under the theme assets/ folder using svg, png, webp, jpg, or jpeg`,
    );
  }
  const alt = typeof image.alt === "string" ? image.alt.trim() : "";
  if (altRequired && !alt) throw new Error(`${path}.alt must be a non-empty string`);
  return { image: image.image, ...(alt ? { alt } : {}) };
}

export function parseThemeMetadata(value) {
  const metadata = typeof value === "string" ? JSON.parse(value) : value;
  const root = assertPlainObject(metadata, "theme metadata");
  assertOnlyKeys(root, new Set(["$schema", "version", "cover", "backcover"]), "theme metadata");
  if (root.version !== THEME_METADATA_VERSION) {
    throw new Error(`theme metadata version must be ${THEME_METADATA_VERSION}`);
  }

  const result = { version: THEME_METADATA_VERSION };
  if (root.cover !== undefined) {
    const cover = assertPlainObject(root.cover, "cover");
    assertOnlyKeys(cover, new Set(["background", "logo"]), "cover");
    result.cover = {};
    if (cover.background !== undefined) {
      result.cover.background = parseImage(cover.background, "cover.background");
    }
    if (cover.logo !== undefined) {
      result.cover.logo = parseImage(cover.logo, "cover.logo", { altRequired: true });
    }
    if (Object.keys(result.cover).length === 0) delete result.cover;
  }

  if (root.backcover !== undefined) {
    const backcover = assertPlainObject(root.backcover, "backcover");
    assertOnlyKeys(backcover, new Set(["logo", "copyright"]), "backcover");
    result.backcover = {};
    if (backcover.logo !== undefined) {
      result.backcover.logo = parseImage(backcover.logo, "backcover.logo", {
        altRequired: true,
      });
    }
    if (backcover.copyright !== undefined) {
      if (typeof backcover.copyright !== "string") {
        throw new Error("backcover.copyright must be a string");
      }
      result.backcover.copyright = backcover.copyright;
    }
    if (Object.keys(result.backcover).length === 0) delete result.backcover;
  }
  return result;
}

export function themeMetadataAssetPaths(metadata) {
  const paths = [];
  const add = (entry) => {
    if (entry?.image && !paths.includes(entry.image)) paths.push(entry.image);
  };
  add(metadata?.cover?.background);
  add(metadata?.cover?.logo);
  add(metadata?.backcover?.logo);
  return paths;
}

export function mapThemeMetadataAssets(metadata, mapAsset) {
  const mapImage = (entry) =>
    entry ? { ...entry, image: mapAsset(entry.image) } : undefined;
  return {
    version: metadata.version,
    ...(metadata.cover
      ? {
          cover: {
            ...(metadata.cover.background
              ? { background: mapImage(metadata.cover.background) }
              : {}),
            ...(metadata.cover.logo ? { logo: mapImage(metadata.cover.logo) } : {}),
          },
        }
      : {}),
    ...(metadata.backcover
      ? {
          backcover: {
            ...(metadata.backcover.logo
              ? { logo: mapImage(metadata.backcover.logo) }
              : {}),
            ...("copyright" in metadata.backcover
              ? { copyright: metadata.backcover.copyright }
              : {}),
          },
        }
      : {}),
  };
}
