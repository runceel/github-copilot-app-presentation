import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  ARCHITECTURE_ASSET_MAX_BYTES,
  importArchitectureAsset,
  listArchitectureAssets,
  normalizeArchitectureAssetName,
} from "../scripts/architecture-assets.mjs";

const PNG = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0]);
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);
const WEBP = Buffer.concat([
  Buffer.from("RIFF", "ascii"),
  Buffer.alloc(4),
  Buffer.from("WEBP", "ascii"),
]);
const SVG = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><rect width="1" height="1"/></svg>');

async function withWorkspace(run) {
  const workspace = await mkdtemp(join(tmpdir(), "presentation-architecture-assets-"));
  try {
    await run(workspace);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
}

test("normalizes imported filenames to the Architecture asset contract", () => {
  assert.deepEqual(normalizeArchitectureAssetName("Résumé hero.PNG"), {
    stem: "Resume-hero",
    extension: "png",
  });
  assert.deepEqual(normalizeArchitectureAssetName("日本語.svg"), {
    stem: "image",
    extension: "svg",
  });
  assert.throws(
    () => normalizeArchitectureAssetName("script.js"),
    (error) => error?.code === "unsupported_asset_type",
  );
});

test("imports supported images without overwriting collisions and lists nested assets", async () => {
  await withWorkspace(async (workspace) => {
    const first = await importArchitectureAsset(workspace, {
      filename: "Hero Image.PNG",
      contentType: "image/png",
      content: PNG,
    });
    const second = await importArchitectureAsset(workspace, {
      filename: "Hero Image.PNG",
      contentType: "image/png",
      content: PNG,
    });
    assert.equal(first.path, "assets/Hero-Image.png");
    assert.equal(second.path, "assets/Hero-Image-2.png");
    assert.deepEqual(await readFile(join(workspace, "assets", "Hero-Image.png")), PNG);

    await mkdir(join(workspace, "assets", "nested"));
    await writeFile(join(workspace, "assets", "nested", "logo.svg"), SVG);
    await writeFile(join(workspace, "assets", "ignored.gif"), Buffer.from("GIF89a"));
    const listed = await listArchitectureAssets(workspace);
    assert.deepEqual(
      listed.map((asset) => asset.path),
      [
        "assets/Hero-Image-2.png",
        "assets/Hero-Image.png",
        "assets/nested/logo.svg",
      ],
    );
  });
});

test("validates content type, signature, size, and supported extensions", async () => {
  await withWorkspace(async (workspace) => {
    for (const [filename, contentType, content] of [
      ["photo.jpg", "image/jpeg", JPEG],
      ["photo.jpeg", "image/jpeg", JPEG],
      ["art.webp", "image/webp", WEBP],
      ["vector.svg", "image/svg+xml", SVG],
    ]) {
      const result = await importArchitectureAsset(workspace, {
        filename,
        contentType,
        content,
      });
      assert.ok(result.path.startsWith("assets/"));
    }
    await assert.rejects(
      importArchitectureAsset(workspace, {
        filename: "fake.png",
        contentType: "image/png",
        content: Buffer.from("not a png"),
      }),
      (error) => error?.code === "asset_signature_mismatch",
    );
    await assert.rejects(
      importArchitectureAsset(workspace, {
        filename: "fake.png",
        contentType: "image/jpeg",
        content: PNG,
      }),
      (error) => error?.code === "asset_content_type_mismatch",
    );
    await assert.rejects(
      importArchitectureAsset(workspace, {
        filename: "huge.png",
        contentType: "image/png",
        content: Buffer.alloc(ARCHITECTURE_ASSET_MAX_BYTES + 1),
      }),
      (error) => error?.code === "asset_too_large",
    );
    await assert.rejects(
      importArchitectureAsset(workspace, {
        filename: "animation.gif",
        contentType: "image/gif",
        content: Buffer.from("GIF89a"),
      }),
      (error) => error?.code === "unsupported_asset_type",
    );
  });
});

test("returns an empty library when assets is absent", async () => {
  await withWorkspace(async (workspace) => {
    assert.deepEqual(await listArchitectureAssets(workspace), []);
  });
});

test("lists Markdown-adjacent assets before workspace assets and removes shadowed paths", async () => {
  await withWorkspace(async (workspace) => {
    const source = join(workspace, "decks", "slides.md");
    const localAssets = join(workspace, "decks", "assets");
    const sharedAssets = join(workspace, "assets");
    await mkdir(localAssets, { recursive: true });
    await mkdir(sharedAssets, { recursive: true });
    await writeFile(source, "# Deck");
    await writeFile(join(localAssets, "local.svg"), SVG);
    await writeFile(join(localAssets, "shared.svg"), Buffer.concat([SVG, Buffer.from("local")]));
    await writeFile(join(sharedAssets, "shared.svg"), Buffer.concat([SVG, Buffer.from("root")]));
    await writeFile(join(sharedAssets, "workspace.svg"), SVG);

    const listed = await listArchitectureAssets(workspace, source);
    assert.deepEqual(
      listed.map((asset) => asset.path),
      ["assets/local.svg", "assets/shared.svg", "assets/workspace.svg"],
    );
    assert.equal(
      listed.find((asset) => asset.path === "assets/shared.svg").size,
      SVG.length + Buffer.byteLength("local"),
    );
  });
});

test("rejects an assets junction that leaves the workspace", async (context) => {
  await withWorkspace(async (workspace) => {
    const outside = await mkdtemp(join(tmpdir(), "presentation-assets-outside-"));
    try {
      try {
        await symlink(outside, join(workspace, "assets"), "junction");
      } catch (error) {
        context.skip(`junction creation is unavailable: ${error.code}`);
        return;
      }
      await assert.rejects(
        listArchitectureAssets(workspace),
        (error) => error?.code === "asset_root_outside_workspace",
      );
      await assert.rejects(
        importArchitectureAsset(workspace, {
          filename: "escape.png",
          contentType: "image/png",
          content: PNG,
        }),
        (error) => error?.code === "asset_root_outside_workspace",
      );
    } finally {
      await rm(outside, { recursive: true, force: true });
    }
  });
});
