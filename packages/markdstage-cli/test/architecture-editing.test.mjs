import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { withDeckServer } from "../src/deck.mjs";

function architecture(id, text, x) {
  return JSON.stringify(
    {
      version: 1,
      elements: [
        {
          type: "node",
          id,
          x,
          y: 120,
          width: 240,
          height: 120,
          text,
        },
      ],
    },
    null,
    2,
  );
}

const FIRST = architecture("first", "First", 80);
const SECOND = architecture("second", "Second", 160);
const DECK = [
  "---",
  "deck: Architecture editing",
  "---",
  "# First slide",
  "",
  "```architecture",
  FIRST,
  "```",
  "",
  "---",
  "",
  "# Second slide",
  "",
  "```architecture",
  SECOND,
  "```",
  "",
].join("\n");

async function withWorkspace(run) {
  const dir = await mkdtemp(join(tmpdir(), "markdstage-cli-architecture-editing-"));
  const file = join(dir, "slides.md");
  await writeFile(file, DECK, { encoding: "utf8", mode: 0o640 });
  try {
    return await run({ dir, file });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function post(baseUrl, route, body) {
  return fetch(new URL(route, baseUrl), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: new URL(baseUrl).origin,
    },
    body: JSON.stringify(body),
  });
}

test("present without watch is read-only", async () => {
  await withWorkspace(async ({ dir, file }) => {
    await withDeckServer({ file, workspace: dir }, async (_session, server) => {
      const state = await (await fetch(new URL("state", server.url))).json();
      assert.equal(state.architectureEditAvailable, false);
      assert.equal(state.architectureEdit, false);
      assert.equal(state.architectureDetailedEdit, false);

      const mode = await post(server.url, "edit-mode", { enabled: true });
      assert.equal(mode.status, 501);
      assert.equal((await mode.json()).error, "not_supported");

      const edit = await post(server.url, "edit", {
        index: 0,
        block: 0,
        source: architecture("first", "Changed", 320),
        deckVersion: state.deckVersion,
      });
      assert.equal(edit.status, 501);
      const detailed = await post(server.url, "architecture-editor/open", {
        index: 0,
        block: 0,
      });
      assert.equal(detailed.status, 501);
      assert.equal(await readFile(file, "utf8"), DECK);
    });
  });
});

test("watch mode advertises editing but starts in viewing mode", async () => {
  await withWorkspace(async ({ dir, file }) => {
    await withDeckServer({ file, workspace: dir, watch: true }, async (_session, server) => {
      const state = await (await fetch(new URL("state", server.url))).json();
      assert.equal(state.sourceBacked, true);
      assert.equal(state.sourceModeAvailable, false);
      assert.equal(state.architectureEditAvailable, true);
      assert.equal(state.architectureEdit, false);
      assert.equal(state.architectureDetailedEdit, true);

      const mode = await post(server.url, "edit-mode", { enabled: true });
      assert.equal(mode.status, 200);
      assert.equal((await mode.json()).architectureEdit, true);
    });
  });
});

test("watch-mode placement edits atomically update only the selected block", async () => {
  await withWorkspace(async ({ dir, file }) => {
    await withDeckServer({ file, workspace: dir, watch: true }, async (session, server) => {
      session.navigate(1);
      const before = await stat(file);
      const state = await (await fetch(new URL("state", server.url))).json();
      assert.equal((await post(server.url, "edit-mode", { enabled: true })).status, 200);

      const edited = architecture("second", "Second edited", 360);
      const response = await post(server.url, "edit", {
        index: 1,
        block: 0,
        source: edited,
        deckVersion: state.deckVersion,
      });
      assert.equal(response.status, 200);
      const result = await response.json();
      assert.equal(result.ok, true);
      assert.equal(result.fileSaved, true);
      assert.equal(session.index, 1);

      const markdown = await readFile(file, "utf8");
      assert.ok(markdown.includes(FIRST));
      assert.ok(markdown.includes(edited));
      assert.equal(markdown.includes(SECOND), false);
      const after = await stat(file);
      assert.equal(after.mode & 0o777, before.mode & 0o777);
      if (process.platform !== "win32") assert.notEqual(after.ino, before.ino);
      assert.deepEqual(
        (await readdir(dir)).filter((name) => name.endsWith(".tmp")),
        [],
      );
    });
  });
});

test("watch-mode placement edits reject stale source writes", async () => {
  await withWorkspace(async ({ dir, file }) => {
    await withDeckServer({ file, workspace: dir, watch: true }, async (_session, server) => {
      const state = await (await fetch(new URL("state", server.url))).json();
      assert.equal((await post(server.url, "edit-mode", { enabled: true })).status, 200);
      const external = `${DECK}\n<!-- external edit -->\n`;
      await writeFile(file, external, "utf8");

      const response = await post(server.url, "edit", {
        index: 0,
        block: 0,
        source: architecture("first", "Stale editor", 420),
        deckVersion: state.deckVersion,
      });
      assert.equal(response.status, 409);
      assert.equal((await response.json()).error, "source_changed");
      assert.equal(await readFile(file, "utf8"), external);
    });
  });
});

