export const BUILTIN_THEMES = new Set(["dark", "light", "microsoft", "ms-modern"]);
export const THEMES = new Set([...BUILTIN_THEMES, "custom"]);
export const DEFAULT_THEME = "dark";

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
