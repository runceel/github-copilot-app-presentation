// markdstage guide — the canonical markdstage_guide topics without the canvas.

import { readGuide } from "../runtime.mjs";
import { UsageError } from "../exit.mjs";

export const GUIDE_TOPICS = [
  "overview",
  "slide-format",
  "themes",
  "custom-themes",
  "theme-schema",
  "architecture-dsl",
  "architecture-schema",
];

export async function guideCommand({ topic = "overview" } = {}) {
  if (!GUIDE_TOPICS.includes(topic)) {
    throw new UsageError(
      `Unknown guide topic: ${topic}. Available topics: ${GUIDE_TOPICS.join(", ")}.`,
    );
  }
  return { topic, content: await readGuide(topic) };
}
