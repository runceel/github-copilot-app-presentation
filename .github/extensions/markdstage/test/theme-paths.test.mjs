import assert from "node:assert/strict";
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";
import test from "node:test";

import {
  resolveThemeFile,
  themeFileCandidates,
} from "../scripts/theme-paths.mjs";

async function withWorkspace(run) {
  const workspace = await mkdtemp(join(tmpdir(), "presentation-theme-paths-"));
  try {
    await run(workspace);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
}

test("prefers a Markdown-relative theme and falls back to the repository theme", async () => {
  await withWorkspace(async (workspace) => {
    const source = join(workspace, "decks", "quarterly", "slides.md");
    const localTheme = join(workspace, "decks", "quarterly", "themes", "brand", "theme.css");
    const sharedTheme = join(workspace, "themes", "brand", "theme.css");
    await mkdir(resolve(localTheme, ".."), { recursive: true });
    await mkdir(resolve(sharedTheme, ".."), { recursive: true });
    await writeFile(source, "# Deck");
    await writeFile(localTheme, "--bg: deck-local;");
    await writeFile(sharedTheme, "--bg: repository-shared;");

    assert.deepEqual(themeFileCandidates(workspace, source, "themes/brand/theme.css"), [
      resolve(localTheme),
      resolve(sharedTheme),
    ]);
    assert.equal(
      await readFile(
        await resolveThemeFile(workspace, source, "themes/brand/theme.css"),
        "utf8",
      ),
      "--bg: deck-local;",
    );

    await rm(localTheme);
    assert.equal(
      await readFile(
        await resolveThemeFile(workspace, source, "themes/brand/theme.css"),
        "utf8",
      ),
      "--bg: repository-shared;",
    );
    assert.equal(await resolveThemeFile(workspace, source, "themes/missing/theme.css"), null);
  });
});

test("deduplicates theme candidates for Markdown at the repository root", async () => {
  await withWorkspace(async (workspace) => {
    assert.deepEqual(
      themeFileCandidates(workspace, join(workspace, "slides.md"), "./themes/brand/theme.css"),
      [resolve(workspace, "themes", "brand", "theme.css")],
    );
  });
});

test("rejects theme sources and paths outside their search roots", async () => {
  await withWorkspace(async (workspace) => {
    assert.throws(
      () =>
        themeFileCandidates(
          workspace,
          join(workspace, "..", "slides.md"),
          "themes/brand/theme.css",
        ),
      (error) => error?.code === "theme_source_outside_workspace",
    );
    assert.throws(
      () => themeFileCandidates(workspace, "slides.md", "../theme.css"),
      (error) => error?.code === "invalid_theme_path",
    );
    assert.throws(
      () => themeFileCandidates(workspace, "slides.md", resolve(workspace, "theme.css")),
      (error) => error?.code === "invalid_theme_path",
    );
    assert.equal(isAbsolute(themeFileCandidates(workspace, "", "theme.css")[0]), true);
  });
});

test("rejects a Markdown-relative theme link that leaves the repository", async (context) => {
  await withWorkspace(async (workspace) => {
    const sourceDir = join(workspace, "deck");
    const sharedThemeDir = join(workspace, "themes");
    const outside = await mkdtemp(join(tmpdir(), "presentation-theme-outside-"));
    try {
      await mkdir(sourceDir, { recursive: true });
      await mkdir(sharedThemeDir, { recursive: true });
      await writeFile(join(sourceDir, "slides.md"), "# Deck");
      await writeFile(join(sharedThemeDir, "theme.css"), "--bg: repository-shared;");
      await writeFile(join(outside, "theme.css"), "--bg: outside;");
      try {
        await symlink(outside, join(sourceDir, "themes"), "junction");
      } catch (error) {
        context.skip(`junction creation is unavailable: ${error.code}`);
        return;
      }
      await assert.rejects(
        resolveThemeFile(workspace, join(sourceDir, "slides.md"), "themes/theme.css"),
        (error) => error?.code === "theme_file_outside_workspace",
      );
    } finally {
      await rm(outside, { recursive: true, force: true });
    }
  });
});
