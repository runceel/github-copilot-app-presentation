// markdstage export — produce the same PDF or editable PowerPoint as the Canvas Extension.

import { extname } from "node:path";

import {
  exportPdf,
  exportPptx,
  pdfNameForSource,
  pptxNameForSource,
} from "../runtime.mjs";
import { withDeckServer } from "../deck.mjs";

export async function exportCommand(
  options,
  exporters = { pdf: exportPdf, pptx: exportPptx },
) {
  return withDeckServer(options, async (session) => {
    const requested = options.output || pdfNameForSource(session.sourceName);
    const extension = extname(requested).toLowerCase();
    if (extension === ".pptx") {
      return exporters.pptx(
        session,
        options.output || pptxNameForSource(session.sourceName),
        options.theme,
      );
    }
    return exporters.pdf(session, requested, options.theme);
  });
}

export function formatExportReport(report) {
  const format = report.format === "pptx" ? "PowerPoint" : "PDF";
  const fallback =
    report.format === "pptx" && report.fallbackCount
      ? `, ${report.fallbackCount} fallback item(s)`
      : "";
  return `Exported ${report.total} slide(s) to ${report.path} (${report.bytes} bytes, ${format}, theme ${report.theme}${fallback}).`;
}
