// PDF/PowerPoint export, PNG capture, and fixed 16:9 layout inspection.
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
  runPptxOutputBrowser,
  verifyPdf,
  verifyPng,
} from "./browser.mjs";
import {
  prepareWorkspaceDirectory,
  preparePdfOutputDirectory,
  preparePptxOutputDirectory,
  resolveCaptureOutputDirectory,
  resolvePdfOutputPath,
  resolvePptxOutputPath,
} from "./output-paths.mjs";
import {
  buildPptxPackage,
  inspectPptxPackage,
  PPTX_DIMENSIONS,
} from "./pptx-package.mjs";

export const MAX_CAPTURE_SLIDES = 10;
export const MAX_PPTX_ASSET_BYTES = 10 * 1024 * 1024;
export const MAX_PPTX_TOTAL_ASSET_BYTES = 100 * 1024 * 1024;

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

function decodeDataImage(source) {
  const match = /^data:(image\/(?:png|jpeg|gif))(;base64)?,([\s\S]*)$/i.exec(source);
  if (!match) {
    throw new Error("Only PNG, JPEG, or GIF data URLs can be embedded in PowerPoint.");
  }
  const data = match[2]
    ? Buffer.from(match[3], "base64")
    : Buffer.from(decodeURIComponent(match[3]), "binary");
  return { data, contentType: match[1].toLowerCase() };
}

function ensurePptxAssetSize(data, source, currentTotal) {
  if (data.length > MAX_PPTX_ASSET_BYTES) {
    throw new Error(
      `PowerPoint image exceeds ${MAX_PPTX_ASSET_BYTES} bytes: ${source}`,
    );
  }
  if (currentTotal + data.length > MAX_PPTX_TOTAL_ASSET_BYTES) {
    throw new Error(
      `PowerPoint image assets exceed ${MAX_PPTX_TOTAL_ASSET_BYTES} bytes in total.`,
    );
  }
}

