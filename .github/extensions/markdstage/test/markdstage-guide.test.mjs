import test from "node:test";
import assert from "node:assert/strict";
import {
  architectureValidationErrors,
  createMarkdStageHooks,
  deckValidationFeedback,
  readGuide,
} from "../markdstage-guide.mjs";

test("readGuide returns every document-backed topic", async () => {
  const expectations = {
    overview: "open_canvas",
    "slide-format": "front matter",
    themes: "custom",
    "custom-themes": "Custom theme authoring guide",
    "theme-schema": "--bg",
    "architecture-dsl": "```architecture",
    "architecture-schema": '"builtIn"',
  };

  for (const [topic, expected] of Object.entries(expectations)) {
    assert.match(await readGuide(topic), new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }

  const schemaGuide = await readGuide("architecture-schema");
  assert.match(schemaGuide, /"shield"/);
  assert.match(schemaGuide, /"textColor"/);
  assert.match(schemaGuide, /assets\//);
  assert.match(schemaGuide, /"labelLayer"/);
  assert.match(schemaGuide, /"front"/);

  const themeSchemaGuide = await readGuide("theme-schema");
  assert.match(themeSchemaGuide, /"--accent"/);
  assert.match(themeSchemaGuide, /"--section-bg"/);
  assert.match(themeSchemaGuide, /"--print-section-bg"/);
  assert.match(themeSchemaGuide, /CSS custom property/);
  const slideFormatGuide = await readGuide("slide-format");
  assert.match(slideFormatGuide, /### Markdown file syntax/);
  assert.match(slideFormatGuide, /top level/);
  assert.match(slideFormatGuide, /`<!-- slide -->` are not slide separators/);
  assert.match(slideFormatGuide, /leave a blank line/);
  assert.match(slideFormatGuide, /### Canvas API `slides` array/);
  assert.match(slideFormatGuide, /each element of the `slides` array is exactly\s+one slide/);
  assert.match(slideFormatGuide, /### `sourceName` role/);
  assert.match(slideFormatGuide, /does not read, parse, split, or watch/);
  assert.match(slideFormatGuide, /More controls >\s+Open Markdown/);
  assert.match(slideFormatGuide, /layout: section/);
  assert.match(slideFormatGuide, /top title area/);
  assert.match(slideFormatGuide, /layout: center/);
  assert.match(slideFormatGuide, /`assets\/` beside the Markdown/);
  assert.match(slideFormatGuide, /`sourceName`/);
  assert.match(slideFormatGuide, /workspace-root `assets\/`/);
  assert.match(slideFormatGuide, /`theme-file`/);
  assert.match(slideFormatGuide, /workspace root/);
  assert.doesNotMatch(slideFormatGuide, /### Choosing a theme/);
  assert.match(await readGuide("custom-ehemes"), /Custom theme authoring guide/);
  assert.match(await readGuide("custom-themes"), /same folder as the source Markdown/);
  assert.match(await readGuide("custom-themes"), /workspace root/);
  assert.match(await readGuide("custom-themes"), /`sourceName`/);
  assert.match(await readGuide("overview"), /architecture-editor/);
  assert.match(await readGuide("overview"), /`assets\/` beside the Markdown/);
  assert.match(await readGuide("overview"), /`sourceName`/);
  assert.match(await readGuide("overview"), /never reads or watches/);
  assert.match(await readGuide("overview"), /whole-deck inspection/);
  assert.match(await readGuide("overview"), /folder opened for the current session/);
  assert.match(await readGuide("themes"), /same folder as the source Markdown/);
  assert.match(await readGuide("themes"), /workspace root/);
  assert.match(await readGuide("themes"), /`sourceName`/);
  assert.match(slideFormatGuide, /does not read, parse, split, or watch/);
  assert.match(await readGuide("architecture-dsl"), /dedicated Architecture Editor/);
  assert.match(await readGuide("architecture-dsl"), /explicitly saved/);
  assert.match(await readGuide("architecture-dsl"), /`labelLayer`/);
});

test("MarkdStage hook primes each session at most once", () => {
  const hooks = createMarkdStageHooks();
  const input = { sessionId: "session-a", prompt: "Present slides.md" };

  assert.deepEqual(hooks.onUserPromptSubmitted(input), {
    additionalContext:
      "Use the markdstage_guide tool to review the format and schemas before using the MarkdStage canvas.",
  });
  assert.equal(hooks.onUserPromptSubmitted(input), undefined);
  assert.equal(
    hooks.onUserPromptSubmitted({ sessionId: "session-b", prompt: "This is an ordinary question" }),
    undefined,
  );
  assert.ok(
    hooks.onUserPromptSubmitted({ sessionId: "session-b", prompt: "Create a deck" })
      ?.additionalContext,
  );
  hooks.onSessionEnd({ sessionId: "session-b" });
  assert.ok(
    hooks.onUserPromptSubmitted({ sessionId: "session-b", prompt: "Create a presentation" })
      ?.additionalContext,
  );
});

test("guide use suppresses the hook and session end clears its state", () => {
  const hooks = createMarkdStageHooks();
  hooks.onPostToolUse({ sessionId: "session-a", toolName: "markdstage_guide" });
  assert.equal(
    hooks.onUserPromptSubmitted({ sessionId: "session-a", prompt: "Create a deck" }),
    undefined,
  );

  hooks.onSessionEnd({ sessionId: "session-a" });
  assert.ok(
    hooks.onUserPromptSubmitted({ sessionId: "session-a", prompt: "Create a deck" })
      ?.additionalContext,
  );
  hooks.onSessionStart({ sessionId: "session-a" });
  assert.ok(
    hooks.onUserPromptSubmitted({ sessionId: "session-a", prompt: "Create a deck" })
      ?.additionalContext,
  );
});

test("deck validation reports missing front matter and architecture errors", () => {
  const feedback = deckValidationFeedback([
    "# No metadata",
    [
      "---",
      "layout: title",
      "---",
      "```architecture",
      '{"elements":[{"type":"node","id":"missing-size"}]}',
      "```",
    ].join("\n"),
  ]);

  assert.match(feedback, /slide 1: front matter/);
  assert.match(feedback, /slide 2, architecture 1:/);
  assert.match(feedback, /architecture-schema/);
});

test("deck validation accepts valid front matter and architecture", () => {
  const slide = [
    "---",
    "layout: title",
    "---",
    "```architecture",
    JSON.stringify({
      elements: [
        {
          type: "node",
          id: "api",
          x: 10,
          y: 10,
          width: 200,
          height: 100,
          text: "API",
        },
      ],
    }),
    "```",
  ].join("\n");

  assert.equal(deckValidationFeedback([slide]), undefined);
});

test("deck validation finds an unclosed architecture fence after a valid block", () => {
  const slide = [
    "---",
    "layout: title",
    "---",
    "```architecture",
    '{"elements":[]}',
    "```",
    "```architecture",
    '{"elements":[]}',
  ].join("\n");

  assert.match(deckValidationFeedback([slide]), /code fence is not closed/);
});

test("architecture validation returns structured errors for the whole deck", () => {
  const slides = [
    [
      "---",
      "layout: title",
      "---",
      "```architecture",
      '{"elements":[{"type":"node","id":"missing-size"}]}',
      "```",
    ].join("\n"),
    [
      "---",
      "layout: center",
      "---",
      "```architecture",
      '{"elements":[]}',
      "```",
      "```architecture",
      "{",
      "```",
    ].join("\n"),
    [
      "---",
      "layout: center",
      "---",
      "```architecture",
      '{"elements":[]',
    ].join("\n"),
  ];

  const errors = architectureValidationErrors(slides);
  assert.equal(errors.length, 4);
  assert.deepEqual(
    errors.map(({ slideIndex, page, blockIndex, architecture, code }) => ({
      slideIndex,
      page,
      blockIndex,
      architecture,
      code,
    })),
    [
      {
        slideIndex: 0,
        page: 1,
        blockIndex: 0,
        architecture: 1,
        code: "invalid_architecture",
      },
      {
        slideIndex: 1,
        page: 2,
        blockIndex: 1,
        architecture: 2,
        code: "invalid_architecture",
      },
      {
        slideIndex: 2,
        page: 3,
        blockIndex: 0,
        architecture: 1,
        code: "invalid_architecture",
      },
      {
        slideIndex: 2,
        page: 3,
        blockIndex: 0,
        architecture: 1,
        code: "unclosed_architecture_fence",
      },
    ],
  );
  assert.match(errors[0].message, /finite number/);
  assert.match(errors[1].message, /invalid JSON/);
  assert.match(errors[2].message, /invalid JSON/);
  assert.match(errors[3].message, /not closed/);
});

test("architecture validation can target one slide by zero-based index", () => {
  const slides = [
    "```architecture\n{\n```",
    "```architecture\n{\"elements\":[]}\n```",
    "```architecture\n{\"elements\":[]",
  ];

  assert.deepEqual(architectureValidationErrors(slides, { index: 1 }), []);
  const errors = architectureValidationErrors(slides, { index: 2 });
  assert.equal(errors.length, 2);
  assert.equal(errors[0].slideIndex, 2);
  assert.equal(errors[0].page, 3);
  assert.equal(errors[0].code, "invalid_architecture");
  assert.equal(errors[1].code, "unclosed_architecture_fence");
});
