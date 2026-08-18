// テスト用フィクスチャの読み込みヘルパー。
//
// 拡張機能は「スライド 1 枚分の Markdown 断片の配列」を受け取る契約なので（元の
// Markdown を断片へ分割するのは Skill 側 = 生成 AI の仕事）、ハーネスもその契約に
// そのまま合わせる。断片自身が `---` のフロントマターを持つため、フィクスチャの
// 区切りには衝突しない `<!-- slide -->` 行を使う。
//
// これにより Skill の分割ルールをテスト側で再実装せずに済む。

import { readFile } from "node:fs/promises";

export const SLIDE_SEPARATOR = /^[ \t]*<!--[ \t]*slide[ \t]*-->[ \t]*$/;

/** フィクスチャ本文をスライド断片の配列へ分割する。 */
export function splitFixtureDeck(text) {
  const normalized = String(text).replace(/\r\n?/g, "\n");
  const slides = [];
  let current = [];
  for (const line of normalized.split("\n")) {
    if (SLIDE_SEPARATOR.test(line)) {
      slides.push(current.join("\n"));
      current = [];
      continue;
    }
    current.push(line);
  }
  slides.push(current.join("\n"));
  return slides.map((slide) => slide.trim()).filter((slide) => slide.length > 0);
}

/** フィクスチャファイルを読み、スライド断片の配列を返す。 */
export async function loadFixtureDeck(path) {
  const slides = splitFixtureDeck(await readFile(path, "utf8"));
  if (slides.length === 0) throw new Error(`Fixture deck is empty: ${path}`);
  return slides;
}
