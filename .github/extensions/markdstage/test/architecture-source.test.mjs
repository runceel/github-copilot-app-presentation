import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  readArchitectureSourceTarget,
  saveArchitectureSource,
} from "../runtime/architecture-source.mjs";

const INVALID = JSON.stringify({
  elements: [
    {
      type: "node", id: "a", x: 40, y: 40, width: 200, height: 120,
      label: "unsupported", subtitle: "unsupported",
    },
    { type: "node", id: "b", x: 400, y: 40, width: 200, height: 120 },
    { type: "connector", from: "a", to: "b", id: "unsupported", text: "unsupported" },
  ],
});
const markdown = (source) => `# Diagram\r\n\r\n\`\`\`architecture\r\n${source}\r\n\`\`\`\r\n`;

async function withSource(source, run) {
  const dir = await mkdtemp(join(process.cwd(), ".test-architecture-source-"));
  const file = join(dir, "slides.md");
  const content = markdown(source);
  await writeFile(file, content, "utf8");
  try {
    await run({ dir, file, content });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test("invalid source save propagates all diagnostics and leaves the file untouched", async () => {
  await withSource('{"elements":[]}', async ({ dir, file, content }) => {
    const before = await stat(file);
    const result = await saveArchitectureSource({
      workspaceRoot: dir,
      sourcePath: "slides.md",
      sourceFile: file,
      blockIndex: 0,
      source: INVALID,
      expectedMarkdown: content,
    });
    assert.equal(result.ok, false);
    assert.equal(result.error, "invalid_architecture");
    assert.equal(result.diagnostic.code, "unknown_field");
    assert.equal(result.diagnostic.pointer, "/elements/0/label");
    assert.equal(result.message, result.diagnostic.message);
    assert.equal(result.validation.valid, false);
    assert.equal(result.validation.diagnostics.length, 4);
    assert.equal(result.validation.model, undefined);
    assert.equal(await readFile(file, "utf8"), content);
    const after = await stat(file);
    assert.equal(after.mtimeMs, before.mtimeMs);
    assert.equal(after.ino, before.ino);
    assert.deepEqual(await readdir(dir), ["slides.md"]);
  });
});

test("invalid source reads preserve primary diagnostics and the canonical validation report", async () => {
  await withSource(INVALID, async ({ dir, file, content }) => {
    await assert.rejects(readArchitectureSourceTarget(dir, "slides.md", 0), (error) => {
      assert.equal(error.code, "invalid_architecture");
      assert.equal(error.diagnostic.code, "unknown_field");
      assert.equal(error.validation.diagnostics.length, 4);
      assert.equal(error.validation.valid, false);
      assert.equal(error.message, error.diagnostic.message);
      return true;
    });
    assert.equal(await readFile(file, "utf8"), content);
  });
});
