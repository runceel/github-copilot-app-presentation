// markdstage export — produce the same 16:9 PDF as the Canvas Extension.

import { exportPdf, pdfNameForSource } from "../runtime.mjs";
import { withDeckServer } from "../deck.mjs";

export async function exportCommand(options) {
  return withDeckServer(options, async (session) =>
    exportPdf(
      session,
      options.output || pdfNameForSource(session.sourceName),
      options.theme,
    ),
  );
}

export function formatExportReport(report) {
  return `Exported ${report.total} slide(s) to ${report.path} (${report.bytes} bytes, theme ${report.theme}).`;
}
