import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { atomicReplaceMarkdown } from "../scripts/atomic-markdown-replace.mjs";
import { createMarkdownWatcher } from "../scripts/markdown-watcher.mjs";

async function waitFor(predicate, timeoutMs = 2_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  assert.fail("timed out waiting for Markdown watcher");
}

test("watches only the selected Markdown and follows atomic replacement", async () => {
  const root = await mkdtemp(join(tmpdir(), "presentation-markdown-watch-"));
  const source = join(root, "slides.md");
  const sibling = join(root, "notes.md");
  await writeFile(source, "# First\n", "utf8");
  await writeFile(sibling, "# Notes\n", "utf8");

  const observed = [];
  const watcher = createMarkdownWatcher({
    path: source,
    debounceMs: 20,
    onChange: async () => observed.push(await readFile(source, "utf8")),
  });
  try {
    await writeFile(sibling, "# Unrelated\n", "utf8");
    await new Promise((resolve) => setTimeout(resolve, 100));
    assert.deepEqual(observed, []);

    await writeFile(source, "# Direct\n", "utf8");
    await waitFor(() => observed.includes("# Direct\n"));

    const expectedMarkdown = await readFile(source, "utf8");
    const mode = (await stat(source)).mode;
    await atomicReplaceMarkdown({
      path: source,
      markdown: "# Atomic\n",
      expectedMarkdown,
      mode,
      revalidate: async () => {},
    });
    await waitFor(() => observed.includes("# Atomic\n"));

    watcher.close();
    const count = observed.length;
    await writeFile(source, "# Closed\n", "utf8");
    await new Promise((resolve) => setTimeout(resolve, 100));
    assert.equal(observed.length, count);
  } finally {
    watcher.close();
    await rm(root, { recursive: true, force: true });
  }
});
