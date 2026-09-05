import { copyFile, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { renderPage } from "../site/template.mjs";

export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const OUTPUT_DIR = join(REPO_ROOT, "_site");
export const DEFAULT_SITE_URL = "http://localhost:4173/markdstage/";

const ASSETS = [
  ["site/site.css", "assets/site.css"],
  ["site/site.js", "assets/site.js"],
  ["assets/brand/markdstage-mark.svg", "assets/mark.svg"],
  ["assets/readme/architecture-editor.png", "assets/architecture-editor.png"],
  ["site/assets/examples/markdown.png", "assets/examples/markdown.png"],
  ["site/assets/examples/architecture.png", "assets/examples/architecture.png"],
  ["site/examples/markdown.md", "examples/markdown.md"],
  ["site/examples/architecture.md", "examples/architecture.md"],
];
export const SITE_FILES = Object.freeze([
  "index.html", "en/index.html", ".nojekyll", "sitemap.xml",
  ...ASSETS.map(([, destination]) => destination),
]);

export function normalizeSiteUrl(value) {
  const url = new URL(value);
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw new Error("SITE_URL must be an HTTP(S) URL without credentials, a query, or a fragment.");
  }
  url.pathname = `${url.pathname.replace(/\/+$/, "")}/`;
  return url.href;
}

export function validateTranslations(reference, translation, path = "content") {
  if (typeof reference === "string") {
    if (typeof translation !== "string" || !translation.trim() || !reference.trim()) {
      throw new Error(`Missing or empty translation at ${path}.`);
    }
    return;
  }
  if (!reference || !translation || typeof reference !== "object" || typeof translation !== "object" ||
      Array.isArray(reference) !== Array.isArray(translation)) {
    throw new Error(`Translation structure differs at ${path}.`);
  }
  const keys = Object.keys(reference).sort();
  if (JSON.stringify(keys) !== JSON.stringify(Object.keys(translation).sort())) {
    throw new Error(`Translation keys differ at ${path}.`);
  }
  for (const key of keys) validateTranslations(reference[key], translation[key], `${path}.${key}`);
}

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

async function assertCleanOutput(outputDir) {
  let entries;
  try {
    entries = await readdir(outputDir, { recursive: true, withFileTypes: true });
  } catch (error) {
    if (error.code === "ENOENT") return;
    throw error;
  }
  const allowed = new Set(SITE_FILES.map((file) => resolve(outputDir, file)));
  for (const entry of entries) {
    if (entry.isDirectory()) continue;
    const path = join(entry.parentPath, entry.name);
    if (entry.isSymbolicLink() || !allowed.has(path)) {
      throw new Error(`Unexpected file in site output: ${path}. Remove it before publishing.`);
    }
  }
}

export async function buildSite({ outputDir = OUTPUT_DIR, siteUrl = process.env.SITE_URL || DEFAULT_SITE_URL } = {}) {
  const url = normalizeSiteUrl(siteUrl);
  const root = resolve(outputDir);
  if (root === REPO_ROOT || root === dirname(REPO_ROOT)) {
    throw new Error("Site output must be a dedicated directory, not the repository root.");
  }
  const product = await readJson(join(REPO_ROOT, "site/content/product.json"));
  if (!/^v\d+\.\d+\.\d+$/.test(product.releaseTag)) {
    throw new Error("The Canvas installation must reference a stable release tag.");
  }
  for (const key of ["repository", "macUrl"]) {
    if (new URL(product[key]).protocol !== "https:") throw new Error(`${key} must use HTTPS.`);
  }
  const ja = await readJson(join(REPO_ROOT, "site/content/ja.json"));
  const en = await readJson(join(REPO_ROOT, "site/content/en.json"));
  validateTranslations(ja, en);
  if (ja.lang !== "ja" || en.lang !== "en" || ja.steps.length !== 3) {
    throw new Error("Expected Japanese and English content with three workflow steps.");
  }
  const sources = {
    markdown: await readFile(join(REPO_ROOT, "site/examples/markdown.md"), "utf8"),
    architecture: await readFile(join(REPO_ROOT, "site/examples/architecture.md"), "utf8"),
  };
  const pages = [ja, en].map((copy) => renderPage({ copy, product, sources, siteUrl: url }));
  await assertCleanOutput(root);
  await mkdir(join(root, "en"), { recursive: true });
  await writeFile(join(root, "index.html"), pages[0]);
  await writeFile(join(root, "en/index.html"), pages[1]);
  for (const [source, destination] of ASSETS) {
    const target = join(root, destination);
    await mkdir(dirname(target), { recursive: true });
    await copyFile(join(REPO_ROOT, source), target);
  }
  await writeFile(join(root, ".nojekyll"), "");
  const xmlUrl = (value) => value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
  await writeFile(join(root, "sitemap.xml"), `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>${xmlUrl(url)}</loc></url>
  <url><loc>${xmlUrl(new URL("en/", url).href)}</loc></url>
</urlset>
`);
  return { outputDir: root, siteUrl: url, files: [...SITE_FILES] };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const result = await buildSite();
  console.log(`Built ${result.files.length} files in ${result.outputDir}\nSite URL: ${result.siteUrl}`);
}
