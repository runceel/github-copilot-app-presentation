import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  ARCHITECTURE_VALIDATION_LIMITS,
  ArchitectureValidationInputError,
  createArchitectureValidationTool,
  validateArchitectureInput,
} from "../architecture-validation.mjs";

const EMPTY = '{"elements":[]}';
const fence = (source) => `\`\`\`architecture\n${source}\n\`\`\``;
const fourErrors = () => JSON.stringify({
  elements: [
    {
      type: "node", id: "a", x: 40, y: 40, width: 200, height: 120,
      text: "API", label: "not node text", subtitle: "unsupported",
    },
    { type: "node", id: "b", x: 400, y: 40, width: 200, height: 120, text: "Database" },
    { type: "connector", from: "a", to: "b", id: "unsupported", text: "not a label" },
  ],
});

test("unloaded DSL returns a compact canonical report without invented slide positions", () => {
  const report = validateArchitectureInput({ format: "dsl", source: EMPTY });
  assert.equal(report.ok, true);
  assert.equal(report.format, "dsl");
  assert.equal(report.scope, "dsl");
  assert.equal(report.valid, true);
  assert.equal(report.complete, true);
  assert.equal(report.truncated, false);
  assert.deepEqual(report.stages, {
    json: "passed", structure: "passed", semantic: "passed", layout: "passed",
  });
  assert.deepEqual(report.diagnostics, []);
  assert.equal(report.blocks.length, 1);
  assert.equal(report.blocks[0].dslValid, true);
  assert.equal(report.blocks[0].slideIndex, undefined);
  assert.equal(report.blocks[0].page, undefined);
  assert.equal(report.model, undefined);
  assert.equal(report.blocks[0].model, undefined);
  assert.equal(report.blocks[0].source, undefined);
  assert.equal(report.limits.maxDiagnostics, 50);
});

test("nonblocking compatibility warnings preserve valid and complete reports", () => {
  const report = validateArchitectureInput({
    format: "dsl", source: '{"$schema":42,"elements":[]}',
  });
  assert.equal(report.valid, true);
  assert.equal(report.complete, true);
  assert.equal(report.truncated, false);
  assert.equal(report.diagnosticCount, 1);
  assert.equal(report.diagnostics[0].code, "schema_compatibility");
  assert.equal(report.diagnostics[0].severity, "warning");
  assert.equal(report.diagnostics[0].occurrences, 1);
  assert.ok(report.diagnostics[0].relatedPointers.includes("/$schema"));
});

test("explicit slides collect four independent errors in one block", () => {
  const report = validateArchitectureInput({ format: "slides", slides: [fence(fourErrors())] });
  assert.equal(report.ok, true);
  assert.equal(report.valid, false);
  assert.equal(report.diagnosticCount, 4);
  assert.equal(report.blocks.length, 1);
  assert.equal(report.blocks[0].diagnosticCount, 4);
  assert.deepEqual(report.diagnostics.map(({ code, pointer }) => ({ code, pointer })), [
    { code: "unknown_field", pointer: "/elements/0/label" },
    { code: "unknown_field", pointer: "/elements/0/subtitle" },
    { code: "unknown_field", pointer: "/elements/2/id" },
    { code: "unknown_field", pointer: "/elements/2/text" },
  ]);
  for (const diagnostic of report.diagnostics) {
    assert.equal(diagnostic.category, "structure");
    assert.equal(diagnostic.severity, "error");
    assert.equal(diagnostic.slideIndex, 0);
    assert.equal(diagnostic.page, 1);
    assert.equal(diagnostic.blockIndex, 0);
    assert.equal(diagnostic.architecture, 1);
    assert.ok(Array.isArray(diagnostic.suggestions));
  }
});

test("JSON failure does not prevent later blocks or slides from being inspected", () => {
  const report = validateArchitectureInput({
    format: "slides",
    slides: [`${fence("{")}\n${fence(EMPTY)}`, `---\npage: 99\n---\n${fence(fourErrors())}`],
  });
  assert.equal(report.blocks.length, 3);
  assert.equal(report.blocks[0].stages.json, "failed");
  assert.equal(report.blocks[0].stages.structure, "skipped");
  assert.equal(report.blocks[1].valid, true);
  assert.equal(report.blocks[2].page, 2);
  assert.equal(report.diagnosticCount, 5);
  assert.equal(report.complete, false);
  assert.equal(report.truncated, false);
  assert.equal(report.diagnostics.at(-1).page, 2);
});

