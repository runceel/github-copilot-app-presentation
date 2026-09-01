// Runtime error contract shared by the Canvas Extension and the MarkdStage CLI.
//
// Canvas code translates MarkdStageError into CanvasError; the CLI translates it
// into human-readable (or JSON) output plus a stable exit code. Keeping a single
// error type in the runtime avoids importing the Copilot SDK outside the canvas.

export class MarkdStageError extends Error {
  constructor(code, message) {
    super(message || code);
    this.name = "MarkdStageError";
    this.code = code;
  }
}

export function isMarkdStageError(error) {
  return error instanceof MarkdStageError;
}
