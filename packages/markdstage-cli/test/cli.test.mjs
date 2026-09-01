// CLI-level behavior: help, unknown commands, exit codes, and JSON output.

import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { run } from "../src/cli.mjs";
import { EXIT_DECK, EXIT_ISSUES, EXIT_OK, EXIT_USAGE } from "../src/exit.mjs";

function capture() {
  const out = [];
  const err = [];
  return {
    out: (text) => out.push(text),
    err: (text) => err.push(text),
    stdout: () => out.join("\n"),
    stderr: () => err.join("\n"),
  };
}

async function withDeck(markdown, run_) {
  const dir = await mkdtemp(join(tmpdir(), "markdstage-cli-test-"));
  const file = join(dir, "slides.md");
  await writeFile(file, markdown, "utf8");
  try {
    return await run_({ dir, file });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

const VALID_DECK = [
  "---",
  "deck: Test deck",
  "layout: title",
  "---",
  "# Test deck",
  "",
  "---",
  "",
  "---",
  "page: 2",
  "total: 2",
  "---",
  "## Second slide",
  "",
  "- point",
  "",
].join("\n");

test("bare invocation prints usage", async () => {
  const io = capture();
  assert.equal(await run([], io), EXIT_OK);
  assert.match(io.stdout(), /Usage: markdstage <command>/);
  assert.match(io.stdout(), /Exit codes:/);
});

test("unknown commands and options fail with the usage exit code", async () => {
  const io = capture();
  assert.equal(await run(["bogus"], io), EXIT_USAGE);
  assert.match(io.stderr(), /Unknown command: bogus/);

  const io2 = capture();
  assert.equal(await run(["--bogus"], io2), EXIT_USAGE);
  assert.match(io2.stderr(), /Unknown option/);

  const io3 = capture();
  assert.equal(await run(["validate", "--bogus"], io3), EXIT_USAGE);
});

test("every command documents itself", async () => {
  for (const command of [
    "present",
    "validate",
    "inspect",
    "capture",
    "export",
    "guide",
    "skill",
  ]) {
    const io = capture();
    assert.equal(await run([command, "--help"], io), EXIT_OK);
    assert.match(io.stdout(), new RegExp(`Usage: markdstage ${command}`));
  }
});

test("validate reports a valid deck", async () => {
  await withDeck(VALID_DECK, async ({ file }) => {
    const io = capture();
    assert.equal(await run(["validate", file, "--json"], io), EXIT_OK);
    const report = JSON.parse(io.stdout());
    assert.equal(report.ok, true);
    assert.ok(report.total >= 2);
    assert.deepEqual(report.errors, []);
  });
});

test("validate reports a missing file with the deck exit code", async () => {
  const io = capture();
  const code = await run(["validate", join(tmpdir(), "markdstage-missing-deck.md"), "--json"], io);
  assert.equal(code, EXIT_DECK);
  const report = JSON.parse(io.stdout());
  assert.equal(report.ok, false);
  assert.ok(report.errors.length > 0);
});

test("validate reports invalid Architecture DSL", async () => {
  const deck = [
    "---",
    "deck: Broken",
    "---",
    "## Diagram",
    "",
    "```architecture",
    "{ not json",
    "```",
    "",
  ].join("\n");
  await withDeck(deck, async ({ file }) => {
    const io = capture();
    assert.equal(await run(["validate", file, "--json"], io), EXIT_DECK);
    const report = JSON.parse(io.stdout());
    assert.equal(report.ok, false);
    assert.equal(report.errors[0].page, 1);
  });
});

test("validate requires a file argument", async () => {
  const io = capture();
  assert.equal(await run(["validate"], io), EXIT_USAGE);
  assert.match(io.stderr(), /requires a Markdown file/);
});

test("guide prints canonical topics and rejects unknown ones", async () => {
  const io = capture();
  assert.equal(await run(["guide", "architecture-dsl"], io), EXIT_OK);
  assert.match(io.stdout(), /Architecture DSL/);

  const io2 = capture();
  assert.equal(await run(["guide", "nope"], io2), EXIT_USAGE);
  assert.match(io2.stderr(), /Unknown guide topic/);
});

test("skill check reports drift in an empty directory", async () => {
  const dir = await mkdtemp(join(tmpdir(), "markdstage-skill-test-"));
  try {
    const io = capture();
    assert.equal(await run(["skill", "check", "--root", dir], io), EXIT_ISSUES);
    assert.match(io.stdout(), /out of date/);

    const io2 = capture();
    assert.equal(await run(["skill", "install", "--root", dir], io2), EXIT_OK);

    const io3 = capture();
    assert.equal(await run(["skill", "check", "--root", dir], io3), EXIT_OK);
    assert.match(io3.stdout(), /up to date/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("--version prints the package version", async () => {
  const io = capture();
  assert.equal(await run(["--version"], io), EXIT_OK);
  assert.match(io.stdout(), /^\d+\.\d+\.\d+/);
});
