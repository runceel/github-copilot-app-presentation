import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { exportPptx, preparePptxPackageModel } from "../runtime/output.mjs";

const PNG = Buffer.from([
  137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82,
  0, 0, 0, 1, 0, 0, 0, 1,
]);

function model(elements, notes) {
  return {
    version: 1,
    width: 1280,
    height: 720,
    masters: [
      {
        id: "dark",
        theme: "dark",
        layoutIds: ["dark:default"],
      },
    ],
    layouts: [
      {
        id: "dark:default",
        name: "default",
        theme: "dark",
      },
    ],
    slides: [
      {
        index: 0,
        layout: "default",
        layoutId: "dark:default",
        theme: "dark",
        title: "Test",
        width: 1280,
        height: 720,
        ...(notes ? { notes } : {}),
        elements,
        fallbacks: [],
      },
    ],
  };
}

test("prepares fallback artwork, notes, and deduplicated native images", async () => {
  let requests = 0;
  const prepared = await preparePptxPackageModel(
    { url: "http://127.0.0.1:4321/token/" },
    model(
      [
        {
          type: "image",
          src: "./assets/photo.png",
          x: 100,
          y: 100,
          width: 400,
          height: 200,
          fit: "contain",
          naturalWidth: 100,
          naturalHeight: 100,
        },
        {
          type: "image",
          src: "./assets/photo.png",
          x: 10,
          y: 10,
          width: 50,
          height: 50,
          fit: "fill",
        },
      ],
      "Explain the editable image.",
    ),
    [PNG],
    [PNG],
    async () => {
      requests += 1;
      return new Response(PNG, { headers: { "content-type": "image/png" } });
    },
  );

  assert.equal(requests, 1);
  assert.equal(prepared.assets.length, 3);
  assert.deepEqual(prepared.masters, [
    { id: "dark", theme: "dark", layoutIds: ["dark:default"] },
  ]);
  assert.deepEqual(prepared.layouts, [
    {
      id: "dark:default",
      name: "default",
      theme: "dark",
      artworkAssetId: "markdstage-layout-1",
    },
  ]);
  assert.equal(prepared.slides[0].layoutId, "dark:default");
  assert.equal(prepared.slides[0].artworkAssetId, "markdstage-slide-artwork-1");
  assert.equal(prepared.slides[0].notes, "Explain the editable image.");
  assert.equal(prepared.slides[0].elements[0].assetId, "markdstage-image-1");
  assert.equal(prepared.slides[0].elements[1].assetId, "markdstage-image-1");
  assert.deepEqual(
    {
      x: prepared.slides[0].elements[0].x,
      y: prepared.slides[0].elements[0].y,
      width: prepared.slides[0].elements[0].width,
      height: prepared.slides[0].elements[0].height,
    },
    { x: 200, y: 100, width: 200, height: 200 },
  );
});

test("rejects mismatched artwork and non-workspace image URLs", async () => {
  await assert.rejects(
    preparePptxPackageModel(
      { url: "http://127.0.0.1:4321/token/" },
      model([]),
      [PNG],
      [],
    ),
    /does not match the slide count/,
  );
  await assert.rejects(
    preparePptxPackageModel(
      { url: "http://127.0.0.1:4321/token/" },
      model([], 42),
      [PNG],
      [PNG],
    ),
    /invalid speaker notes/,
  );
  await assert.rejects(
    preparePptxPackageModel(
      { url: "http://127.0.0.1:4321/token/" },
      model([
        {
          type: "image",
          src: "https://example.com/photo.png",
          x: 0,
          y: 0,
          width: 10,
          height: 10,
        },
      ]),
      [PNG],
      [PNG],
    ),
    /must be served by the MarkdStage workspace/,
  );
});

test("failed PowerPoint export preserves the destination and removes temporary files", async () => {
  const workspaceRoot = await mkdtemp(join(tmpdir(), "markdstage-pptx-atomic-"));
  const destination = join(workspaceRoot, "deck.pptx");
  await writeFile(destination, "existing", "utf8");
  const inst = {
    url: "http://127.0.0.1:4321/token/",
    workspaceRoot,
    sourceName: "slides.md",
    slides: ["# Slide"],
    markdown: "# Slide",
    mode: "deck",
    index: 0,
    theme: "dark",
    themeLocked: false,
    customThemeCss: "",
    customThemeMeta: null,
    exportJobs: new Map(),
    exporting: false,
  };
  try {
    await assert.rejects(
      exportPptx(inst, "deck.pptx", undefined, {
        findChromiumBrowser: () => "browser",
        runPptxOutputBrowser: async () => {
          throw new Error("render failed");
        },
      }),
      /render failed/,
    );
    assert.equal(await readFile(destination, "utf8"), "existing");
    assert.deepEqual(
      (await readdir(workspaceRoot)).filter((name) => name.includes(".tmp.pptx")),
      [],
    );
    assert.equal(inst.exporting, false);
    assert.equal(inst.exportJobs.size, 0);
  } finally {
    await rm(workspaceRoot, { recursive: true, force: true });
  }
});
