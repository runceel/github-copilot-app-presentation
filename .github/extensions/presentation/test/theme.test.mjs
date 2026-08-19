import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_THEME,
  normalizeTheme,
  parseThemeVariables,
  resolveFrontMatterTheme,
  serializeThemeVariables,
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
