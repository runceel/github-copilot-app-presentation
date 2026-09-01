// markdstage capture — write selected 1280x720 PNG files.

import { captureSlides } from "../runtime.mjs";
import { withDeckServer } from "../deck.mjs";

export async function captureCommand(options) {
  return withDeckServer(options, async (session) =>
    captureSlides(session, options.indexes, options.output, options.theme),
  );
}

export function formatCaptureReport(report) {
  if (!report.captured) {
    return report.message || "No PNG files were written.";
  }
  const lines = [`${report.captured} PNG file(s) written to ${report.directory}`];
  for (const file of report.files) {
    lines.push(
      `  slide ${file.page}: ${file.path} (${file.width}x${file.height}, ${file.bytes} bytes)`,
    );
  }
  return lines.join("\n");
}
