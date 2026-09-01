// Stable exit codes and error formatting for the MarkdStage CLI.

export const EXIT_OK = 0;
export const EXIT_USAGE = 1;
export const EXIT_DECK = 2;
export const EXIT_ENVIRONMENT = 3;
export const EXIT_FAILURE = 4;
export const EXIT_ISSUES = 5;

export const EXIT_CODES = {
  0: "success",
  1: "usage error",
  2: "deck or input error",
  3: "environment error (no Chromium-based browser)",
  4: "rendering or output failure",
  5: "layout or validation issues were found",
};

const DECK_ERROR_CODES = new Set([
  "empty_markdown",
  "file_not_found",
  "file_too_large",
  "invalid_input",
  "invalid_markdown_path",
  "invalid_output_path",
  "invalid_theme_file",
  "no_deck",
  "path_outside_workspace",
  "slide_out_of_range",
  "theme_file_not_found",
  "too_many_slides",
]);

export class UsageError extends Error {
  constructor(message) {
    super(message);
    this.name = "UsageError";
    this.code = "usage_error";
  }
}

export function exitCodeFor(error) {
  if (error instanceof UsageError) return EXIT_USAGE;
  const code = error?.code;
  if (typeof code === "string") {
    if (code.endsWith("browser_not_found")) return EXIT_ENVIRONMENT;
    if (DECK_ERROR_CODES.has(code)) return EXIT_DECK;
  }
  return EXIT_FAILURE;
}

export function errorPayload(error) {
  return {
    ok: false,
    error: typeof error?.code === "string" ? error.code : "unexpected_error",
    message: error?.message || String(error),
  };
}