test("enclosing non-Architecture fences are ignored by the shared Markdown scanner", () => {
  const slide = [
    "````text",
    "```architecture",
    "{ invalid example",
    "```",
    "````",
    fence(EMPTY),
  ].join("\n");
  const report = validateArchitectureInput({ format: "slides", slides: [slide] });
  assert.equal(report.valid, true);
  assert.equal(report.blocks.length, 1);
  assert.equal(report.blocks[0].openLine, 6);
  assert.equal(report.blocks[0].blockIndex, 0);
});

test("closed and unclosed fences retain exact slide, block, and CRLF line positions", () => {
  const slide = [
    "# Diagram", "~~~architecture", EMPTY, "~~~", "",
    "````architecture", EMPTY,
  ].join("\r\n");
  const report = validateArchitectureInput({ format: "slides", slides: ["# Intro", slide] });
  const [closed, unclosed] = report.blocks;
  assert.equal(closed.openLine, 2);
  assert.equal(closed.closeLine, 4);
  assert.equal(closed.closed, true);
  assert.equal(unclosed.openLine, 6);
  assert.equal(unclosed.closeLine, null);
  assert.equal(unclosed.endLine, 7);
  assert.equal(unclosed.closed, false);
  assert.equal(unclosed.dslValid, true);
  assert.equal(unclosed.valid, false);
  assert.equal(report.valid, false);
  assert.equal(report.complete, true);
  assert.equal(report.diagnosticCount, 1);
  const diagnostic = report.diagnostics[0];
  assert.equal(diagnostic.code, "unclosed_architecture_fence");
  assert.equal(diagnostic.slideIndex, 1);
  assert.equal(diagnostic.page, 2);
  assert.equal(diagnostic.blockIndex, 1);
  assert.equal(diagnostic.architecture, 2);
});

test("diagnostic pointers escape slash and tilde according to RFC 6901", () => {
  const report = validateArchitectureInput({
    format: "dsl",
    source: '{"elements":[],"a/b~c":true}',
  });
  assert.equal(report.diagnostics[0].pointer, "/a~1b~0c");
});

test("API input is explicit and rejects ambiguous fields, malformed fragments, and caps", () => {
  const invalid = [
    undefined, null, [], {}, { source: EMPTY }, { format: "markdown", source: EMPTY },
    Object.assign(Object.create({ format: "dsl" }), { source: EMPTY }),
    { format: "dsl" }, { format: "dsl", source: 12 },
    { format: "dsl", source: EMPTY, slides: [] },
    { format: "slides", slides: [] },
    { format: "slides", slides: ["ok", null] },
    { format: "slides", slides: ["ok"], source: EMPTY },
    { format: "slides", slides: "not an array" },
    { format: "dsl", source: EMPTY, path: "slides.md" },
    ...[0, 101, 1.5, "2", null, undefined].map((maxDiagnostics) => ({
      format: "dsl", source: EMPTY, maxDiagnostics,
    })),
  ];
  for (const input of invalid) {
    assert.throws(() => validateArchitectureInput(input), ArchitectureValidationInputError);
  }
  assert.equal(validateArchitectureInput({ format: "dsl", source: "" }).ok, true);
});

test("the diagnostic cap is shared across a deck and records skipped blocks and stages", () => {
  const report = validateArchitectureInput({
    format: "slides",
    slides: [`${fence(fourErrors())}\n${fence(EMPTY)}`, fence(EMPTY)],
    maxDiagnostics: 2,
  });
  assert.equal(report.diagnosticCount, 2);
  assert.equal(report.blocks.length, 1);
  assert.equal(report.complete, false);
  assert.equal(report.valid, false);
  assert.equal(report.truncated, true);
  assert.ok(report.budget.limitsReached.includes("maxDiagnostics"));
  assert.ok(report.skipped.some((item) => item.blockIndex === 1 && item.blockCount === 1));
  assert.ok(report.skipped.some((item) => item.slideIndex === 1 && item.slideCount === 1));
  for (const skipped of report.skipped) {
    assert.deepEqual(Object.values(skipped.stages), ["skipped", "skipped", "skipped", "skipped"]);
  }
});

test("hitting the cap exactly on the last fully checked block does not imply truncation", () => {
  const report = validateArchitectureInput({
    format: "slides", slides: [fence(fourErrors())], maxDiagnostics: 4,
  });
  assert.equal(report.diagnosticCount, 4);
  assert.equal(report.truncated, false);
});

