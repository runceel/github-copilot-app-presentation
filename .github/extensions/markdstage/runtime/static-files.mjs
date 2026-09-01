// Static file helpers shared by the Canvas Extension presentation server and the
// MarkdStage CLI presentation server.

import { readFile } from "node:fs/promises";
import { extname, join, normalize, resolve, sep } from "node:path";
import { reconstructAsset } from "../scripts/vendor-assets.mjs";

export const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".ico": "image/x-icon",
  ".bmp": "image/bmp",
};

export function mimeFor(path) {
  return MIME[extname(path).toLowerCase()] || "application/octet-stream";
}

// Reject relative paths that escape rootDir to prevent path traversal.
export function safeJoin(rootDir, rel) {
  const cleaned = rel.replace(/^[/\\]+/, "");
  const abs = normalize(join(rootDir, cleaned));
  const root = resolve(rootDir);
  if (abs !== root && !abs.startsWith(root + sep)) return null;
  return abs;
}

export async function sendFile(res, absPath, { cache } = {}) {
  try {
    const buf = await readFile(absPath);
    res.statusCode = 200;
    res.setHeader("Content-Type", mimeFor(absPath));
    res.setHeader(
      "Cache-Control",
      cache ? "public, max-age=31536000, immutable" : "no-store",
    );
    res.end(buf);
  } catch (_) {
    res.statusCode = 404;
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.end("Not found");
  }
}

export async function sendChunkedVendorAsset(res, vendorDir, vendorManifest, assetName, onError) {
  try {
    const buffer = await reconstructAsset(vendorDir, assetName, vendorManifest);
    res.statusCode = 200;
    res.setHeader("Content-Type", mimeFor(assetName));
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    res.end(buffer);
  } catch (error) {
    onError?.(
      `MarkdStage: vendor asset integrity failure for ${assetName}: ${error.message}`,
    );
    res.statusCode = 500;
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.end("Vendor asset integrity failure");
  }
}
