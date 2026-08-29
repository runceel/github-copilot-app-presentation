import test from "node:test";
import assert from "node:assert/strict";
import {
  architectureValidationErrors,
  createPresentationHooks,
  deckValidationFeedback,
  readGuide,
} from "../presentation-guide.mjs";

test("readGuide returns every document-backed topic", async () => {
  const expectations = {
    overview: "open_canvas",
    "slide-format": "front matter",
    themes: "custom",
    "custom-themes": "カスタムテーマ作成ガイド",
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
  assert.match(await readGuide("slide-format"), /layout: section/);
  assert.match(await readGuide("slide-format"), /上部のタイトル領域/);
  assert.match(await readGuide("slide-format"), /layout: center/);
  assert.match(await readGuide("slide-format"), /Markdown と同じ場所の `assets\/`/);
  assert.match(await readGuide("slide-format"), /`sourceName`/);
  assert.match(await readGuide("slide-format"), /リポジトリ直下の `assets\/`/);
  assert.match(await readGuide("slide-format"), /`theme-file`/);
  assert.match(await readGuide("slide-format"), /リポジトリルート/);
  assert.doesNotMatch(await readGuide("slide-format"), /### テーマの選び方/);
  assert.match(await readGuide("custom-ehemes"), /カスタムテーマ作成ガイド/);
  assert.match(await readGuide("custom-themes"), /元 Markdown と同じフォルダー/);
  assert.match(await readGuide("custom-themes"), /リポジトリルート/);
  assert.match(await readGuide("custom-themes"), /`sourceName`/);
  assert.match(await readGuide("overview"), /architecture-editor/);
  assert.match(await readGuide("overview"), /Markdown と同じ場所の `assets\/`/);
  assert.match(await readGuide("overview"), /`sourceName`/);
  assert.match(await readGuide("overview"), /リポジトリルート/);
  assert.match(await readGuide("themes"), /Markdown と同じフォルダー/);
  assert.match(await readGuide("themes"), /リポジトリルート/);
  assert.match(await readGuide("themes"), /`sourceName`/);
  assert.match(await readGuide("architecture-dsl"), /専用 Architecture Editor/);
  assert.match(await readGuide("architecture-dsl"), /明示保存/);
  assert.match(await readGuide("architecture-dsl"), /`labelLayer`/);
});

test("presentation hook primes each session at most once", () => {
  const hooks = createPresentationHooks();
  const input = { sessionId: "session-a", prompt: "slides.md をプレゼンして" };

  assert.deepEqual(hooks.onUserPromptSubmitted(input), {
    additionalContext:
      "presentation canvas を使う前に presentation_guide ツールで書式とスキーマを確認すること。",
  });
  assert.equal(hooks.onUserPromptSubmitted(input), undefined);
  assert.equal(
    hooks.onUserPromptSubmitted({ sessionId: "session-b", prompt: "通常の質問です" }),
    undefined,
  );
  assert.ok(
    hooks.onUserPromptSubmitted({ sessionId: "session-b", prompt: "Create a deck" })
      ?.additionalContext,
  );
});

test("guide use suppresses the hook and session end clears its state", () => {
  const hooks = createPresentationHooks();
  hooks.onPostToolUse({ sessionId: "session-a", toolName: "presentation_guide" });
  assert.equal(
    hooks.onUserPromptSubmitted({ sessionId: "session-a", prompt: "スライドを作る" }),
    undefined,
  );

  hooks.onSessionEnd({ sessionId: "session-a" });
  assert.ok(
    hooks.onUserPromptSubmitted({ sessionId: "session-a", prompt: "スライドを作る" })
      ?.additionalContext,
  );
  hooks.onSessionStart({ sessionId: "session-a" });
  assert.ok(
    hooks.onUserPromptSubmitted({ sessionId: "session-a", prompt: "スライドを作る" })
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

  assert.match(deckValidationFeedback([slide]), /コードフェンスが閉じられていません/);
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
  assert.match(errors[3].message, /閉じられていません/);
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