test("an omitted unclosed-fence diagnostic still makes a capped check incomplete", () => {
  const report = validateArchitectureInput({
    format: "slides", slides: ["```architecture\n{"], maxDiagnostics: 1,
  });
  assert.equal(report.diagnosticCount, 1);
  assert.equal(report.truncated, true);
  assert.equal(report.complete, false);
  assert.equal(report.blocks[0].closed, false);
  assert.deepEqual(report.blocks[0].truncationReasons, ["maxDiagnostics"]);
  assert.deepEqual(report.budget.limitsReached, ["maxDiagnostics"]);
});

test("runtime element caps retain the actual reason and limit instead of maxDiagnostics", () => {
  const elements = Array.from({ length: 201 }, (_, index) => ({
    type: "node", id: `n${index}`, x: 40, y: 40, width: 200, height: 120,
  }));
  const report = validateArchitectureInput({ format: "dsl", source: JSON.stringify({ elements }) });
  assert.equal(report.valid, false);
  assert.equal(report.complete, false);
  assert.equal(report.truncated, true);
  assert.equal(report.diagnostics[0].code, "element_limit");
  assert.deepEqual(report.budget.limitsReached, ["maxElements"]);
  assert.deepEqual(report.blocks[0].truncationReasons, ["maxElements"]);
  assert.equal(report.limits.maxElements, 200);
  assert.equal(report.limits.maxDiagnostics, 50);
  const warning = report.diagnostics.find((item) => item.code === "validation_budget_exceeded");
  assert.match(warning.message, /maxElements inspection limit \(200\)/);
  assert.doesNotMatch(warning.message, /maxDiagnostics/);
});

test("runtime depth caps retain the actual reason and limit instead of maxDiagnostics", () => {
  let nested = { type: "node", id: "leaf", x: 0, y: 0, width: 100, height: 50 };
  for (let index = 0; index < 6; index += 1) {
    nested = {
      type: "group", id: `g${index}`, x: 0, y: 0, width: 500, height: 300, children: [nested],
    };
  }
  const report = validateArchitectureInput({
    format: "slides", slides: [fence(JSON.stringify({ elements: [nested] }))],
  });
  assert.equal(report.valid, false);
  assert.equal(report.complete, false);
  assert.equal(report.truncated, true);
  assert.equal(report.diagnostics[0].code, "nesting_limit");
  assert.deepEqual(report.budget.limitsReached, ["maxDepth"]);
  assert.deepEqual(report.blocks[0].truncationReasons, ["maxDepth"]);
  assert.equal(report.limits.maxDepth, 4);
  const warning = report.diagnostics.find((item) => item.code === "validation_budget_exceeded");
  assert.match(warning.message, /maxDepth inspection limit \(4\)/);
  assert.doesNotMatch(warning.message, /maxDiagnostics/);
  assert.equal(warning.page, 1);
  assert.equal(warning.architecture, 1);
});

test("declared source and slide inspection limits never claim unchecked content is valid", () => {
  const oversized = " ".repeat(ARCHITECTURE_VALIDATION_LIMITS.maxSourceChars + 1);
  const dsl = validateArchitectureInput({ format: "dsl", source: oversized });
  assert.equal(dsl.valid, false);
  assert.equal(dsl.complete, false);
  assert.equal(dsl.truncated, true);
  assert.equal(dsl.budget.processedBlocks, 0);
  assert.equal(dsl.skipped[0].reason, "maxSourceChars");
  const slides = validateArchitectureInput({
    format: "slides", slides: [oversized, fence(EMPTY)],
  });
  assert.equal(slides.valid, false);
  assert.equal(slides.complete, false);
  assert.equal(slides.truncated, true);
  assert.equal(slides.blocks[0].page, 2);
  assert.equal(slides.budget.skippedSlides, 1);
  assert.equal(slides.budget.skippedBlocks, null);
});

test("budget and unclosed-fence suggestions use the canonical nonautomatic object shape", () => {
  const reports = [
    validateArchitectureInput({
      format: "dsl",
      source: " ".repeat(ARCHITECTURE_VALIDATION_LIMITS.maxSourceChars + 1),
    }),
    validateArchitectureInput({ format: "slides", slides: [`\`\`\`architecture\n${EMPTY}`] }),
  ];
  for (const report of reports) {
    const diagnostic = report.diagnostics[0];
    assert.ok(diagnostic.suggestions.length);
    for (const suggestion of diagnostic.suggestions) {
      assert.deepEqual(Object.keys(suggestion).sort(), ["action", "automatic", "message"]);
      assert.equal(suggestion.action, "review");
      assert.equal(suggestion.automatic, false);
      assert.equal(typeof suggestion.message, "string");
    }
  }
});

