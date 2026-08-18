// PDF の最小限の検査ユーティリティ。
//
// 生バイナリのスナップショット比較は環境差で必ず壊れるので行わない。ここで見るのは
// **ページ数**と**ページサイズ**だけ。内容の検証は DOM から取った意味構造で行う。
//
// 依存を増やさないため Node 標準の zlib だけで実装する。Chromium は相互参照や
// オブジェクトを FlateDecode の object stream に格納することがあるため、
// 素の本文に加えて展開済みストリームも検索対象に含める。

import { inflateSync } from "node:zlib";

// PDF のユーザー空間は 1/72 インチ。slides.css の `@page{size:13.333333in 7.5in}` は
// 960pt x 540pt（= 16:9）に相当する。
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
      // 非圧縮 / 別フィルターのストリームは読み飛ばす。
    }
    pattern.lastIndex = end;
  }
  return parts;
}

/**
 * PDF のページ数とページサイズを取り出す。
 *
 * @param {Buffer} buffer page.pdf() が返したバイト列
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

  // /Type /Pages の /Count を優先し、無ければ /Type /Page の出現数を数える。
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

/** 16:9（960pt x 540pt）とみなせるか。丸め誤差は許容する。 */
export function isSixteenByNinePage({ width, height }, tolerancePt = 2) {
  return (
    Math.abs(width - EXPECTED_PAGE_WIDTH_PT) <= tolerancePt &&
    Math.abs(height - EXPECTED_PAGE_HEIGHT_PT) <= tolerancePt
  );
}
