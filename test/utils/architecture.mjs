// スライド Markdown から ```architecture ブロックを取り出し、拡張機能本体の
// パーサーで解析する。PDF 回帰の「意味構造」検証で、DOM に出た図が
// モデルどおりかを突き合わせるために使う。
//
// パーサーは再実装せず `renderer/architecture.mjs` の parseArchitecture をそのまま使う。

import { parseArchitecture } from "../../.github/extensions/presentation/renderer/architecture.mjs";

const ARCHITECTURE_BLOCK = /^```architecture[^\S\r\n]*\r?\n([\s\S]*?)^```[^\S\r\n]*$/gm;

/** Markdown 断片に含まれる architecture ブロックのソース文字列を返す。 */
export function extractArchitectureSources(markdown) {
  const sources = [];
  ARCHITECTURE_BLOCK.lastIndex = 0;
  let match;
  while ((match = ARCHITECTURE_BLOCK.exec(markdown)) !== null) {
    sources.push(match[1]);
  }
  return sources;
}

/**
 * スライド 1 枚分の期待値（図ごとの group / node / connector 数と viewBox）。
 * DOM 側から取得した構造と比較する。
 */
export function expectedDiagramShapes(markdown) {
  return extractArchitectureSources(markdown).map((source) => {
    const model = parseArchitecture(source);
    const count = (type) => model.elements.filter((element) => element.type === type).length;
    return {
      viewBox: `0 0 ${model.canvas.width} ${model.canvas.height}`,
      groups: count("group"),
      nodes: count("node"),
      connectors: count("connector"),
    };
  });
}

/** Markdown 断片に mermaid ブロックが含まれるか。 */
export function hasMermaidBlock(markdown) {
  return /^```mermaid[^\S\r\n]*$/m.test(markdown);
}
