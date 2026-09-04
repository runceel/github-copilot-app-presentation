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
const FALLBACK_PNG = Buffer.concat([PNG, Buffer.from([1])]);
const SVG = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="100" height="50"/>');

function model(elements, notes, fallbacks = [], layoutElements = []) {
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
        elements: layoutElements,
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
        fallbacks,
      },
    ],
  };
}

test("prepares clipped fallback images, notes, and deduplicated native images", async () => {
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
      [
        {
          type: "mermaid",
          path: ".body > pre.mermaid",
          reason: "mermaid-rendered-as-artwork",
          x: 40,
          y: 50,
          width: 320,
          height: 180,
        },
      ],
    ),
    [PNG],
    [
      [
        {
          fallbackIndex: 0,
          x: 40,
          y: 50,
          width: 320,
          height: 180,
          data: FALLBACK_PNG,
        },
      ],
    ],
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
      elements: [],
    },
  ]);
  assert.equal(prepared.slides[0].layoutId, "dark:default");
  assert.equal(prepared.slides[0].artworkAssetId, undefined);
  assert.equal(prepared.slides[0].notes, "Explain the editable image.");
  assert.match(prepared.slides[0].elements[0].assetId, /fallback-1$/);
  assert.deepEqual(
    {
      x: prepared.slides[0].elements[0].x,
      y: prepared.slides[0].elements[0].y,
      width: prepared.slides[0].elements[0].width,
      height: prepared.slides[0].elements[0].height,
    },
    { x: 40, y: 50, width: 320, height: 180 },
  );
  assert.equal(prepared.slides[0].elements[1].assetId, "markdstage-image-1");
  assert.equal(prepared.slides[0].elements[2].assetId, "markdstage-image-1");
  assert.deepEqual(
    {
      x: prepared.slides[0].elements[1].x,
      y: prepared.slides[0].elements[1].y,
      width: prepared.slides[0].elements[1].width,
      height: prepared.slides[0].elements[1].height,
    },
    { x: 200, y: 100, width: 200, height: 200 },
  );
});

test("prepares SVG images on layouts and slides as shared native assets", async () => {
  let requests = 0;
  const image = {
    type: "image",
    src: "./assets/logo.svg",
    x: 84,
    y: 40,
    width: 200,
    height: 100,
    fit: "contain",
    naturalWidth: 100,
    naturalHeight: 50,
  };
  const prepared = await preparePptxPackageModel(
    { url: "http://127.0.0.1:4321/token/" },
    model([image], undefined, [], [image]),
    [PNG],
    [[]],
    async () => {
      requests += 1;
      return new Response(SVG, { headers: { "content-type": "image/svg+xml" } });
    },
  );

  assert.equal(requests, 1);
  assert.equal(prepared.assets.filter((asset) => asset.contentType === "image/svg+xml").length, 1);
  assert.equal(prepared.layouts[0].elements[0].assetId, "markdstage-image-1");
  assert.equal(prepared.slides[0].elements[0].assetId, "markdstage-image-1");
});

test("decodes parameterized UTF-8 SVG data URLs without corrupting text", async () => {
  const source = '<svg xmlns="http://www.w3.org/2000/svg"><text>日本語</text></svg>';
  const image = {
    type: "image",
    src: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(source)}`,
    x: 0,
    y: 0,
    width: 100,
    height: 50,
    fit: "fill",
  };
  const prepared = await preparePptxPackageModel(
    { url: "http://127.0.0.1:4321/token/" },
    model([image]),
    [PNG],
    [[]],
  );

  const asset = prepared.assets.find((candidate) => candidate.contentType === "image/svg+xml");
  assert.equal(asset.data.toString("utf8"), source);
});

test("orders fallback pictures with native elements by renderer z-order", async () => {
  const prepared = await preparePptxPackageModel(
    { url: "http://127.0.0.1:4321/token/" },
    model(
      [
        {
          type: "text",
          x: 0,
          y: 0,
          width: 100,
          height: 20,
          zOrder: 10,
          paragraphs: [{ runs: [{ text: "Before" }] }],
        },
        {
          type: "image",
          src: "./assets/photo.png",
          x: 0,
          y: 40,
          width: 100,
          height: 50,
          fit: "fill",
          zOrder: 30,
        },
      ],
      undefined,
      [
        {
          type: "mermaid",
          path: ".body > pre.mermaid",
          reason: "mermaid-rendered-as-artwork",
          x: 0,
          y: 20,
          width: 100,
          height: 20,
          zOrder: 20,
        },
      ],
    ),
    [PNG],
    [
      [
        {
          fallbackIndex: 0,
          x: 0,
          y: 20,
          width: 100,
          height: 20,
          data: FALLBACK_PNG,
        },
      ],
    ],
    async () => new Response(PNG, { headers: { "content-type": "image/png" } }),
  );

  assert.deepEqual(
    prepared.slides[0].elements.map((element) => element.zOrder),
    [10, 20, 30],
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
    /do not match the slide count/,
  );
  await assert.rejects(
    preparePptxPackageModel(
      { url: "http://127.0.0.1:4321/token/" },
      model([], 42),
      [PNG],
      [[]],
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
      [[]],
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
