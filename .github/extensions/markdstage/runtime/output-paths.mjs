// Workspace-confined output path resolution shared by the Canvas Extension and
// the MarkdStage CLI.
//
// Every generated file (PDF, PNG) must land inside the resolved workspace, and
// no intermediate directory may traverse a symlink or junction that escapes it.

import { mkdir, realpath, stat } from "node:fs/promises";
import {
  basename,
  dirname,
  extname,
  isAbsolute,
  join,
  relative,
  resolve,
  sep,
} from "node:path";
import { MarkdStageError } from "./errors.mjs";

export const DEFAULT_PDF_NAME = "markdstage.pdf";
export const DEFAULT_CAPTURE_DIR = "markdstage-previews";

function safeBaseName(sourceName) {
  const sourceBase = basename(typeof sourceName === "string" ? sourceName.trim() : "");
  const withoutExtension = sourceBase.replace(/\.(?:md|markdown)$/i, "");
  return withoutExtension
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_")
    .trim()
    .replace(/[. ]+$/, "");
}

export function pdfNameForSource(sourceName) {
  return `${safeBaseName(sourceName) || basename(DEFAULT_PDF_NAME, ".pdf")}.pdf`;
}

export function captureDirectoryName(sourceName) {
  const safeBase = safeBaseName(sourceName);
  return safeBase ? `${safeBase}-previews` : DEFAULT_CAPTURE_DIR;
}

export function isPathInside(root, candidate) {
  const rootRelative = relative(root, candidate);
  return (
    rootRelative === "" ||
    (!rootRelative.startsWith(`..${sep}`) &&
      rootRelative !== ".." &&
      !isAbsolute(rootRelative))
  );
}

export function resolveWorkspaceOutputPath(
  workspaceRoot,
  requestedPath,
  { defaultName, extension, label },
) {
  const root = resolve(workspaceRoot);
  const requested =
    typeof requestedPath === "string" && requestedPath.trim()
      ? requestedPath.trim()
      : defaultName;
  if (requested.includes("\0")) {
    throw new MarkdStageError(
      "invalid_output_path",
      `${label} output path contains an invalid character.`,
    );
  }

  const outputPath = resolve(root, requested);
  const workspaceRelative = relative(root, outputPath);
  if (
    workspaceRelative === "" ||
    workspaceRelative === ".." ||
    workspaceRelative.startsWith(`..${sep}`) ||
    isAbsolute(workspaceRelative)
  ) {
    throw new MarkdStageError(
      "invalid_output_path",
      `${label} output path must be a file inside the current workspace.`,
    );
  }
  if (extname(outputPath).toLowerCase() !== extension) {
    throw new MarkdStageError(
      "invalid_output_path",
      `${label} output path must end with ${extension}.`,
    );
  }
  return outputPath;
}

export function resolvePdfOutputPath(workspaceRoot, requestedPath) {
  return resolveWorkspaceOutputPath(workspaceRoot, requestedPath, {
    defaultName: DEFAULT_PDF_NAME,
    extension: ".pdf",
    label: "PDF",
  });
}

export function resolveCaptureOutputDirectory(workspaceRoot, sourceName, requestedPath) {
  const root = resolve(workspaceRoot);
  const requested =
    typeof requestedPath === "string" && requestedPath.trim()
      ? requestedPath.trim()
      : captureDirectoryName(sourceName);
  if (requested.includes("\0")) {
    throw new MarkdStageError(
      "invalid_output_path",
      "PNG output directory contains an invalid character.",
    );
  }
  const outputDirectory = resolve(root, requested);
  const workspaceRelative = relative(root, outputDirectory);
  if (
    workspaceRelative === ".." ||
    workspaceRelative.startsWith(`..${sep}`) ||
    isAbsolute(workspaceRelative)
  ) {
    throw new MarkdStageError(
      "invalid_output_path",
      "PNG output directory must be inside the current workspace.",
    );
  }
  return outputDirectory;
}

export async function prepareWorkspaceDirectory(workspaceRoot, outputParent, label) {
  const root = resolve(workspaceRoot);
  const canonicalWorkspaceRoot = await realpath(root);
  const relativeParent = relative(root, outputParent);
  let current = root;

  for (const segment of relativeParent.split(sep).filter(Boolean)) {
    current = join(current, segment);
    try {
      await mkdir(current);
    } catch (error) {
      if (error?.code !== "EEXIST") throw error;
    }
    const canonicalCurrent = await realpath(current);
    if (!isPathInside(canonicalWorkspaceRoot, canonicalCurrent)) {
      throw new MarkdStageError(
        "invalid_output_path",
        `${label} output path must not traverse a link outside the current workspace.`,
      );
    }
    const info = await stat(current);
    if (!info.isDirectory()) {
      throw new MarkdStageError(
        "invalid_output_path",
        `${label} output parent must be a directory inside the current workspace.`,
      );
    }
  }

  return outputParent;
}

export async function preparePdfOutputDirectory(workspaceRoot, outputPath) {
  return prepareWorkspaceDirectory(workspaceRoot, dirname(outputPath), "PDF");
}