test("watch mode opens the detailed editor and reloads its successful save", async () => {
  await withWorkspace(async ({ dir, file }) => {
    await withDeckServer({ file, workspace: dir, watch: true }, async (session, server) => {
      session.navigate(1);
      const opened = await post(server.url, "architecture-editor/open", {
        index: 1,
        block: 0,
      });
      assert.equal(opened.status, 200);
      const { url } = await opened.json();
      assert.match(url, /^http:\/\/127\.0\.0\.1:\d+\/[A-Za-z0-9_-]{16,}\/$/);
      const shell = await fetch(url);
      assert.equal(shell.status, 200);
      assert.match(await shell.text(), /<title>Architecture Editor<\/title>/);
      const script = await fetch(new URL("editor/editor.js", url));
      assert.equal(script.status, 200);

      const editorState = await (await fetch(new URL("state", url))).json();
      assert.equal(editorState.sourcePath, "slides.md");
      assert.equal(editorState.blockIndex, 1);
      assert.equal(editorState.source, SECOND);

      const edited = architecture("second", "Detailed edit", 480);
      const draft = await post(url, "draft", {
        source: edited,
        revision: 1,
        generation: editorState.generation,
      });
      assert.equal(draft.status, 200);
      const saved = await post(url, "save", {
        revision: 1,
        generation: editorState.generation,
      });
      assert.equal(saved.status, 200);
      assert.equal((await saved.json()).ok, true);
      assert.ok((await readFile(file, "utf8")).includes(edited));
      assert.equal(session.index, 1);
      assert.ok(session.slides[1].includes(edited));
    });
  });
});

test("concurrent detailed-editor opens reuse one server", async () => {
  await withWorkspace(async ({ dir, file }) => {
    await withDeckServer({ file, workspace: dir, watch: true }, async (_session, server) => {
      const responses = await Promise.all(
        Array.from({ length: 4 }, () =>
          post(server.url, "architecture-editor/open", {
            index: 0,
            block: 0,
          }),
        ),
      );
      assert.deepEqual(
        responses.map((response) => response.status),
        [200, 200, 200, 200],
      );
      const urls = await Promise.all(responses.map((response) => response.json().then((x) => x.url)));
      assert.equal(new Set(urls).size, 1);
    });
  });
});

test("the detailed editor rejects a save after an external source change", async () => {
  await withWorkspace(async ({ dir, file }) => {
    await withDeckServer({ file, workspace: dir, watch: true }, async (_session, server) => {
      const opened = await post(server.url, "architecture-editor/open", {
        index: 0,
        block: 0,
      });
      const { url } = await opened.json();
      const editorState = await (await fetch(new URL("state", url))).json();
      const draft = await post(url, "draft", {
        source: architecture("first", "Detailed stale edit", 520),
        revision: 1,
        generation: editorState.generation,
      });
      assert.equal(draft.status, 200);

      const external = `${DECK}\n<!-- changed outside the editor -->\n`;
      await writeFile(file, external, "utf8");
      const saved = await post(url, "save", {
        revision: 1,
        generation: editorState.generation,
      });
      assert.equal(saved.status, 409);
      assert.equal((await saved.json()).error, "source_changed");
      assert.equal(await readFile(file, "utf8"), external);

      const protectedReload = await post(url, "reload", { discard: false });
      assert.equal(protectedReload.status, 409);
      assert.equal((await protectedReload.json()).error, "unsaved_changes");

      const reloaded = await post(url, "reload", { discard: true });
      assert.equal(reloaded.status, 200);
      const reloadedState = await (await fetch(new URL("state", url))).json();
      assert.equal(reloadedState.dirty, false);
      assert.equal(reloadedState.source, FIRST);
      assert.ok(reloadedState.generation > editorState.generation);

      const recovered = architecture("first", "Recovered edit", 560);
      assert.equal(
        (
          await post(url, "draft", {
            source: recovered,
            revision: 1,
            generation: reloadedState.generation,
          })
        ).status,
        200,
      );
      assert.equal(
        (
          await post(url, "save", {
            revision: 1,
            generation: reloadedState.generation,
          })
        ).status,
        200,
      );
      const markdown = await readFile(file, "utf8");
      assert.ok(markdown.includes(recovered));
      assert.ok(markdown.includes("<!-- changed outside the editor -->"));
    });
  });
});