async function loadPptxImage(inst, source, fetchImpl, currentTotal) {
  if (typeof source !== "string" || !source) {
    throw new Error("PowerPoint image is missing its source URL.");
  }
  if (source.startsWith("data:")) {
    const decoded = decodeDataImage(source);
    ensurePptxAssetSize(decoded.data, "data URL", currentTotal);
    return decoded;
  }

  const base = new URL(inst.url);
  const url = new URL(source, base);
  if (url.origin !== base.origin) {
    throw new Error(`PowerPoint image must be served by the MarkdStage workspace: ${source}`);
  }
  const response = await fetchImpl(url, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Could not load PowerPoint image (${response.status}): ${source}`);
  }
  const data = Buffer.from(await response.arrayBuffer());
  ensurePptxAssetSize(data, source, currentTotal);
  const responseType = response.headers.get("content-type")?.split(";")[0].trim().toLowerCase();
  const contentType = ["image/png", "image/jpeg", "image/gif"].includes(responseType)
    ? responseType
    : undefined;
  return { data, contentType };
}

export async function preparePptxPackageModel(
  inst,
  model,
  layoutArtworks,
  slideArtworks,
  fetchImpl = fetch,
) {
  if (
    !model ||
    model.version !== 1 ||
    model.width !== PPTX_DIMENSIONS.widthPx ||
    model.height !== PPTX_DIMENSIONS.heightPx ||
    !Array.isArray(model.masters) ||
    model.masters.length === 0 ||
    !Array.isArray(model.layouts) ||
    model.layouts.length === 0 ||
    !Array.isArray(model.slides) ||
    model.slides.length === 0
  ) {
    throw new Error("The renderer returned an unsupported PowerPoint export model.");
  }
  if (!Array.isArray(layoutArtworks) || layoutArtworks.length !== model.layouts.length) {
    throw new Error("PowerPoint layout artwork does not match the layout count.");
  }
  if (!Array.isArray(slideArtworks) || slideArtworks.length !== model.slides.length) {
    throw new Error("PowerPoint fallback artwork does not match the slide count.");
  }

  const assets = [];
  const sourceAssets = new Map();
  let totalAssetBytes = 0;
  const addPngAsset = (id, data, label) => {
    if (!Buffer.isBuffer(data)) {
      throw new Error(`${label} is invalid.`);
    }
    ensurePptxAssetSize(data, label, totalAssetBytes);
    totalAssetBytes += data.length;
    assets.push({
      id,
      contentType: "image/png",
      data,
    });
  };

  const layouts = [];
  const layoutById = new Map();
  for (const [index, sourceLayout] of model.layouts.entries()) {
    if (
      !sourceLayout ||
      typeof sourceLayout.id !== "string" ||
      !sourceLayout.id ||
      typeof sourceLayout.name !== "string" ||
      !sourceLayout.name ||
      typeof sourceLayout.theme !== "string" ||
      !sourceLayout.theme
    ) {
      throw new Error(`PowerPoint layout ${index + 1} is invalid.`);
    }
    if (layoutById.has(sourceLayout.id)) {
      throw new Error(`PowerPoint layout id is duplicated: ${sourceLayout.id}`);
    }
    const artworkAssetId = `markdstage-layout-${index + 1}`;
    addPngAsset(
      artworkAssetId,
      layoutArtworks[index],
      `PowerPoint artwork for layout ${sourceLayout.id}`,
    );
    const layout = {
      id: sourceLayout.id,
      name: sourceLayout.name,
      theme: sourceLayout.theme,
      artworkAssetId,
    };
    layoutById.set(layout.id, layout);
    layouts.push(layout);
  }

  const masters = model.masters.map((sourceMaster, index) => {
    if (
      !sourceMaster ||
      typeof sourceMaster.id !== "string" ||
      !sourceMaster.id ||
      typeof sourceMaster.theme !== "string" ||
      !sourceMaster.theme ||
      !Array.isArray(sourceMaster.layoutIds) ||
      sourceMaster.layoutIds.length === 0
    ) {
      throw new Error(`PowerPoint master ${index + 1} is invalid.`);
    }
    const layoutIds = sourceMaster.layoutIds.map((layoutId) => {
      const layout = layoutById.get(layoutId);
      if (!layout || layout.theme !== sourceMaster.theme) {
        throw new Error(
          `PowerPoint master ${sourceMaster.id} references invalid layout ${layoutId}.`,
        );
      }
      return layoutId;
    });
    return {
      id: sourceMaster.id,
      theme: sourceMaster.theme,
      layoutIds,
    };
  });
  if (new Set(masters.map((master) => master.id)).size !== masters.length) {
    throw new Error("PowerPoint master ids must be unique.");
  }

  const slides = [];
  for (const [slideIndex, sourceSlide] of model.slides.entries()) {
    if (!sourceSlide || !Array.isArray(sourceSlide.elements)) {
      throw new Error(`PowerPoint slide ${slideIndex + 1} has an invalid element list.`);
    }
    if (
      typeof sourceSlide.layoutId !== "string" ||
      !layoutById.has(sourceSlide.layoutId)
    ) {
      throw new Error(`PowerPoint slide ${slideIndex + 1} references an invalid layout.`);
    }
    if (sourceSlide.notes !== undefined && typeof sourceSlide.notes !== "string") {
      throw new Error(`PowerPoint slide ${slideIndex + 1} has invalid speaker notes.`);
    }
    const artworkAssetId = `markdstage-slide-artwork-${slideIndex + 1}`;
    addPngAsset(
      artworkAssetId,
      slideArtworks[slideIndex],
      `PowerPoint fallback artwork for slide ${slideIndex + 1}`,
    );
    const elements = [];
    for (const sourceElement of sourceSlide.elements) {
      if (sourceElement?.type !== "image") {
        elements.push(sourceElement);
        continue;
      }
      const source = sourceElement.src;
      let assetId = sourceAssets.get(source);
      if (!assetId) {
        const loaded = await loadPptxImage(inst, source, fetchImpl, totalAssetBytes);
        totalAssetBytes += loaded.data.length;
        assetId = `markdstage-image-${sourceAssets.size + 1}`;
        sourceAssets.set(source, assetId);
        assets.push({ id: assetId, ...loaded });
      }
      const { src: _src, source: _source, ...image } = sourceElement;
      if (
        (image.fit === "contain" || image.fit === "scale-down") &&
        image.naturalWidth > 0 &&
        image.naturalHeight > 0
      ) {
        const scale = Math.min(
          image.width / image.naturalWidth,
          image.height / image.naturalHeight,
          image.fit === "scale-down" ? 1 : Number.POSITIVE_INFINITY,
        );
        const width = image.naturalWidth * scale;
        const height = image.naturalHeight * scale;
        image.x += (image.width - width) / 2;
        image.y += (image.height - height) / 2;
        image.width = width;
        image.height = height;
      }
      elements.push({ ...image, assetId });
    }
    slides.push({
      layoutId: sourceSlide.layoutId,
      artworkAssetId,
      ...(sourceSlide.notes ? { notes: sourceSlide.notes } : {}),
      elements,
    });
  }
  return { masters, layouts, slides, assets };
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
      "Another PDF, PowerPoint, layout inspection, or PNG output job is already running for this canvas.",
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
      "Another PDF, PowerPoint, layout inspection, or PNG output job is already running for this canvas.",
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
      "Another PDF, PowerPoint, layout inspection, or PNG output job is already running for this canvas.",
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
    const exportJob = createOutputJob(snapshot, "pdf");
    inst.exportJobs.set(token, exportJob);

    const pageUrl = pageUrlFor(inst, { print: 1, token });
    await runPdfBrowser(browser, pageUrl, temporaryOutputPath, profileDir, exportJob);
    if (exportJob.status !== "ready") {
      throw new Error(
        exportJob.error || "The print renderer did not finish before PDF generation.",
      );
    }
    const bytes = await verifyPdf(temporaryOutputPath);
    await rename(temporaryOutputPath, outputPath);
    temporaryOutputPath = "";
    logFor(inst, `MarkdStage: exported ${snapshot.slides.length} slides to ${outputPath}`);
    return {
      ok: true,
      format: "pdf",
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

export async function exportPptx(
    inst,
    requestedPath,
    requestedTheme,
    dependencies = {},
) {
    const findBrowser = dependencies.findChromiumBrowser ?? findChromiumBrowser;
    const runBrowser = dependencies.runPptxOutputBrowser ?? runPptxOutputBrowser;
    const prepareModel = dependencies.preparePptxPackageModel ?? preparePptxPackageModel;
    const buildPackage = dependencies.buildPptxPackage ?? buildPptxPackage;
    const inspectPackage = dependencies.inspectPptxPackage ?? inspectPptxPackage;
    if (inst.exporting) {
      throw new MarkdStageError(
        "export_in_progress",
        "Another PDF, PowerPoint, layout inspection, or PNG output job is already running for this canvas.",
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
          "No slides are loaded. Load a deck before exporting PowerPoint.",
        );
      }

      const browser = findBrowser();
      if (!browser) {
        throw new MarkdStageError(
          "pptx_browser_not_found",
          "PowerPoint export requires Microsoft Edge, Google Chrome, or Chromium.",
        );
      }

      const outputPath = resolvePptxOutputPath(inst.workspaceRoot, requestedPath);
      const outputParent = await preparePptxOutputDirectory(inst.workspaceRoot, outputPath);
      token = randomUUID();
      profileDir = await mkdtemp(join(tmpdir(), "markdstage-pptx-"));
      const outputBase = basename(outputPath, extname(outputPath)) || "markdstage";
      temporaryOutputPath = join(outputParent, `.${outputBase}.${token}.tmp.pptx`);
      const job = createOutputJob(snapshot, "pptx");
      inst.exportJobs.set(token, job);

      const pageUrl = pageUrlFor(inst, { pptx: 1, token });
      const { model, layoutArtworks, slideArtworks } = await runBrowser(
        browser,
        pageUrl,
        profileDir,
        job,
        snapshot.slides.length,
      );
      const packageModel = await prepareModel(
        inst,
        model,
        layoutArtworks,
        slideArtworks,
      );
      const buffer = buildPackage({
        title: model.slides[0]?.title || outputBase,
        ...packageModel,
      });
      const packageSummary = inspectPackage(buffer);
      const expectedNotes = model.slides.filter(
        (slide) => typeof slide.notes === "string" && slide.notes.trim(),
      ).length;
      if (
        !packageSummary.valid ||
        packageSummary.slideCount !== snapshot.slides.length ||
        packageSummary.notesCount !== expectedNotes ||
        packageSummary.masterCount !== model.masters.length ||
        packageSummary.layoutCount !== model.layouts.length ||
        packageSummary.dimensions.widthEmu !== PPTX_DIMENSIONS.widthEmu ||
        packageSummary.dimensions.heightEmu !== PPTX_DIMENSIONS.heightEmu
      ) {
        throw new Error("The generated PowerPoint package failed validation.");
      }

      await writeFile(temporaryOutputPath, buffer);
      await rename(temporaryOutputPath, outputPath);
      temporaryOutputPath = "";
      const fallbacks = model.slides.flatMap((slide, slideIndex) =>
        (Array.isArray(slide.fallbacks) ? slide.fallbacks : []).map((fallback) => ({
          slideIndex,
          page: slideIndex + 1,
          ...fallback,
        })),
      );
      logFor(
        inst,
        `MarkdStage: exported ${snapshot.slides.length} slides to ${outputPath} (${fallbacks.length} fallbacks)`,
      );
      return {
        ok: true,
        format: "pptx",
        path: outputPath,
        total: snapshot.slides.length,
        theme: snapshot.theme,
        bytes: buffer.length,
        fallbackCount: fallbacks.length,
        fallbacks,
      };
    } catch (error) {
      if (error instanceof MarkdStageError) throw error;
      throw new MarkdStageError(
        "pptx_export_failed",
        error?.message || "PowerPoint export failed.",
      );
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
