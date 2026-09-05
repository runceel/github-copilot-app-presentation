// markdstage validate — check deck structure, Architecture DSL, and themes.

import {
  MarkdStageError,
  architectureValidationErrors,
  architectureValidationReport,
  createDeckSession,
  createUrlToken,
  hasFrontMatter,
} from "../runtime.mjs";

export async function validateCommand(options) {
  const errors = [];
  const warnings = [];
  let session = null;

  try {
    session = await createDeckSession({
      file: options.file,
      workspaceRoot: options.workspace,
      theme: options.theme,
      themeFile: options.themeFile,
      assetUrlPrefix: `/${createUrlToken()}/theme-assets/`,
    });
  } catch (error) {
    if (!(error instanceof MarkdStageError)) throw error;
    errors.push({
      code: error.code,
      message: error.message,
    });
    return {
      ok: false,
      valid: false,
      complete: false,
      truncated: false,
      file: options.file,
      total: 0,
      errors,
      warnings,
      stages: { json: "skipped", structure: "skipped", semantic: "skipped", layout: "skipped" },
      diagnostics: [],
      diagnosticCount: 0,
      blocks: [],
    };
  }

  const validation = architectureValidationReport(session.slides);
  for (const issue of architectureValidationErrors(session.slides, { validation })) {
    errors.push({
      code: issue.code,
      page: issue.page,
      architecture: issue.architecture,
      message: issue.message,
    });
  }
  if (validation.truncated) {
    errors.push({
      code: "validation_incomplete",
      message: `Architecture validation reached inspection limits (${validation.budget.limitsReached.join(", ")}). Validate smaller inputs before treating the deck as valid.`,
    });
  }

  session.slides.forEach((slide, index) => {
    if (!hasFrontMatter(slide)) {
      warnings.push({
        code: "missing_front_matter",
        page: index + 1,
        message:
          "Front matter is missing. Add the deck/layout/page/total/size fields to the leading --- block.",
      });
    }
  });

  return {
    ok: errors.length === 0 && validation.valid,
    valid: errors.length === 0 && validation.valid,
    complete: validation.complete,
    truncated: validation.truncated,
    file: session.file,
    workspace: session.workspaceRoot,
    total: session.slides.length,
    theme: session.theme,
    themeFile: session.customThemeFile || undefined,
    errors,
    warnings,
    stages: validation.stages,
    diagnostics: validation.diagnostics,
    diagnosticCount: validation.diagnosticCount,
    blocks: validation.blocks,
    skipped: validation.skipped,
    limits: validation.limits,
    budget: validation.budget,
  };
}

export function formatValidateReport(report) {
  const lines = [];
  lines.push(`${report.file}`);
  if (report.total) lines.push(`  slides: ${report.total}${report.theme ? `, theme: ${report.theme}` : ""}`);
  for (const error of report.errors) {
    lines.push(
      `  error  ${error.page ? `slide ${error.page}: ` : ""}${error.message} (${error.code})`,
    );
  }
  for (const warning of report.warnings) {
    lines.push(`  warn   slide ${warning.page}: ${warning.message}`);
  }
  if (report.complete === false) {
    lines.push(report.truncated
      ? "  Validation incomplete: inspection limits were reached; unchecked content is not valid."
      : "  Architecture validation incomplete: fix the reported errors and validate again.");
  }
  lines.push(report.ok ? "  OK: the deck is valid." : `  ${report.errors.length} error(s) found.`);
  return lines.join("\n");
}
