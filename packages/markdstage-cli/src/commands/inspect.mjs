// markdstage inspect — the compact 1280x720 clipping diagnostics the Canvas
// `inspect_layout` action returns.

import { inspectLayout } from "../runtime.mjs";
import { withDeckServer } from "../deck.mjs";

export async function inspectCommand(options) {
  return withDeckServer(options, async (session) =>
    inspectLayout(session, options.slide, options.includeFits),
  );
}

export function formatInspectReport(report) {
  const lines = [
    `${report.width}x${report.height} · ${report.inspected}/${report.total} slide(s) inspected`,
  ];
  if (!report.slides.length) {
    lines.push(report.hasIssues ? "  (no details)" : "  OK: every slide fits the 16:9 output.");
    return lines.join("\n");
  }
  for (const slide of report.slides) {
    const details = [];
    if (slide.verticalOverflowPx) details.push(`vertical ${slide.verticalOverflowPx}px`);
    if (slide.horizontalOverflowPx) details.push(`horizontal ${slide.horizontalOverflowPx}px`);
    lines.push(
      `  slide ${slide.page ?? slide.index + 1} (${slide.title || "untitled"}): ${slide.status}` +
        (details.length ? ` — ${details.join(", ")}` : ""),
    );
    for (const hint of slide.elements ?? []) {
      lines.push(`      ${hint.kind}: ${hint.path || hint.tag}${hint.text ? ` — ${hint.text}` : ""}`);
    }
  }
  lines.push(`  ${report.issueCount} slide(s) do not fit.`);
  return lines.join("\n");
}
