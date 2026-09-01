// PDF export, PNG capture, and fixed 16:9 layout inspection.
//
// The Canvas Extension and the MarkdStage CLI share this implementation so both
// produce byte-identical output. Callers provide a session object with:
//   url, workspaceRoot, sourceName, slides, markdown, mode, index, theme,
//   themeLocked, customThemeCss, customThemeMeta, exportJobs (Map), exporting,
//   and an optional log(message, level) function.

import { mkdtemp, rename, rm, writeFile } from "node:fs/promises";
import { basename, extname, join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { getOutputSnapshotSlides } from "../deck-state.mjs";
import { normalizeTheme } from "../renderer/theme.mjs";
import { MarkdStageError } from "./errors.mjs";
import {
  findChromiumBrowser,
  runCdpOutputBrowser,
  runPdfBrowser,
  verifyPdf,
  verifyPng,
} from "./browser.mjs";
import {
  prepareWorkspaceDirectory,
  preparePdfOutputDirectory,
  resolveCaptureOutputDirectory,
  resolvePdfOutputPath,
} from "./output-paths.mjs";

export const MAX_CAPTURE_SLIDES = 10;

function logFor(inst, message, level = "info") {
  try {
    inst.log?.(message, level);
  } catch (_) {
    /* never let logging throw */
  }
}

function pageUrlFor(inst, params) {
  const url = new URL(inst.url);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, String(value));
  }
  return url.href;
}

export function createOutputSnapshot(inst, requestedTheme) {
  const theme = requestedTheme === undefined ? inst.theme : normalizeTheme(requestedTheme);
  return {
    slides: getOutputSnapshotSlides(inst),
    theme,
    themeLocked: inst.themeLocked,
    customThemeCss: inst.customThemeCss,
    customThemeMeta: inst.customThemeMeta,
  };
}

export function createOutputJob(snapshot, kind) {
  return {
    slides: snapshot.slides,
    theme: snapshot.theme,
    themeLocked: snapshot.themeLocked,
    customThemeCss: snapshot.customThemeCss,
    customThemeMeta: snapshot.customThemeMeta,
    kind,
    status: "pending",
    error: "",
    layout: null,
  };
}

async function runLayoutInspectionJob(inst, snapshot, browser) {
  const token = randomUUID();
  const profileDir = await mkdtemp(join(tmpdir(), "markdstage-inspect-"));
  const job = createOutputJob(snapshot, "inspect");
  inst.exportJobs.set(token, job);
  try {
    const pageUrl = pageUrlFor(inst, { print: 1, token });
    await runCdpOutputBrowser(browser, pageUrl, profileDir, job, false);
    if (!job.layout || !Array.isArray(job.layout.slides)) {
      throw new Error("The layout renderer did not return diagnostics.");
    }
    return job.layout;
  } finally {
    inst.exportJobs.delete(token);
    await rm(profileDir, { recursive: true, force: true }).catch(() => {});
  }
}

export function selectLayoutResults(layout, requestedIndex, includeFits) {
  const selected =
    requestedIndex === undefined
      ? layout.slides
      : layout.slides.filter((slide) => slide.index === requestedIndex);
  const issueCount = selected.filter((slide) => slide.pdfClipped).length;
  return {
    ok: true,
    scope: requestedIndex === undefined ? "deck" : "slide",
    ...(requestedIndex === undefined
      ? {}
      : { index: requestedIndex, page: requestedIndex + 1 }),
    width: layout.width,
    height: layout.height,
    total: layout.total,
    inspected: selected.length,
    issueCount,
    hasIssues: issueCount > 0,
    slides: includeFits ? selected : selected.filter((slide) => slide.pdfClipped),
  };
}