test("declared block and slide processing limits are deck-wide", () => {
  const blockCount = ARCHITECTURE_VALIDATION_LIMITS.maxBlocks;
  const blocks = validateArchitectureInput({
    format: "slides", slides: [Array(blockCount + 1).fill(fence(EMPTY)).join("\n")],
  });
  assert.equal(blocks.blocks.length, blockCount);
  assert.equal(blocks.budget.skippedBlocks, 1);
  assert.equal(blocks.skipped[0].architecture, blockCount + 1);
  assert.equal(blocks.complete, false);
  assert.equal(blocks.truncated, true);
  const slides = validateArchitectureInput({
    format: "slides", slides: Array(ARCHITECTURE_VALIDATION_LIMITS.maxSlides + 1).fill("# No diagram"),
  });
  assert.equal(slides.budget.scannedSlides, ARCHITECTURE_VALIDATION_LIMITS.maxSlides);
  assert.equal(slides.budget.skippedSlides, 1);
  assert.equal(slides.complete, false);
  assert.equal(slides.valid, false);
  assert.ok(slides.budget.limitsReached.includes("maxSlides"));
});

test("slide count limits do not read or type-check the uninspectable array tail", () => {
  const maxSlides = ARCHITECTURE_VALIDATION_LIMITS.maxSlides;
  const slides = Array(maxSlides + 1).fill("# No diagram");
  Object.defineProperty(slides, maxSlides, {
    get() { throw new Error("The skipped slide must not be read."); },
  });
  const report = validateArchitectureInput({ format: "slides", slides });
  assert.equal(report.total, maxSlides + 1);
  assert.equal(report.budget.scannedSlides, maxSlides);
  assert.equal(report.budget.inputChars, null);
  assert.equal(report.budget.skippedSlides, 1);
  assert.equal(report.budget.skippedBlocks, null);
  assert.deepEqual(report.budget.limitsReached, ["maxSlides"]);
  assert.equal(report.valid, false);
  assert.equal(report.complete, false);
  assert.equal(report.truncated, true);
});

test("total inspected characters have a separate deck-wide budget", () => {
  const fragment = " ".repeat(ARCHITECTURE_VALIDATION_LIMITS.maxSlideChars);
  const count = ARCHITECTURE_VALIDATION_LIMITS.maxTotalChars / fragment.length;
  const report = validateArchitectureInput({
    format: "slides", slides: [...Array(count).fill(fragment), "# Unchecked"],
  });
  assert.equal(report.budget.scannedChars, ARCHITECTURE_VALIDATION_LIMITS.maxTotalChars);
  assert.ok(report.budget.limitsReached.includes("maxTotalChars"));
  assert.equal(report.budget.skippedSlides, 1);
  assert.equal(report.complete, false);
  assert.equal(report.valid, false);
});

test("the registered pure tool separates invocation success from invalid content", async () => {
  const tool = createArchitectureValidationTool();
  assert.equal(tool.name, "markdstage_validate");
  assert.equal(tool.parameters.oneOf.length, 2);
  const invalidContent = await tool.handler({ format: "dsl", source: fourErrors() });
  assert.equal(invalidContent.resultType, "success");
  assert.equal(JSON.parse(invalidContent.textResultForLlm).valid, false);
  assert.equal(JSON.parse(invalidContent.textResultForLlm).ok, true);
  const malformed = await tool.handler({ source: EMPTY });
  assert.equal(malformed.resultType, "failure");
  assert.equal(JSON.parse(malformed.textResultForLlm).error, "invalid_input");
  const unexpected = new Error("programming failure");
  await assert.rejects(tool.handler({
    get format() { throw unexpected; },
  }), (error) => error === unexpected);

  const extension = await readFile(new URL("../extension.mjs", import.meta.url), "utf8");
  assert.match(extension, /import \{ createArchitectureValidationTool \} from "\.\/architecture-validation\.mjs"/);
  assert.match(extension, /createArchitectureValidationTool\(\),/);
});

test("Canvas renderer uses the generic route and shared static module-serving helper", async () => {
  const extension = await readFile(new URL("../extension.mjs", import.meta.url), "utf8");
  assert.match(extension, /sendFile,\s*\} from "\.\/runtime\/static-files\.mjs"/);
  assert.match(extension, /if \(pathname\.startsWith\("\/renderer\/"\) \|\| pathname\.startsWith\("\/vendor\/"\)\) \{/);
  assert.match(extension, /const abs = safeJoin\(EXT_DIR, pathname\)/);
  assert.match(extension, /await sendFile\(res, abs, \{ cache: pathname\.startsWith\("\/vendor\/"\) \}\)/);
});
