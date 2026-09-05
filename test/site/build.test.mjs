import assert from "node:assert/strict";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import test from "node:test";

import { buildSite, normalizeSiteUrl, SITE_FILES, validateTranslations } from "../../scripts/build-site.mjs";
import { escapeHtml, renderPage } from "../../site/template.mjs";
import { createWorkspace, readContent, repository } from "./helpers.mjs";

const expectedFiles = [
  ".nojekyll", "assets/architecture-editor.png", "assets/examples/architecture.png",
  "assets/examples/markdown.png", "assets/mark.svg", "assets/site.css", "assets/site.js",
  "en/index.html", "examples/architecture.md", "examples/markdown.md", "index.html", "sitemap.xml",
].sort();

async function listFiles(directory) {
  const entries = await readdir(directory, { recursive: true, withFileTypes: true });
  return entries.filter((entry) => !entry.isDirectory()).map((entry) => {
    assert.equal(entry.isSymbolicLink(), false, `Published output must not contain a symlink: ${entry.name}`);
    return relative(directory, join(entry.parentPath, entry.name)).replaceAll("\\", "/");
  }).sort();
}

test("build publishes exactly the explicit allowlist, copies assets, and rebuilds deterministically", async (t) => {
  const workspace = await createWorkspace();
  t.after(workspace.dispose);
  const outputDir = join(workspace.directory, "output");
  const result = await buildSite({ outputDir, siteUrl: "https://example.test/markdstage" });
  assert.equal(result.outputDir, outputDir);
  assert.equal(result.siteUrl, "https://example.test/markdstage/");
  assert.deepEqual([...SITE_FILES].sort(), expectedFiles);
  assert.deepEqual(result.files.sort(), expectedFiles);
  assert.deepEqual(await listFiles(outputDir), expectedFiles);
  assert.equal(await readFile(join(outputDir, ".nojekyll"), "utf8"), "");

  const copies = {
    "assets/site.css": "site/site.css",
    "assets/site.js": "site/site.js",
    "assets/mark.svg": "assets/brand/markdstage-mark.svg",
    "assets/architecture-editor.png": "assets/readme/architecture-editor.png",
    "assets/examples/markdown.png": "site/assets/examples/markdown.png",
    "assets/examples/architecture.png": "site/assets/examples/architecture.png",
    "examples/markdown.md": "site/examples/markdown.md",
    "examples/architecture.md": "site/examples/architecture.md",
  };
  for (const [destination, source] of Object.entries(copies)) {
    assert.deepEqual(await readFile(join(outputDir, destination)), await readFile(join(repository, source)), destination);
  }

  const before = await Promise.all(expectedFiles.map((file) => readFile(join(outputDir, file))));
  result.files.push("must-not-change-the-allowlist");
  const rebuilt = await buildSite({ outputDir, siteUrl: result.siteUrl });
  assert.deepEqual(rebuilt.files.sort(), expectedFiles);
  assert.deepEqual(await listFiles(outputDir), expectedFiles);
  assert.deepEqual(await Promise.all(expectedFiles.map((file) => readFile(join(outputDir, file)))), before);
});

