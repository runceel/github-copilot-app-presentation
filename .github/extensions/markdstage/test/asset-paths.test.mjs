import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

import {
  assetRootCandidates,
  resolveAssetFile,
} from "../scripts/asset-paths.mjs";

async function withWorkspace(run) {
  const workspace = await mkdtemp(join(tmpdir(), "presentation-asset-paths-"));
  try {
    await run(workspace);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
}

test("prefers Markdown-adjacent assets and falls back to workspace assets", async () => {
  await withWorkspace(async (workspace) => {
    const source = join(workspace, "decks", "quarterly", "slides.md");
    const localAssets = join(workspace, "decks", "quarterly", "assets");
    const sharedAssets = join(workspace, "assets");
    await mkdir(localAssets, { recursive: true });
    await mkdir(sharedAssets, { recursive: true });
    await writeFile(source, "# Deck");
    await writeFile(join(localAssets, "brand.svg"), "deck-local");
    await writeFile(join(sharedAssets, "brand.svg"), "workspace-shared");
    await writeFile(join(sharedAssets, "common.svg"), "common");

    assert.deepEqual(assetRootCandidates(workspace, source), [
      resolve(localAssets),
      resolve(sharedAssets),
    ]);
    assert.equal(
      await readFile(await resolveAssetFile(workspace, source, "brand.svg"), "utf8"),
      "deck-local",
    );
    assert.equal(
      await readFile(await resolveAssetFile(workspace, source, "common.svg"), "utf8"),
      "common",
    );
    assert.equal(await resolveAssetFile(workspace, source, "missing.svg"), null);
  });
});

test("deduplicates the asset root for a Markdown file at workspace root", async () => {
  await withWorkspace(async (workspace) => {
    assert.deepEqual(assetRootCandidates(workspace, join(workspace, "slides.md")), [
      resolve(workspace, "assets"),
    ]);
  });
});

test("rejects source and asset paths that leave the workspace", async () => {
  await withWorkspace(async (workspace) => {
    assert.throws(
      () => assetRootCandidates(workspace, join(workspace, "..", "slides.md")),
      (error) => error?.code === "asset_source_outside_workspace",
    );
    await assert.rejects(
      resolveAssetFile(workspace, "", "../secret.svg"),
      (error) => error?.code === "invalid_asset_path",
    );
  });
});

test("rejects a Markdown-adjacent assets junction that leaves the workspace", async (context) => {
  await withWorkspace(async (workspace) => {
    const sourceDir = join(workspace, "deck");
    const outside = await mkdtemp(join(tmpdir(), "presentation-assets-outside-"));
    try {
      await mkdir(sourceDir, { recursive: true });
      await writeFile(join(sourceDir, "slides.md"), "# Deck");
      await writeFile(join(outside, "logo.svg"), "outside");
      try {
        await symlink(outside, join(sourceDir, "assets"), "junction");
      } catch (error) {
        context.skip(`junction creation is unavailable: ${error.code}`);
        return;
      }
      await assert.rejects(
        resolveAssetFile(workspace, join(sourceDir, "slides.md"), "logo.svg"),
        (error) => error?.code === "asset_root_outside_workspace",
      );
    } finally {
      await rm(outside, { recursive: true, force: true });
    }
  });
});
