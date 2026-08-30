// Minimal PDF inspection utilities.
//
// Do not snapshot raw binary data because environment differences always break those comparisons.
// Inspect only the **page count** and **page size**. Validate content through semantic structure
// read from the DOM.
//
// Use only Node's built-in zlib to avoid adding dependencies. Chromium may store cross-references
// and objects in FlateDecode object streams, so search both raw content and inflated streams.

import { inflateSync } from "node:zlib";

// PDF user space is 1/72 inch. The `@page{size:13.333333in 7.5in}` rule in slides.css corresponds
// to 960pt x 540pt (= 16:9).
export const EXPECTED_PAGE_WIDTH_PT = 13.333333 * 72;
export const EXPECTED_PAGE_HEIGHT_PT = 7.5 * 72;

function inflateStreams(raw) {
  const parts = [];
  const pattern = /stream\r?\n/g;
  let match;
  while ((match = pattern.exec(raw)) !== null) {
    const start = match.index + match[0].length;
    const end = raw.indexOf("endstream", start);
    if (end < 0) break;
    const slice = Buffer.from(raw.slice(start, end), "latin1");
    try {
      parts.push(inflateSync(slice).toString("latin1"));
    } catch (_) {
      // Skip uncompressed streams and streams that use another filter.
    }
    pattern.lastIndex = end;
  }
  return parts;
}

/**
 * Extract page count and page sizes from a PDF.
 *
 * @param {Buffer} buffer Bytes returned by page.pdf()
 * @returns {{ pageCount: number, mediaBoxes: Array<{width:number,height:number}> }}
 */
export function inspectPdf(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    throw new Error("inspectPdf requires a non-empty Buffer");
  }
  if (buffer.subarray(0, 5).toString("latin1") !== "%PDF-") {
    throw new Error("Not a PDF: missing %PDF- header");
  }

  const raw = buffer.toString("latin1");
  const corpus = [raw, ...inflateStreams(raw)].join("\n");

  // Prefer /Count under /Type /Pages; otherwise count occurrences of /Type /Page.
  let pageCount = 0;
  const countMatch = corpus.match(/\/Type\s*\/Pages\b[^>]*?\/Count\s+(\d+)/);
  if (countMatch) {
    pageCount = Number(countMatch[1]);
  } else {
    pageCount = (corpus.match(/\/Type\s*\/Page(?![sA-Za-z])/g) || []).length;
  }

  const mediaBoxes = [];
  const boxPattern =
    /\/MediaBox\s*\[\s*(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s*\]/g;
  let box;
  while ((box = boxPattern.exec(corpus)) !== null) {
    const [, x0, y0, x1, y1] = box.map(Number);
    mediaBoxes.push({ width: x1 - x0, height: y1 - y0 });
  }

  return { pageCount, mediaBoxes };
}

/** Return whether a page is effectively 16:9 (960pt x 540pt), allowing rounding error. */
export function isSixteenByNinePage({ width, height }, tolerancePt = 2) {
  return (
    Math.abs(width - EXPECTED_PAGE_WIDTH_PT) <= tolerancePt &&
    Math.abs(height - EXPECTED_PAGE_HEIGHT_PT) <= tolerancePt
  );
}
