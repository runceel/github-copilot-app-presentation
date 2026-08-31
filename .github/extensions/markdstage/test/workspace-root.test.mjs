import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

import { listMarkdownFiles } from "../scripts/markdown-files.mjs";
import { resolveWorkspaceRoot } from "../scripts/workspace-root.mjs";

async function withTemporaryDirectory(run) {
  const directory = await mkdtemp(join(tmpdir(), "markdstage-workspace-root-"));
  try {
    await run(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

test("uses the Git root when the working directory is inside a repository", async () => {
  await withTemporaryDirectory(async (repository) => {
    const workingDirectory = join(repository, "decks", "quarterly");
    await mkdir(join(repository, ".git"));
    await mkdir(workingDirectory, { recursive: true });

    assert.equal(
      resolveWorkspaceRoot(workingDirectory, join(repository, "fallback")),
      resolve(repository),
    );
  });
});

test("uses the opened working directory outside Git", async () => {
  await withTemporaryDirectory(async (workingDirectory) => {
    const deckDirectory = join(workingDirectory, "decks");
    await mkdir(deckDirectory);
    await writeFile(join(deckDirectory, "slides.md"), "# Slides\n", "utf8");

    const workspaceRoot = resolveWorkspaceRoot(
      workingDirectory,
      join(workingDirectory, "fallback"),
    );
    assert.equal(workspaceRoot, resolve(workingDirectory));
    assert.deepEqual(await listMarkdownFiles(workspaceRoot), {
      files: ["decks/slides.md"],
      truncated: false,
    });
  });
});

test("uses the extension fallback when the working directory is unavailable", async () => {
  await withTemporaryDirectory(async (fallbackRoot) => {
    assert.equal(resolveWorkspaceRoot(undefined, fallbackRoot), resolve(fallbackRoot));
    assert.equal(
      resolveWorkspaceRoot(join(fallbackRoot, "missing"), fallbackRoot),
      resolve(fallbackRoot),
    );
  });
});
