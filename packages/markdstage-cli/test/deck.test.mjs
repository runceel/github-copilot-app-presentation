// Deck lifecycle, page parsing, and presentation-server security.

import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { request as httpRequest } from "node:http";

import { parsePageList, withDeckServer } from "../src/deck.mjs";
import { createDeckSession, MarkdStageError } from "../src/runtime.mjs";

const DECK = [
  "---",
  "deck: Server test",
  "---",
  "# One",
  "",
  "---",
  "",
  "---",
  "---",
  "## Two",
  "",
].join("\n");

async function withWorkspace(run) {
  const dir = await mkdtemp(join(tmpdir(), "markdstage-deck-test-"));
  const file = join(dir, "slides.md");
  await writeFile(file, DECK, "utf8");
  try {
    return await run({ dir, file });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test("parsePageList understands lists and ranges", () => {
  assert.deepEqual(parsePageList("2,4"), [1, 3]);
  assert.deepEqual(parsePageList("2-4"), [1, 2, 3]);
  assert.deepEqual(parsePageList("3, 1 , 3"), [0, 2]);
  assert.throws(() => parsePageList("0"), RangeError);
  assert.throws(() => parsePageList("a"), RangeError);
  assert.throws(() => parsePageList("4-2"), RangeError);
  assert.throws(() => parsePageList(""), RangeError);
  assert.throws(() => parsePageList("9", { total: 3 }), RangeError);
});

test("createDeckSession confines the deck to the workspace", async () => {
  await withWorkspace(async ({ dir }) => {
    await assert.rejects(
      createDeckSession({ file: join(dir, "..", "outside.md"), workspaceRoot: dir }),
      (error) => error instanceof MarkdStageError,
    );
  });
});

test("the presentation server serves the deck only below its token", async () => {
  await withWorkspace(async ({ dir, file }) => {
    await withDeckServer({ file, workspace: dir }, async (session, server) => {
      assert.ok(session.slides.length >= 2);
      assert.match(server.url, /^http:\/\/127\.0\.0\.1:\d+\/[A-Za-z0-9_-]{16,}\/$/);

      const shell = await fetch(server.url);
      assert.equal(shell.status, 200);
      assert.match(shell.headers.get("content-type") ?? "", /text\/html/);

      const state = await fetch(new URL("state", server.url));
      assert.equal(state.status, 200);
      assert.equal(state.headers.get("cache-control"), "no-store");
      const payload = await state.json();
      assert.equal(payload.total, session.slides.length);

      // Without the per-process token nothing is reachable.
      const untokenized = await fetch(new URL("/state", server.url));
      assert.equal(untokenized.status, 404);

      // A wrong token is rejected as well.
      const wrongToken = await fetch(new URL("/not-the-token/state", server.url));
      assert.equal(wrongToken.status, 404);
    });
  });
});

test("mutating routes require a same-origin request", async () => {
  await withWorkspace(async ({ dir, file }) => {
    await withDeckServer({ file, workspace: dir }, async (session, server) => {
      const foreign = await fetch(new URL("navigate", server.url), {
        method: "POST",
        headers: { "content-type": "application/json", origin: "https://evil.example" },
        body: JSON.stringify({ delta: 1 }),
      });
      assert.equal(foreign.status, 403);
      assert.equal(session.index, 0);

      const allowed = await fetch(new URL("navigate", server.url), {
        method: "POST",
        headers: { "content-type": "application/json", origin: new URL(server.url).origin },
        body: JSON.stringify({ delta: 1 }),
      });
      assert.equal(allowed.status, 200);
      assert.equal(session.index, 1);
    });
  });
});

test("requests with a foreign Host header are rejected", async () => {
  await withWorkspace(async ({ dir, file }) => {
    await withDeckServer({ file, workspace: dir }, async (_session, server) => {
      const url = new URL(server.url);
      const status = await new Promise((resolve, reject) => {
        const request = httpRequest(
          {
            host: "127.0.0.1",
            port: url.port,
            path: url.pathname,
            headers: { Host: "markdstage.example" },
          },
          (response) => {
            response.resume();
            resolve(response.statusCode);
          },
        );
        request.on("error", reject);
        request.end();
      });
      assert.equal(status, 403);
      assert.equal((await fetch(url)).status, 200);
    });
  });
});

test("watching reloads the deck and preserves the current slide", async () => {
  await withWorkspace(async ({ dir, file }) => {
    const session = await createDeckSession({ file, workspaceRoot: dir });
    await session.load();
    session.index = 1;
    await writeFile(file, `${DECK}\n---\n\n---\n### Three\n`, "utf8");
    await session.load({ preserveIndex: true });
    assert.equal(session.index, 1);
    assert.ok(session.slides.length >= 3);
  });
});
