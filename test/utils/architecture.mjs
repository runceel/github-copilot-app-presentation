// Extract ```architecture blocks from slide Markdown and parse them with the Extension parser.
// PDF regression tests use this to compare the diagram rendered in the DOM with the model's
// semantic structure.
//
// Do not reimplement the parser; use parseArchitecture from `renderer/architecture.mjs` directly.

import { parseArchitecture } from "../../.github/extensions/markdstage/renderer/architecture.mjs";

const ARCHITECTURE_BLOCK = /^```architecture[^\S\r\n]*\r?\n([\s\S]*?)^```[^\S\r\n]*$/gm;

/** Return source strings for architecture blocks in a Markdown fragment. */
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
 * Expected values for one slide: each diagram's group, node, and connector counts and viewBox.
 * These are compared with the structure read from the DOM.
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

/** Return whether a Markdown fragment contains a Mermaid block. */
export function hasMermaidBlock(markdown) {
  return /^```mermaid[^\S\r\n]*$/m.test(markdown);
}
