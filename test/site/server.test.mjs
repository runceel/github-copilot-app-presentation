import assert from "node:assert/strict";
import { mkdir, symlink, writeFile } from "node:fs/promises";
import { request } from "node:http";
import { join } from "node:path";
import test from "node:test";

import { startSiteServer } from "../../scripts/serve-site.mjs";
import { createWorkspace } from "./helpers.mjs";

// Keep traversal paths raw: fetch and URL resolution can normalize them before the server sees them.
function getRaw(url, path, method = "GET") {
  const origin = new URL(url);
  return new Promise((resolve, reject) => {
    const pending = request({ hostname: origin.hostname, port: origin.port, path, method }, (response) => {
      const chunks = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.on("end", () => resolve({
        status: response.statusCode, headers: response.headers, body: Buffer.concat(chunks).toString("utf8"),
      }));
      response.on("error", reject);
    });
    pending.on("error", reject);
    pending.end();
  });
}

async function serveFixture(t, basePath) {
  const workspace = await createWorkspace();
  const root = join(workspace.directory, "public");
  await mkdir(join(root, "en"), { recursive: true });
  const files = {
    "index.html": ["<html lang=\"ja\">日本語</html>", "text/html; charset=utf-8"],
    "en/index.html": ["<html lang=\"en\">English</html>", "text/html; charset=utf-8"],
    "site.css": ["body { margin: 0; }", "text/css; charset=utf-8"],
    "site.js": ["document.body.dataset.ready = 'true';", "text/javascript; charset=utf-8"],
    "mark.svg": ["<svg xmlns=\"http://www.w3.org/2000/svg\"/>", "image/svg+xml"],
    "example.png": ["PNG fixture", "image/png"],
    "source.md": ["# Source\n\n```js\nconst ready = true;\n```\n", "text/plain; charset=utf-8"],
    "sitemap.xml": ["<urlset/>", "application/xml; charset=utf-8"],
    "unknown.bin": ["binary fixture", "application/octet-stream"],
    "日本語.md": ["# 日本語", "text/plain; charset=utf-8"],
  };
  for (const [path, [body]] of Object.entries(files)) await writeFile(join(root, path), body);
  const outside = join(workspace.directory, "outside");
  await mkdir(outside);
  await writeFile(join(outside, "secret.txt"), "outside-secret");
  let preview;
  t.after(async () => {
    await preview?.close();
    await workspace.dispose();
  });
  preview = await startSiteServer({ root, basePath, port: 0 });
  return { ...preview, root, outside, files };
}

for (const basePath of ["/", "/markdstage/"]) {
  test(`preview serves locale indexes, MIME types, and bodyless HEAD under ${basePath}`, async (t) => {
    const preview = await serveFixture(t, basePath);
    assert.match(preview.url, /^http:\/\/127\.0\.0\.1:\d+\//);
    for (const [path, [body, type]] of Object.entries(preview.files)) {
      const requestPath = `${basePath}${path.split("/").map(encodeURIComponent).join("/")}`;
      const get = await getRaw(preview.url, requestPath);
      assert.equal(get.status, 200, path);
      assert.equal(get.body, body, path);
      assert.equal(get.headers["content-type"], type, path);
      assert.equal(get.headers["cache-control"], "no-store");
      assert.equal(get.headers["x-content-type-options"], "nosniff");
      const head = await getRaw(preview.url, requestPath, "HEAD");
      assert.equal(head.status, 200, path);
      assert.equal(head.body, "", path);
      for (const header of ["content-type", "cache-control", "x-content-type-options"]) {
        assert.equal(head.headers[header], get.headers[header], `${path}: ${header}`);
      }
    }
    assert.equal((await getRaw(preview.url, basePath)).body, preview.files["index.html"][0]);
    assert.equal((await getRaw(preview.url, `${basePath}en/`)).body, preview.files["en/index.html"][0]);
  });

  test(`preview rejects missing files, malformed requests, and traversal under ${basePath}`, async (t) => {
    const preview = await serveFixture(t, basePath);
    for (const suffix of [
      "missing.html", "missing/", "source.md/child", "en",
      "../outside/secret.txt", "%2e%2e%2foutside/secret.txt", "..%2foutside/secret.txt",
      "%2e%2e%5coutside%5csecret.txt", "%5coutside%5csecret.txt",
      "%2foutside/secret.txt", "%00source.md", "C:%5coutside%5csecret.txt",
      "%252e%252e%252foutside/secret.txt",
    ]) {
      const response = await getRaw(preview.url, `${basePath}${suffix}`);
      assert.equal(response.status, 404, suffix);
      assert.equal(response.body, "Not found", suffix);
      assert.ok(!response.body.includes("outside-secret"));
    }
    for (const suffix of ["%", "%ZZ", "%E0%A4%A"]) {
      const response = await getRaw(preview.url, `${basePath}${suffix}`);
      assert.equal(response.status, 400, suffix);
      assert.equal(response.body, "Invalid URL");
    }
    const missingHead = await getRaw(preview.url, `${basePath}missing.html`, "HEAD");
    assert.equal(missingHead.status, 404);
    assert.equal(missingHead.body, "");
    for (const method of ["POST", "PUT", "DELETE", "OPTIONS"]) {
      const response = await getRaw(preview.url, basePath, method);
      assert.equal(response.status, 405, method);
      assert.equal(response.headers.allow, "GET, HEAD");
    }
  });

  test(`preview refuses symlink directory escapes under ${basePath}`, async (t) => {
    const preview = await serveFixture(t, basePath);
    await symlink(preview.outside, join(preview.root, "linked"), process.platform === "win32" ? "junction" : "dir");
    for (const method of ["GET", "HEAD"]) {
      const response = await getRaw(preview.url, `${basePath}linked/secret.txt`, method);
      assert.equal(response.status, 404);
      assert.ok(!response.body.includes("outside-secret"));
    }
  });
}

test("project preview redirects the bare project path and never serves neighboring prefixes", async (t) => {
  const preview = await serveFixture(t, "/markdstage/");
  for (const method of ["GET", "HEAD"]) {
    const redirect = await getRaw(preview.url, "/markdstage", method);
    assert.equal(redirect.status, 308);
    assert.equal(redirect.headers.location, "/markdstage/");
    assert.equal(redirect.body, "");
  }
  for (const path of ["/", "/en/", "/site.css", "/markdstage-other/", "/markdstages/index.html"]) {
    assert.equal((await getRaw(preview.url, path)).status, 404, path);
  }
});

test("preview rejects malformed base paths before listening", async () => {
  for (const basePath of ["markdstage/", "/markdstage", "/../", "/markdstage/../", ""]) {
    await assert.rejects(startSiteServer({ basePath, port: 0 }), /preview base path/);
  }
});