export async function inspectLayout(inst, requestedIndex, includeFits = false) {
  if (inst.exporting) {
    throw new MarkdStageError(
      "output_in_progress",
      "Another PDF, layout inspection, or PNG output job is already running for this canvas.",
    );
  }
  const snapshot = createOutputSnapshot(inst);
  if (!snapshot.slides.length) {
    throw new MarkdStageError(
      "no_deck",
      "No slides are loaded. Load a deck before inspecting layout.",
    );
  }
  if (
    requestedIndex !== undefined &&
    (!Number.isInteger(requestedIndex) ||
      requestedIndex < 0 ||
      requestedIndex >= snapshot.slides.length)
  ) {
    throw new MarkdStageError(
      "slide_out_of_range",
      `Slide index must be between 0 and ${snapshot.slides.length - 1}.`,
    );
  }
  const browser = findChromiumBrowser();
  if (!browser) {
    throw new MarkdStageError(
      "layout_browser_not_found",
      "Layout inspection requires Microsoft Edge, Google Chrome, or Chromium.",
    );
  }

  inst.exporting = true;
  try {
    const layout = await runLayoutInspectionJob(inst, snapshot, browser);
    return selectLayoutResults(layout, requestedIndex, Boolean(includeFits));
  } catch (error) {
    if (error instanceof MarkdStageError) throw error;
    throw new MarkdStageError(
      "layout_inspection_failed",
      error?.message || "Layout inspection failed.",
    );
  } finally {
    inst.exporting = false;
  }
}

export function normalizeCaptureIndexes(requestedIndexes, total) {
  if (!Array.isArray(requestedIndexes) || requestedIndexes.length === 0) {
    throw new MarkdStageError(
      "invalid_input",
      "indexes must be a non-empty array when provided.",
    );
  }
  const indexes = [...new Set(requestedIndexes)];
  if (
    indexes.some(
      (index) => !Number.isInteger(index) || index < 0 || index >= total,
    )
  ) {
    throw new MarkdStageError(
      "slide_out_of_range",
      `Every slide index must be an integer between 0 and ${total - 1}.`,
    );
  }
  if (indexes.length > MAX_CAPTURE_SLIDES) {
    throw new MarkdStageError(
      "too_many_slides",
      `At most ${MAX_CAPTURE_SLIDES} slides can be captured at once.`,
    );
  }
  return indexes.sort((a, b) => a - b);
}

export async function captureSlides(
  inst,
  requestedIndexes,
  requestedDirectory,
  requestedTheme,
) {
  if (inst.exporting) {
    throw new MarkdStageError(
      "output_in_progress",
      "Another PDF, layout inspection, or PNG output job is already running for this canvas.",
    );
  }
  const snapshot = createOutputSnapshot(inst, requestedTheme);
  if (!snapshot.slides.length) {
    throw new MarkdStageError(
      "no_deck",
      "No slides are loaded. Load a deck before capturing PNGs.",
    );
  }
  const browser = findChromiumBrowser();
  if (!browser) {
    throw new MarkdStageError(
      "png_browser_not_found",
      "PNG capture requires Microsoft Edge, Google Chrome, or Chromium.",
    );
  }
  inst.exporting = true;
  const pendingFiles = [];
  try {
    let inspection = null;
    let indexes;
    if (requestedIndexes === undefined) {
      const layout = await runLayoutInspectionJob(inst, snapshot, browser);
      inspection = selectLayoutResults(layout, undefined, false);
      indexes = layout.slides
        .filter((slide) => slide.pdfClipped)
        .map((slide) => slide.index)
        .slice(0, MAX_CAPTURE_SLIDES);
      if (indexes.length === 0) {
        return {
          ok: true,
          total: snapshot.slides.length,
          captured: 0,
          issueCount: 0,
          message: "The PDF layout fits; no PNG capture is needed.",
          files: [],
        };
      }
    } else {
      indexes = normalizeCaptureIndexes(requestedIndexes, snapshot.slides.length);
    }

    const outputDirectory = resolveCaptureOutputDirectory(
      inst.workspaceRoot,
      inst.sourceName,
      requestedDirectory,
    );
    await prepareWorkspaceDirectory(inst.workspaceRoot, outputDirectory, "PNG");
    const pageDigits = Math.max(3, String(snapshot.slides.length).length);
    const files = [];

    for (const index of indexes) {
      const token = randomUUID();
      const pageNumber = String(index + 1).padStart(pageDigits, "0");
      const outputPath = join(outputDirectory, `slide-${pageNumber}.png`);
      const temporaryPath = join(outputDirectory, `.slide-${pageNumber}.${token}.tmp.png`);
      const job = createOutputJob(snapshot, "capture");
      const pageProfileDir = await mkdtemp(join(tmpdir(), "markdstage-capture-"));
      inst.exportJobs.set(token, job);
      let staged = false;
      try {
        const pageUrl = pageUrlFor(inst, { capture: 1, token, index });
        const png = await runCdpOutputBrowser(browser, pageUrl, pageProfileDir, job, true);
        if (!job.layout || !Array.isArray(job.layout.slides)) {
          throw new Error("The PNG renderer did not return layout diagnostics.");
        }
        await writeFile(temporaryPath, png);
        const image = await verifyPng(temporaryPath);
        const diagnostic = job.layout.slides[0];
        pendingFiles.push({ temporaryPath, outputPath });
        staged = true;
        files.push({
          index,
          page: index + 1,
          path: outputPath,
          ...image,
          layout: diagnostic,
        });
      } finally {
        inst.exportJobs.delete(token);
        if (!staged) await rm(temporaryPath, { force: true }).catch(() => {});
        await rm(pageProfileDir, { recursive: true, force: true }).catch(() => {});
      }
    }

    for (const file of pendingFiles) {
      await rm(file.outputPath, { force: true }).catch((error) => {
        if (error?.code !== "ENOENT") throw error;
      });
      await rename(file.temporaryPath, file.outputPath);
      file.temporaryPath = "";
    }

    return {
      ok: true,
      directory: outputDirectory,
      total: snapshot.slides.length,
      captured: files.length,
      issueCount:
        inspection?.issueCount ?? files.filter((file) => file.layout?.pdfClipped).length,
      theme: snapshot.theme,
      files,
    };
  } catch (error) {
    if (error instanceof MarkdStageError) throw error;
    throw new MarkdStageError("png_capture_failed", error?.message || "PNG capture failed.");
  } finally {
    inst.exporting = false;
    for (const file of pendingFiles) {
      if (file.temporaryPath) {
        await rm(file.temporaryPath, { force: true }).catch(() => {});
      }
    }
  }
}

