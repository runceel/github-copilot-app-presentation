// スライド Markdown 内の ```architecture フェンスを差し替えるための小さなユーティリティ。
//
// Architecture 図の編集は「描画結果に差分を持つ」のではなく **元の DSL をその場で
// 書き換える** 方式を採る。そのため、編集 UI が作った新しい DSL を、元スライドの
// n 番目の ```architecture フェンスへ正確に戻す必要がある。
//
// 本番の `extension.mjs` とテストハーネス (`test/harness/server.mjs`) の両方から
// import される。実行時 npm 依存は持たない（拡張は ZIP 配布されるため）。

// 開始フェンス。marked と同じく ``` / ~~~ の 3 個以上、情報文字列は 1 語だけ見る。
const FENCE_OPEN = /^([ \t]{0,3})(`{3,}|~{3,})[ \t]*([^\s`~]*)[ \t]*$/;

/**
 * Markdown を行に割る。CRLF / CR は LF に正規化する（走査用）。
 */
function toLines(markdown) {
  return String(markdown).replace(/\r\n?/g, "\n").split("\n");
}

/**
 * Markdown を「本文 + その行の改行コード」に割る。差し替え時に、フェンス外の
 * 地の文の改行コードを 1 バイトも変えないために使う。
 *
 * toLines と同じ境界で割るので、行番号は findArchitectureBlocks の結果と一致する。
 */
function splitLinesWithEol(markdown) {
  const text = String(markdown);
  const out = [];
  const re = /\r\n|\r|\n/g;
  let last = 0;
  let m;
  while ((m = re.exec(text)) !== null) {
    out.push({ text: text.slice(last, m.index), eol: m[0] });
    last = re.lastIndex;
  }
  out.push({ text: text.slice(last), eol: "" });
  return out;
}

/** 挿入行に使う改行コード。文書内で多数派のものを採る。 */
function dominantEol(lines) {
  let crlf = 0;
  let lf = 0;
  for (const line of lines) {
    if (line.eol === "\r\n") crlf += 1;
    else if (line.eol === "\n") lf += 1;
  }
  return crlf > lf ? "\r\n" : "\n";
}

/**
 * 開始フェンスに対応する終了フェンス行を探す。
 * 見つからない場合は文書末（lines.length）を返す＝未閉じフェンス。
 */
function findFenceEnd(lines, start, marker) {
  const close = new RegExp(`^[ \\t]{0,3}[${marker[0]}]{${marker.length},}[ \\t]*$`);
  for (let i = start; i < lines.length; i += 1) {
    if (close.test(lines[i])) return i;
  }
  return lines.length;
}

/**
 * Markdown 内の ```architecture フェンスを走査する。
 * 各要素は { index, open, end, indent, body } を持つ。
 * - index: architecture フェンスだけを 0 から数えた通し番号（renderer 側の
 *   `code.language-architecture` の出現順と一致する）
 * - open / end: 開始・終了フェンスの行番号（end は未閉じなら lines.length）
 * - body: フェンス内の生テキスト
 */
export function findArchitectureBlocks(markdown) {
  const lines = toLines(markdown);
  const blocks = [];
  let i = 0;
  let seen = 0;
  while (i < lines.length) {
    const open = FENCE_OPEN.exec(lines[i]);
    if (!open) {
      i += 1;
      continue;
    }
    const [, indent, marker, info] = open;
    const end = findFenceEnd(lines, i + 1, marker);
    if (info.toLowerCase() === "architecture") {
      blocks.push({
        index: seen,
        open: i,
        end,
        indent,
        body: lines.slice(i + 1, end).join("\n"),
      });
      seen += 1;
    }
    i = end + 1;
  }
  return blocks;
}

/**
 * n 番目の ```architecture フェンスの中身を差し替えた Markdown を返す。
 * 対象が無ければ null（呼び出し側が 404 を返せるように、例外にはしない）。
 *
 * フェンスの行自体（``` と ```）は保存され、中身だけが置き換わる。開始フェンスに
 * インデントがあれば新しい本文にも同じインデントを付ける。
 *
 * フェンス外の行は改行コードも含めてそのまま保つ。CRLF の Markdown を保存した
 * だけでファイル全体が LF になり、git diff が全行変更になるのを避けるため。
 */
export function replaceArchitectureBlock(markdown, blockIndex, source) {
  const blocks = findArchitectureBlocks(markdown);
  const target = blocks.find((b) => b.index === blockIndex);
  if (!target) return null;
  const lines = splitLinesWithEol(markdown);
  // 挿入行の改行コードは開始フェンス行に合わせる（未閉じフェンスなど、フェンス行
  // が文末で改行を持たない場合は文書内の多数派へ倒す）。
  const eol = lines[target.open]?.eol || dominantEol(lines);
  // 末尾の空行を落としてから差し込む（JSON の末尾改行で空行が増えるのを防ぐ）。
  const body = String(source).replace(/\r\n?/g, "\n").replace(/\s+$/, "");
  const inserted = body.length
    ? body
        .split("\n")
        .map((line) => ({ text: target.indent && line ? target.indent + line : line, eol }))
    : [];
  const head = lines.slice(0, target.open + 1);
  const tail = lines.slice(target.end);
  // 未閉じフェンス（tail が空）のときは、元の文末が改行を持たなかったことを保つ。
  if (!tail.length && inserted.length) inserted[inserted.length - 1].eol = "";
  return [...head, ...inserted, ...tail].map((line) => line.text + line.eol).join("");
}

/**
 * スライド内の architecture ブロック番号を、インポート元 Markdown 全体での番号へ変換する。
 * 自動追加された背表紙など、元ファイルに無い末尾スライドは対象ブロックを持たないため null。
 */
export function importedArchitectureBlockIndex(slides, slideIndex, blockIndex) {
  if (
    !Array.isArray(slides) ||
    !Number.isInteger(slideIndex) ||
    !Number.isInteger(blockIndex) ||
    slideIndex < 0 ||
    slideIndex >= slides.length ||
    blockIndex < 0
  ) {
    return null;
  }
  const localBlocks = findArchitectureBlocks(slides[slideIndex]);
  if (blockIndex >= localBlocks.length) return null;
  let globalIndex = blockIndex;
  for (let i = 0; i < slideIndex; i += 1) {
    globalIndex += findArchitectureBlocks(slides[i]).length;
  }
  return globalIndex;
}

/**
 * インポート元 Markdown の対象フェンスを、現在のデッキと一致するときだけ差し替える。
 * 外部編集で対象が移動・変更されていたら source_changed として fail closed にする。
 */
export function replaceImportedArchitectureBlock(
  markdown,
  slides,
  slideIndex,
  blockIndex,
  source,
  expectedMarkdown = null,
) {
  if (typeof expectedMarkdown === "string" && markdown !== expectedMarkdown) {
    return { ok: false, reason: "source_changed" };
  }
  const globalIndex = importedArchitectureBlockIndex(slides, slideIndex, blockIndex);
  if (globalIndex === null) return { ok: false, reason: "block_not_found" };

  const expected = findArchitectureBlocks(slides[slideIndex])[blockIndex];
  const actual = findArchitectureBlocks(markdown)[globalIndex];
  if (!actual) return { ok: false, reason: "source_changed" };
  if (actual.body !== expected.body) return { ok: false, reason: "source_changed" };

  const next = replaceArchitectureBlock(markdown, globalIndex, source);
  if (next === null) return { ok: false, reason: "block_not_found" };
  return { ok: true, markdown: next, globalIndex };
}
