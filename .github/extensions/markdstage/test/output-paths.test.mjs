import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import {
  pptxNameForSource,
  preparePptxOutputDirectory,
  resolvePptxOutputPath,
} from "../runtime/output-paths.mjs";

test("derives safe PowerPoint names from Markdown sources", () => {
  assert.equal(pptxNameForSource("slides.md"), "slides.pptx");
  assert.equal(pptxNameForSource("nested/deck.markdown"), "deck.pptx");
  assert.equal(pptxNameForSource("bad:name?.md"), "bad_name_.pptx");
  assert.equal(pptxNameForSource(""), "markdstage.pptx");
});

test("confines PowerPoint output to the workspace and requires .pptx", () => {
  const root = join(tmpdir(), "markdstage-output-root");
  assert.equal(resolvePptxOutputPath(root, "exports/deck.pptx"), join(root, "exports", "deck.pptx"));
  assert.throws(
    () => resolvePptxOutputPath(root, "../deck.pptx"),
    /inside the current workspace/,
  );
  assert.throws(
    () => resolvePptxOutputPath(root, "deck.pdf"),
    /must end with \.pptx/,
  );
});

test("rejects PowerPoint parent links that escape the workspace", async () => {
  const root = await mkdtemp(join(tmpdir(), "markdstage-pptx-root-"));
  const outside = await mkdtemp(join(tmpdir(), "markdstage-pptx-outside-"));
  try {
    const link = join(root, "linked");
    const { symlink } = await import("node:fs/promises");
    await symlink(outside, link, process.platform === "win32" ? "junction" : "dir");
    const outputPath = resolvePptxOutputPath(root, "linked/deck.pptx");
    await assert.rejects(
      preparePptxOutputDirectory(root, outputPath),
      /must not traverse a link outside/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(outside, { recursive: true, force: true });
  }
});
