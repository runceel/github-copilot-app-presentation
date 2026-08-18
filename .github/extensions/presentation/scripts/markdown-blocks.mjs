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
 * Markdown を行に割る。CRLF / CR は LF に正規化する（差し替え後も LF で返す）。
 */
function toLines(markdown) {
  return String(markdown).replace(/\r\n?/g, "\n").split("\n");
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
 */
export function replaceArchitectureBlock(markdown, blockIndex, source) {
  const blocks = findArchitectureBlocks(markdown);
  const target = blocks.find((b) => b.index === blockIndex);
  if (!target) return null;
  const lines = toLines(markdown);
  // 末尾の空行を落としてから差し込む（JSON の末尾改行で空行が増えるのを防ぐ）。
  const body = String(source).replace(/\r\n?/g, "\n").replace(/\s+$/, "");
  const inserted = body.length
    ? body.split("\n").map((line) => (target.indent && line ? target.indent + line : line))
    : [];
  const head = lines.slice(0, target.open + 1);
  const tail = lines.slice(target.end);
  return [...head, ...inserted, ...tail].join("\n");
}
