import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { run } from "../src/cli.mjs";
import { withDeckServer } from "../src/deck.mjs";
import {
  architectureValidationErrors,
  architectureValidationReport,
  createArchitectureValidationTool,
  sharedPath,
  validateArchitectureInput,
} from "../src/runtime.mjs";
import { EXIT_DECK, EXIT_OK } from "../src/exit.mjs";

const sourceWithFourErrors = JSON.stringify({
  elements: [
    {
      type: "node", id: "a", x: 40, y: 40, width: 200, height: 120,
      label: "unsupported", subtitle: "unsupported",
    },
    { type: "node", id: "b", x: 400, y: 40, width: 200, height: 120 },
    { type: "connector", from: "a", to: "b", id: "unsupported", text: "unsupported" },
  ],
});
const fragment = (source) => `\`\`\`architecture\n${source}\n\`\`\``;
const deck = (body) => `---\ndeck: Validation\nlayout: title\n---\n# Validation\n\n${body}\n`;

async function withFile(markdown, runTest) {
  const dir = await mkdtemp(join(process.cwd(), ".test-cli-validation-"));
  const file = join(dir, "slides.md");
  await writeFile(file, markdown, "utf8");
  try {
    await runTest({ dir, file });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function invoke(args) {
  const output = [];
  const errors = [];
  const code = await run(args, {
    out: (text) => output.push(text),
    err: (text) => errors.push(text),
  });
  return { code, stdout: output.join("\n"), stderr: errors.join("\n") };
}

test("CLI validation preserves one legacy error and exposes all four canonical diagnostics", async () => {
  await withFile(deck(fragment(sourceWithFourErrors)), async ({ dir, file }) => {
    const result = await invoke(["validate", file, "--workspace", dir, "--json"]);
    assert.equal(result.code, EXIT_DECK);
    const report = JSON.parse(result.stdout);
    assert.equal(report.ok, false);
    assert.equal(report.valid, false);
    assert.equal(report.truncated, false);
    assert.equal(report.errors.length, 1);
    assert.equal(report.errors[0].code, "invalid_architecture");
    assert.equal(report.errors[0].architecture, 1);
    assert.equal(report.errors[0].message, report.diagnostics[0].message);
    assert.equal(report.diagnosticCount, 4);
    assert.deepEqual(report.diagnostics.map((item) => item.pointer), [
      "/elements/0/label", "/elements/0/subtitle", "/elements/2/id", "/elements/2/text",
    ]);
    for (const diagnostic of report.diagnostics) {
      assert.equal(diagnostic.code, "unknown_field");
      assert.equal(diagnostic.category, "structure");
      assert.equal(diagnostic.severity, "error");
      assert.equal(diagnostic.page, 1);
      assert.equal(diagnostic.blockIndex, 0);
      assert.ok(Array.isArray(diagnostic.suggestions));
    }
  });
});

test("CLI diagnostics continue after invalid JSON and report later valid blocks", async () => {
  await withFile(deck([
    fragment("{"), fragment('{"elements":[]}'), fragment(sourceWithFourErrors),
  ].join("\n")), async ({ dir, file }) => {
    const result = await invoke(["validate", file, "--workspace", dir, "--json"]);
    const report = JSON.parse(result.stdout);
    assert.equal(result.code, EXIT_DECK);
    assert.equal(report.errors.length, 2);
    assert.equal(report.diagnosticCount, 5);
    assert.equal(report.blocks[0].stages.json, "failed");
    assert.equal(report.blocks[1].valid, true);
    assert.equal(report.blocks[2].diagnosticCount, 4);
    assert.equal(report.complete, false);
  });
});

test("CLI valid decks report complete validation and no canonical errors", async () => {
  await withFile(deck(fragment('{"elements":[]}')), async ({ dir, file }) => {
    const result = await invoke(["validate", file, "--workspace", dir, "--json"]);
    const report = JSON.parse(result.stdout);
    assert.equal(result.code, EXIT_OK);
    assert.equal(report.valid, true);
    assert.equal(report.complete, true);
    assert.equal(report.truncated, false);
    assert.deepEqual(report.diagnostics, []);
    assert.deepEqual(report.errors, []);
  });
});

test("CLI compatibility diagnostics remain nonblocking and do not become legacy errors", async () => {
  await withFile(deck(fragment('{"$schema":42,"elements":[]}')), async ({ dir, file }) => {
    const result = await invoke(["validate", file, "--workspace", dir, "--json"]);
    const report = JSON.parse(result.stdout);
    assert.equal(result.code, EXIT_OK);
    assert.equal(report.ok, true);
    assert.equal(report.valid, true);
    assert.equal(report.complete, true);
    assert.deepEqual(report.errors, []);
    assert.equal(report.diagnostics[0].code, "schema_compatibility");
    assert.equal(report.diagnostics[0].severity, "warning");
  });
});

test("CLI inspection cutoffs cannot produce an OK result or a successful exit", async () => {
  const manyBlocks = Array(201).fill(fragment('{"elements":[]}')).join("\n");
  await withFile(deck(manyBlocks), async ({ dir, file }) => {
    const result = await invoke(["validate", file, "--workspace", dir, "--json"]);
    const report = JSON.parse(result.stdout);
    assert.equal(result.code, EXIT_DECK);
    assert.equal(report.ok, false);
    assert.equal(report.complete, false);
    assert.equal(report.truncated, true);
    assert.equal(report.errors.at(-1).code, "validation_incomplete");
    const terminal = await invoke(["validate", file, "--workspace", dir]);
    assert.equal(terminal.code, EXIT_DECK);
    assert.doesNotMatch(terminal.stdout, /OK: the deck is valid/);
    assert.match(terminal.stdout, /Validation incomplete/);
  });
});

test("CLI runtime inspection cutoffs identify maxElements rather than maxDiagnostics", async () => {
  const elements = Array.from({ length: 201 }, (_, index) => ({
    type: "node", id: `n${index}`, x: 40, y: 40, width: 200, height: 120,
  }));
  await withFile(deck(fragment(JSON.stringify({ elements }))), async ({ dir, file }) => {
    const result = await invoke(["validate", file, "--workspace", dir, "--json"]);
    const report = JSON.parse(result.stdout);
    assert.equal(result.code, EXIT_DECK);
    assert.equal(report.complete, false);
    assert.equal(report.truncated, true);
    assert.deepEqual(report.budget.limitsReached, ["maxElements"]);
    assert.equal(report.limits.maxElements, 200);
    assert.equal(report.errors[0].code, "invalid_architecture");
    assert.equal(report.errors.at(-1).code, "validation_incomplete");
    assert.match(report.errors.at(-1).message, /maxElements/);
    assert.doesNotMatch(report.errors.at(-1).message, /maxDiagnostics/);
  });
});

test("presentation renderer serves the new Architecture module imports as JavaScript", async () => {
  await withFile(deck(fragment('{"elements":[]}')), async ({ dir, file }) => {
    await withDeckServer({ file, workspace: dir }, async (_session, server) => {
      for (const name of [
        "architecture.mjs", "architecture-contract.mjs", "architecture-diagnostics.mjs",
      ]) {
        const response = await fetch(new URL(`renderer/${name}`, server.url));
        assert.equal(response.status, 200, name);
        assert.match(response.headers.get("content-type"), /^text\/javascript/);
        assert.equal(response.headers.get("cache-control"), "no-store");
        assert.equal(await response.text(), await readFile(sharedPath("renderer", name), "utf8"));
      }
    });
  });
});

test("the exact registered pure handler leaves a live deck server and source file unchanged", async () => {
  const original = deck(`${fragment('{"elements":[]}')}\n\n---\n\n# Second slide`);
  await withFile(original, async ({ dir, file }) => {
    await withDeckServer({ file, workspace: dir }, async (session, server) => {
      session.navigate(1);
      const stateUrl = new URL("state", server.url);
      const beforeHttp = await (await fetch(stateUrl)).json();
      const snapshot = () => ({
        slides: [...session.slides],
        index: session.index,
        markdown: session.markdown,
        sourceMarkdown: session.sourceMarkdown,
        sourceName: session.sourceName,
        mode: session.mode,
        version: session.version,
        deckVersion: session.deckVersion,
        theme: session.theme,
      });
      const beforeDeck = snapshot();
      const beforeFile = await stat(file);
      const tool = createArchitectureValidationTool();
      const result = await tool.handler({
        format: "slides",
        slides: Object.freeze([fragment(sourceWithFourErrors)]),
      });
      assert.equal(result.resultType, "success");
      assert.equal(JSON.parse(result.textResultForLlm).diagnosticCount, 4);
      assert.deepEqual(snapshot(), beforeDeck);
      assert.deepEqual(await (await fetch(stateUrl)).json(), beforeHttp);
      assert.equal(await readFile(file, "utf8"), original);
      const afterFile = await stat(file);
      assert.equal(afterFile.mtimeMs, beforeFile.mtimeMs);
      assert.equal(afterFile.ino, beforeFile.ino);
      assert.deepEqual(await readdir(dir), ["slides.md"]);

      const existing = architectureValidationReport(session.slides);
      assert.deepEqual(architectureValidationErrors(session.slides, { validation: existing }), []);
      assert.equal(validateArchitectureInput({ format: "dsl", source: '{"elements":[]}' }).valid, true);
    });
  });
});
