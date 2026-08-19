import test from "node:test";
import assert from "node:assert/strict";
import {
  createPresentationHooks,
  deckValidationFeedback,
  readGuide,
} from "../presentation-guide.mjs";

test("readGuide returns every document-backed topic", async () => {
  const expectations = {
    overview: "open_canvas",
    "slide-format": "front matter",
    themes: "ms-modern",
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

  const themeSchemaGuide = await readGuide("theme-schema");
  assert.match(themeSchemaGuide, /"--accent"/);
  assert.match(themeSchemaGuide, /CSS custom property/);
  assert.match(await readGuide("custom-ehemes"), /カスタムテーマ作成ガイド/);
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
