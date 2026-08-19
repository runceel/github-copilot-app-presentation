import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_THEME,
  mapThemeMetadataAssets,
  normalizeTheme,
  parseThemeMetadata,
  parseThemeVariables,
  resolveFrontMatterTheme,
  serializeThemeVariables,
  themeMetadataAssetPaths,
} from "../renderer/theme.mjs";

test("theme resolution defaults to dark and reads front matter", () => {
  assert.equal(normalizeTheme("unknown"), DEFAULT_THEME);
  assert.deepEqual(
    resolveFrontMatterTheme([
      ["---", "theme: custom", "theme-file: ./brand.css", "---", "# Title"].join("\n"),
    ]),
    { theme: "custom", themeFile: "./brand.css" },
  );
});

test("theme CSS accepts custom properties and a root wrapper", () => {
  const variables = parseThemeVariables(`
    :root {
      --bg: #101820;
      --accent: linear-gradient(90deg, #00a4ef, #7fba00);
    }
  `);
  assert.deepEqual(variables, {
    "--bg": "#101820",
    "--accent": "linear-gradient(90deg, #00a4ef, #7fba00)",
  });
  assert.equal(
    serializeThemeVariables(variables),
    "--bg:#101820;--accent:linear-gradient(90deg, #00a4ef, #7fba00);",
  );
});

test("theme CSS rejects selectors and unsafe values", () => {
  assert.throws(() => parseThemeVariables(".deck { color: red; }"), /only --custom-property/);
  assert.throws(() => parseThemeVariables("--bg: url(https://example.test/bg.png);"), /unsafe/);
});

test("theme metadata accepts folder-local assets and maps them to served URLs", () => {
  const metadata = parseThemeMetadata({
    version: 1,
    cover: {
      background: { image: "assets/cover.svg" },
      logo: { image: "assets/brand/logo.svg", alt: "Example" },
    },
    backcover: {
      logo: { image: "assets/brand/logo.svg", alt: "Example" },
      copyright: "Copyright Example",
    },
  });
  assert.deepEqual(themeMetadataAssetPaths(metadata), [
    "assets/cover.svg",
    "assets/brand/logo.svg",
  ]);
  assert.deepEqual(
    mapThemeMetadataAssets(metadata, (path) => `/theme-assets/${path}`),
    {
      version: 1,
      cover: {
        background: { image: "/theme-assets/assets/cover.svg" },
        logo: { image: "/theme-assets/assets/brand/logo.svg", alt: "Example" },
      },
      backcover: {
        logo: { image: "/theme-assets/assets/brand/logo.svg", alt: "Example" },
        copyright: "Copyright Example",
      },
    },
  );
});

test("theme metadata rejects unsafe paths and invalid shapes", () => {
  assert.throws(
    () => parseThemeMetadata({ version: 1, cover: { background: { image: "../cover.svg" } } }),
    /safe path/,
  );
  assert.throws(
    () =>
      parseThemeMetadata({
        version: 1,
        cover: { logo: { image: "assets/logo.svg", alt: "" } },
      }),
    /non-empty/,
  );
  assert.throws(() => parseThemeMetadata({ version: 2 }), /version must be 1/);
  assert.throws(() => parseThemeMetadata({ version: 1, vendor: "Example" }), /not supported/);
});
