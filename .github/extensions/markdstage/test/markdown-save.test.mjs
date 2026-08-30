import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { atomicReplaceMarkdown } from "../scripts/atomic-markdown-replace.mjs";
import { serializeMarkdownSave } from "../scripts/markdown-save-coordinator.mjs";

test("atomic Markdown replace keeps an external edit when validation detects a race", async () => {
  const directory = await mkdtemp(join(tmpdir(), "presentation-markdown-save-"));
  const path = join(directory, "slides.md");
  try {
    await writeFile(path, "before", "utf8");
    const mode = (await stat(path)).mode;

    await assert.rejects(
      atomicReplaceMarkdown({
        path,
        markdown: "editor",
        expectedMarkdown: "before",
        mode,
        revalidate: async () => {
          await writeFile(path, "external", "utf8");
        },
      }),
      (error) => error?.code === "SOURCE_CHANGED",
    );
    assert.equal(await readFile(path, "utf8"), "external");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("all editor surfaces serialize writes to the same Markdown path", async () => {
  const path = join(tmpdir(), "presentation-shared-save.md");
  const events = [];
  let releaseFirst;
  const firstStarted = new Promise((resolve) => {
    releaseFirst = resolve;
  });
  let unblockFirst;
  const firstBlocked = new Promise((resolve) => {
    unblockFirst = resolve;
  });

  const first = serializeMarkdownSave(path, async () => {
    events.push("first:start");
    releaseFirst();
    await firstBlocked;
    events.push("first:end");
  });
  await firstStarted;
  const second = serializeMarkdownSave(path, async () => {
    events.push("second:start");
    events.push("second:end");
  });

  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(events, ["first:start"]);
  unblockFirst();
  await Promise.all([first, second]);
  assert.deepEqual(events, ["first:start", "first:end", "second:start", "second:end"]);
});