export async function exportPdf(inst, requestedPath, requestedTheme) {
  if (inst.exporting) {
    throw new MarkdStageError(
      "export_in_progress",
      "Another PDF, layout inspection, or PNG output job is already running for this canvas.",
    );
  }
  inst.exporting = true;
  let token = "";
  let profileDir = "";
  let temporaryOutputPath = "";

  try {
    const snapshot = createOutputSnapshot(inst, requestedTheme);
    if (!snapshot.slides.length) {
      throw new MarkdStageError(
        "no_deck",
        "No slides are loaded. Load a deck before exporting PDF.",
      );
    }

    const browser = findChromiumBrowser();
    if (!browser) {
      throw new MarkdStageError(
        "pdf_browser_not_found",
        "PDF export requires Microsoft Edge, Google Chrome, or Chromium.",
      );
    }

    const outputPath = resolvePdfOutputPath(inst.workspaceRoot, requestedPath);
    const outputParent = await preparePdfOutputDirectory(inst.workspaceRoot, outputPath);
    token = randomUUID();
    profileDir = await mkdtemp(join(tmpdir(), "markdstage-pdf-"));
    const outputBase = basename(outputPath, extname(outputPath)) || "markdstage";
    temporaryOutputPath = join(outputParent, `.${outputBase}.${token}.tmp.pdf`);
    inst.exportJobs.set(token, createOutputJob(snapshot, "pdf"));

    const pageUrl = pageUrlFor(inst, { print: 1, token });
    await runPdfBrowser(browser, pageUrl, temporaryOutputPath, profileDir);
    const exportJob = inst.exportJobs.get(token);
    if (exportJob?.status !== "ready") {
      throw new Error(
        exportJob?.error || "The print renderer did not finish before the browser exited.",
      );
    }
    const bytes = await verifyPdf(temporaryOutputPath);
    await rename(temporaryOutputPath, outputPath);
    temporaryOutputPath = "";
    logFor(inst, `MarkdStage: exported ${snapshot.slides.length} slides to ${outputPath}`);
    return {
      ok: true,
      path: outputPath,
      total: snapshot.slides.length,
      theme: snapshot.theme,
      bytes,
    };
  } catch (error) {
    if (error instanceof MarkdStageError) throw error;
    throw new MarkdStageError("pdf_export_failed", error?.message || "PDF export failed.");
  } finally {
    if (token) {
      inst.exportJobs.delete(token);
    }
    if (temporaryOutputPath) {
      await rm(temporaryOutputPath, { force: true }).catch(() => {});
    }
    inst.exporting = false;
    if (profileDir) {
      await rm(profileDir, { recursive: true, force: true }).catch(() => {});
    }
  }
}