for (const basePath of ["/", "/markdstage/"]) {
  test(`both locales have canonical, alternate, and share URLs under ${basePath}`, async (t) => {
    const workspace = await createWorkspace();
    t.after(workspace.dispose);
    const siteUrl = `https://example.test${basePath}`;
    const { outputDir } = await buildSite({ outputDir: join(workspace.directory, "output"), siteUrl });
    for (const [lang, path] of [["ja", "index.html"], ["en", "en/index.html"]]) {
      const html = await readFile(join(outputDir, path), "utf8");
      const pageUrl = lang === "ja" ? siteUrl : `${siteUrl}en/`;
      assert.ok(html.includes(`<html lang="${lang}">`));
      assert.ok(html.includes(`<link rel="canonical" href="${pageUrl}">`));
      assert.ok(html.includes(`<link rel="alternate" hreflang="ja" href="${siteUrl}">`));
      assert.ok(html.includes(`<link rel="alternate" hreflang="en" href="${siteUrl}en/">`));
      assert.ok(html.includes(`<link rel="alternate" hreflang="x-default" href="${siteUrl}">`));
      assert.ok(html.includes(`<meta property="og:url" content="${pageUrl}">`));
      assert.ok(html.includes(`<meta property="og:image" content="${siteUrl}assets/examples/architecture.png">`));
      const localReferences = [...html.matchAll(/(?:src|href)="([^"]+)"/g)]
        .map((match) => match[1]).filter((value) => !/^(?:https?:|#)/.test(value));
      assert.ok(localReferences.length > 10);
      for (const reference of localReferences) {
        assert.match(reference, /^\.\.?\//, reference);
        const resolved = new URL(reference, pageUrl);
        assert.ok(resolved.pathname.startsWith(basePath), reference);
        const file = resolved.pathname.slice(basePath.length).replace(/\/$/, "/index.html") || "index.html";
        assert.ok(expectedFiles.includes(file), `${reference} resolved to unpublished ${file}`);
      }
    }
    const sitemap = await readFile(join(outputDir, "sitemap.xml"), "utf8");
    assert.deepEqual([...sitemap.matchAll(/<loc>(.*?)<\/loc>/g)].map((match) => match[1]), [siteUrl, `${siteUrl}en/`]);
  });
}

for (const unexpected of ["private.json", "nested/secret.md"]) {
  test(`build refuses unexpected output ${unexpected} without deleting or overwriting files`, async (t) => {
    const workspace = await createWorkspace();
    t.after(workspace.dispose);
    const outputDir = join(workspace.directory, "output");
    const unexpectedFile = join(outputDir, unexpected);
    await mkdir(dirname(unexpectedFile), { recursive: true });
    await writeFile(unexpectedFile, "do not publish");
    await writeFile(join(outputDir, "index.html"), "previous build");
    await assert.rejects(buildSite({ outputDir }), /Unexpected file in site output/);
    assert.equal(await readFile(unexpectedFile, "utf8"), "do not publish");
    assert.equal(await readFile(join(outputDir, "index.html"), "utf8"), "previous build");
  });
}

test("build refuses the repository and its parent as output directories", async () => {
  for (const outputDir of [repository, dirname(repository)]) {
    await assert.rejects(buildSite({ outputDir }), /dedicated directory/);
  }
});

test("translation validation accepts complete localized content and reordered keys", async () => {
  const { ja, en } = await readContent();
  assert.doesNotThrow(() => validateTranslations(ja, en));
  assert.doesNotThrow(() => validateTranslations(en, ja));
  assert.doesNotThrow(() => validateTranslations({ title: "Title", steps: [{ body: "Body" }] }, {
    steps: [{ body: "本文" }], title: "見出し",
  }));
});

const reference = { title: "Title", steps: [{ body: "Body" }] };
const invalidTranslations = [
  ["missing key", { steps: [{ body: "本文" }] }, /keys differ at content/],
  ["extra key", { ...reference, unexpected: "Extra" }, /keys differ at content/],
  ["empty text", { ...reference, title: "" }, /empty translation at content.title/],
  ["whitespace text", { ...reference, title: " \n\t" }, /empty translation at content.title/],
  ["non-string leaf", { ...reference, title: 4 }, /translation at content.title/],
  ["missing nested key", { ...reference, steps: [{}] }, /keys differ at content.steps.0/],
  ["extra nested key", { ...reference, steps: [{ body: "本文", extra: "余分" }] }, /keys differ at content.steps.0/],
  ["empty nested text", { ...reference, steps: [{ body: " " }] }, /translation at content.steps.0.body/],
  ["missing array entry", { ...reference, steps: [] }, /keys differ at content.steps/],
  ["extra array entry", { ...reference, steps: [{ body: "本文" }, { body: "本文" }] }, /keys differ at content.steps/],
  ["object instead of array", { ...reference, steps: { 0: { body: "本文" } } }, /structure differs at content.steps/],
  ["array instead of object", [], /structure differs at content/],
  ["null nested object", { ...reference, steps: [null] }, /structure differs at content.steps.0/],
  ["null root", null, /structure differs at content/],
];
for (const [name, translation, error] of invalidTranslations) {
  test(`translation validation rejects ${name}`, () => assert.throws(() => validateTranslations(reference, translation), error));
}

test("translation validation also rejects empty reference text and unsupported leaf shapes", () => {
  assert.throws(() => validateTranslations({ title: " " }, { title: "Translated" }), /empty translation at content.title/);
  for (const value of [false, 3, null, undefined]) {
    assert.throws(() => validateTranslations({ value }, { value }), /structure differs at content.value/);
  }
});

test("site URLs are normalized for root, project, and nested hosting", () => {
  for (const [input, expected] of [
    ["https://example.test", "https://example.test/"],
    ["https://example.test/markdstage", "https://example.test/markdstage/"],
    ["https://example.test/markdstage///", "https://example.test/markdstage/"],
    ["https://example.test/team/markdstage/", "https://example.test/team/markdstage/"],
    ["http://localhost:4173/markdstage", "http://localhost:4173/markdstage/"],
  ]) assert.equal(normalizeSiteUrl(input), expected);
});

for (const value of [
  "", "not a URL", "/markdstage/", "ftp://example.test/", "file:///etc/passwd",
  "javascript:alert(1)", "data:text/html,hello", "https://user:password@example.test/",
  "https://user@example.test/", "https://example.test/?token=secret", "https://example.test/#fragment",
]) {
  test(`site URL validation rejects ${JSON.stringify(value)}`, () => assert.throws(() => normalizeSiteUrl(value)));
}

test("HTML escaping covers text and quoted attributes without accepting objects", () => {
  assert.equal(escapeHtml(`&<>"'`), "&amp;&lt;&gt;&quot;&#39;");
  assert.equal(escapeHtml(1280), "1280");
  for (const value of [undefined, null, {}, [], true]) assert.throws(() => escapeHtml(value), TypeError);
});

test("rendered headings, metadata, sources, links, and copy messages escape HTML", async () => {
  const { en, product, sources } = await readContent();
  const hostile = `</code><script id="injected">alert('x' & "y")</script>`;
  const escaped = "&lt;/code&gt;&lt;script id=&quot;injected&quot;&gt;alert(&#39;x&#39; &amp; &quot;y&quot;)&lt;/script&gt;";
  const copy = {
    ...en, title: hostile, description: hostile, heroLine1: hostile, heroAlt: hostile,
    examplesTitle: `${hostile}\nSecond line`, copied: hostile, canvasPrompt: hostile,
  };
  const html = renderPage({
    copy,
    product: { ...product, repository: `https://example.test/"'<>&`, cliCommand: hostile },
    sources: { ...sources, markdown: hostile },
    siteUrl: "https://example.test/markdstage/",
  });
  assert.ok(html.includes(`<title>${escaped}</title>`));
  assert.ok(html.includes(`<meta name="description" content="${escaped}">`));
  assert.ok(html.includes(`<h1 id="hero-title" lang="en">${escaped}<br>`));
  assert.ok(html.includes(`<h2 id="examples-title">${escaped}<br>Second line</h2>`));
  assert.ok(html.includes(`<code>${escaped}</code>`));
  assert.ok(html.includes(`<code id="cli-command">${escaped}</code>`));
  assert.ok(html.includes(`alt="${escaped}"`));
  assert.ok(html.includes(`data-copied="${escaped}"`));
  assert.ok(html.includes('href="https://example.test/&quot;&#39;&lt;&gt;&amp;"'));
  assert.ok(!html.includes(hostile));
  assert.equal([...html.matchAll(/<script\b/g)].length, 1, "Only the site's deferred script may be emitted");
});
