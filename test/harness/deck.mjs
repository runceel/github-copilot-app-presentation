// Test fixture loading helpers.
//
// The Extension accepts an array of Markdown fragments, one per slide. Splitting the original
// Markdown into fragments is the Skill's responsibility (the generative AI), so the harness follows
// the same contract. Because fragments can contain front matter delimited by `---`, fixtures use a
// nonconflicting `<!-- slide -->` line as the separator.
//
// This avoids reimplementing the Skill's splitting rules in the tests.

import { readFile } from "node:fs/promises";

export const SLIDE_SEPARATOR = /^[ \t]*<!--[ \t]*slide[ \t]*-->[ \t]*$/;

/** Split fixture content into an array of slide fragments. */
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

/** Read a fixture file and return its slide fragments. */
export async function loadFixtureDeck(path) {
  const slides = splitFixtureDeck(await readFile(path, "utf8"));
  if (slides.length === 0) throw new Error(`Fixture deck is empty: ${path}`);
  return slides;
}
