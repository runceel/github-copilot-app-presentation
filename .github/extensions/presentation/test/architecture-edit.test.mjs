// Architecture 図の編集コア（architecture-edit.mjs）の単体テスト。
//
// ここで固定したい性質は 4 つ。
//   1. layout 管理下の要素は「動かせない」と理由付きで拒否される
//      （リポジトリ内の実データではノードの約 68% がこれに該当する）
//   2. 移動の書き戻しは親 group の絶対座標を引いた相対座標で行われる
//   3. releaseLayout は見た目を 1px も変えずに layout を座標へ焼き出す
//   4. undo / redo が DSL 全文のスナップショットとして往復する
//
// DOM には一切触れない（DOM 側は Playwright の editing プロジェクトで検証する）。

import test from "node:test";
import assert from "node:assert/strict";

import {
  architectureSemanticSnapshot,
  parseArchitecture,
} from "../renderer/architecture.mjs";
import {
  EDIT_STEP,
  createArchitectureEditSession,
  describePlacement,
  parseSourcePath,
  resolveRawElement,
  serializeArchitecture,
} from "../renderer/architecture-edit.mjs";
import {
  findArchitectureBlocks,
  importedArchitectureBlockIndex,
  replaceArchitectureBlock,
  replaceImportedArchitectureBlock,
} from "../scripts/markdown-blocks.mjs";

// free           … 最上位のノード（親なし）
// shell          … layout を持たない group
// shell/pinned   … 座標を自分で持つ子
// shell/flowbox  … layout: row を持つ入れ子 group
// flowbox/f1,f2  … layout が位置を決める子（x/y を書いても無視される）
const FIXTURE = {
  version: 1,
  canvas: { width: 1600, height: 900 },
  elements: [
    { type: "node", id: "free", x: 100, y: 100, width: 200, height: 100 },
    {
      type: "group",
      id: "shell",
      x: 500,
      y: 120,
      width: 900,
      height: 600,
      children: [
        { type: "node", id: "pinned", x: 40, y: 60, width: 200, height: 100 },
        {
          type: "group",
          id: "flowbox",
          x: 300,
          y: 60,
          width: 520,
          height: 400,
          layout: { type: "row", padding: 40, gap: 30 },
          children: [
            { type: "node", id: "f1" },
            { type: "node", id: "f2" },
          ],
        },
      ],
    },
  ],
};

const source = `${JSON.stringify(FIXTURE, null, 2)}\n`;

function byId(model, id) {
  return model.elements.find((element) => element.id === id);
}

function boxes(model) {
  return model.elements
    .filter((element) => element.type !== "connector")
    .map(({ id, x, y, width, height }) => ({ id, x, y, width, height }));
}

test("sourcePath は厳密に解析され、想定外の形は書き戻しを中止する", () => {
  assert.deepEqual(parseSourcePath("elements[0]"), [{ key: "elements", index: 0 }]);
  assert.deepEqual(parseSourcePath("elements[1].children[2]"), [
    { key: "elements", index: 1 },
    { key: "children", index: 2 },
  ]);
  for (const bad of ["", "elements", "elements[]", "elements[0]x", ".children[0]", "elements[0].", 42]) {
    assert.equal(parseSourcePath(bad), null, `${String(bad)} は拒否されるべき`);
  }

  const raw = JSON.parse(source);
  const located = resolveRawElement(raw, "elements[1].children[0]");
  assert.equal(located.element.id, "pinned");
  assert.equal(located.parent.id, "shell");
  // 最上位要素の親は null（origin 0,0 として扱う）。
  assert.equal(resolveRawElement(raw, "elements[0]").parent, null);
  // 範囲外・型違いはすべて null。
  assert.equal(resolveRawElement(raw, "elements[9]"), null);
  assert.equal(resolveRawElement(raw, "elements[0].children[0]"), null);
});

test("layout を持つ group の子は動かせないと判定され、解除対象の group を示す", () => {
  const model = parseArchitecture(source);

  // 親を持たない要素と、layout を持たない group の子は動かせる。
  assert.equal(describePlacement(model, "free").movable, true);
  assert.deepEqual(describePlacement(model, "free").origin, { x: 0, y: 0 });
  assert.equal(describePlacement(model, "pinned").movable, true);
  assert.deepEqual(describePlacement(model, "pinned").origin, { x: 500, y: 120 });
  assert.equal(describePlacement(model, "flowbox").movable, true);

  // layout の管理下は拒否。理由と「誰の layout か」を必ず添える。
  for (const id of ["f1", "f2"]) {
    const placement = describePlacement(model, id);
    assert.equal(placement.movable, false);
    assert.equal(placement.reason, "layout-managed");
    assert.equal(placement.layoutOwner, "flowbox");
    assert.equal(placement.layoutType, "row");
  }

  assert.deepEqual(describePlacement(model, "missing"), {
    found: false,
    movable: false,
    reason: "unknown",
    id: "missing",
  });
});

test("移動は親 group の絶対座標を引いた相対座標で書き戻される", () => {
  const session = createArchitectureEditSession(source);

  // 最上位要素: origin が 0 なので絶対座標がそのまま入る。
  const movedFree = session.move("free", EDIT_STEP, -EDIT_STEP);
  assert.equal(movedFree.ok, true);
  assert.deepEqual([movedFree.x, movedFree.y], [110, 90]);
  assert.equal(JSON.parse(session.source).elements[0].x, 110);

  // 入れ子: DSL には相対座標 (40+15, 60+25)、モデルには絶対座標が入る。
  const movedChild = session.move("pinned", 15, 25);
  assert.equal(movedChild.ok, true);
  assert.deepEqual([movedChild.x, movedChild.y], [55, 85]);
  const rawChild = JSON.parse(session.source).elements[1].children[0];
  assert.deepEqual([rawChild.x, rawChild.y], [55, 85]);
  const modelChild = byId(session.model, "pinned");
  assert.deepEqual([modelChild.x, modelChild.y], [555, 205]);

  // 動きが 0 のときは履歴を汚さない。
  const before = session.depth;
  const unchanged = session.move("pinned", 0, 0);
  assert.equal(unchanged.ok, false);
  assert.equal(unchanged.reason, "unchanged");
  assert.equal(session.depth, before);
});

test("layout 管理下の要素を動かそうとしても DSL は 1 文字も変わらない", () => {
  const session = createArchitectureEditSession(source);
  const result = session.move("f1", EDIT_STEP, EDIT_STEP);
  assert.equal(result.ok, false);
  assert.equal(result.reason, "layout-managed");
  assert.equal(result.layoutOwner, "flowbox");
  assert.equal(session.source, source);
  assert.equal(session.depth, 1);
  assert.equal(session.canUndo, false);
});

test("座標は schema の範囲へクランプされ、再パースできる DSL だけが履歴に載る", () => {
  const session = createArchitectureEditSession(source);
  const result = session.move("free", 999_999, -999_999);
  assert.equal(result.ok, true);
  assert.deepEqual([result.x, result.y], [4000, -4000]);
  // -0 が混ざると JSON 差分がうるさいので 0 に寄せる。
  const zeroed = createArchitectureEditSession(source).move("free", -100, -100);
  assert.equal(Object.is(zeroed.x, 0), true);
  assert.equal(serializeArchitecture(JSON.parse(session.source)).endsWith("\n"), true);
});

test("releaseLayout は図の見た目を変えずに layout を座標へ焼き出す", () => {
  const session = createArchitectureEditSession(source);
  const before = boxes(session.model);
  const beforeSnapshot = architectureSemanticSnapshot(session.model);

  const result = session.releaseLayout("flowbox");
  assert.equal(result.ok, true);
  assert.equal(result.reason, "layout-released");
  assert.equal(result.layoutType, "row");
  assert.equal(result.released, 2);

  // 幾何は完全一致（1px も動かさずに layout を外すのが釈放の定義）。
  assert.deepEqual(boxes(session.model), before);
  assert.deepEqual(architectureSemanticSnapshot(session.model), beforeSnapshot);

  // layout は消え、子は 4 つの箱プロパティを全て持つ（schema の boxRequired）。
  const rawGroup = JSON.parse(session.source).elements[1].children[1];
  assert.equal("layout" in rawGroup, false);
  for (const child of rawGroup.children) {
    for (const key of ["x", "y", "width", "height"]) {
      assert.equal(typeof child[key], "number", `${child.id}.${key} が必要`);
    }
  }

  // 解除後は動かせるようになる。
  assert.equal(session.describe("f1").movable, true);
  assert.equal(session.move("f1", EDIT_STEP, 0).ok, true);
});

test("releaseLayout は group 以外・layout 無しの要素を拒否する", () => {
  const session = createArchitectureEditSession(source);
  assert.equal(session.releaseLayout("free").reason, "not-a-group");
  assert.equal(session.releaseLayout("shell").reason, "not-layout-managed");
  assert.equal(session.releaseLayout("nope").reason, "unknown");
  assert.equal(session.source, source);
});

test("undo / redo は DSL 全文を往復し、新しい編集で redo 側を捨てる", () => {
  const session = createArchitectureEditSession(source);
  assert.equal(session.canUndo, false);
  assert.equal(session.canRedo, false);

  session.move("free", EDIT_STEP, 0);
  session.move("free", EDIT_STEP, 0);
  assert.equal(JSON.parse(session.source).elements[0].x, 120);
  assert.equal(session.depth, 3);

  assert.equal(session.undo().reason, "undone");
  assert.equal(JSON.parse(session.source).elements[0].x, 110);
  assert.equal(session.canRedo, true);
  assert.equal(session.redo().reason, "redone");
  assert.equal(JSON.parse(session.source).elements[0].x, 120);

  // 最初まで戻ると元の文字列に完全一致する。
  session.undo();
  session.undo();
  assert.equal(session.source, source);
  assert.equal(session.undo().reason, "no-history");

  // 戻った状態から編集すると redo 側は捨てられる。
  session.move("free", 0, EDIT_STEP);
  assert.equal(session.canRedo, false);
  assert.equal(session.depth, 2);
});

test("履歴の上限を超えると古い方から落ちる", () => {
  const session = createArchitectureEditSession(source, { historyLimit: 3 });
  for (let i = 0; i < 10; i += 1) session.move("free", 1, 0);
  assert.equal(session.depth, 3);
  assert.equal(session.canRedo, false);
  // 上限ぶんだけは戻れる（それ以上は履歴が無い）。
  assert.equal(session.undo().ok, true);
  assert.equal(session.undo().ok, true);
  assert.equal(session.undo().ok, false);
});

test("編集結果は元 Markdown の n 番目の architecture ブロックへ戻る", () => {
  const markdown = [
    "# 図が2つあるスライド",
    "",
    "```architecture",
    '{ "version": 1, "elements": [] }',
    "```",
    "",
    "```json",
    '{ "architecture": "これはただの JSON なので数えない" }',
    "```",
    "",
    "```architecture",
    '{ "version": 1, "elements": [] }',
    "```",
    "",
    "終わり",
  ].join("\n");

  const blocks = findArchitectureBlocks(markdown);
  assert.equal(blocks.length, 2);
  assert.deepEqual(
    blocks.map((block) => block.index),
    [0, 1],
  );

  const next = replaceArchitectureBlock(markdown, 1, source);
  assert.notEqual(next, null);
  const updated = findArchitectureBlocks(next);
  // 0 番目は素通り、1 番目だけ差し替わる。
  assert.equal(updated[0].body, '{ "version": 1, "elements": [] }');
  assert.equal(JSON.parse(updated[1].body).elements.length, 2);
  // 前後の地の文とフェンス行は保存される。
  assert.equal(next.startsWith("# 図が2つあるスライド"), true);
  assert.equal(next.endsWith("終わり"), true);
  assert.equal((next.match(/```architecture/g) ?? []).length, 2);
  assert.equal(next.includes("これはただの JSON なので数えない"), true);

  // 存在しないブロック番号は null（呼び出し側が 404 を返せるようにする）。
  assert.equal(replaceArchitectureBlock(markdown, 5, source), null);
  assert.equal(replaceArchitectureBlock("本文だけ", 0, source), null);
});

test("インデントされたフェンスと ~~~ フェンスも数え方が変わらない", () => {
  const markdown = [
    "- リスト内の図",
    "",
    "  ```architecture",
    '  { "version": 1, "elements": [] }',
    "  ```",
    "",
    "~~~architecture",
    '{ "version": 1, "elements": [] }',
    "~~~",
  ].join("\n");
  const blocks = findArchitectureBlocks(markdown);
  assert.equal(blocks.length, 2);
  assert.equal(blocks[0].indent, "  ");

  const next = replaceArchitectureBlock(markdown, 0, '{"version":1,"elements":[]}');
  assert.equal(next.includes('  {"version":1,"elements":[]}'), true);
  assert.equal(next.includes("~~~architecture"), true);
});

test("CRLF の Markdown を保存してもフェンス外の改行コードが変わらない", () => {
  // CRLF のファイルを 1 枚保存しただけで全行が LF になると、Windows 利用者の
  // git diff が全行変更になる。フェンス外の地の文は 1 バイトも変えない。
  const markdown = [
    "---",
    "deck: CRLF",
    "---",
    "",
    "## 見出し",
    "",
    "```architecture",
    '{ "version": 1, "elements": [] }',
    "```",
    "",
    "あとがき",
  ].join("\r\n");

  const next = replaceArchitectureBlock(markdown, 0, '{"version":1,"elements":[]}');
  assert.notEqual(next, null);
  // LF 単独（CRLF の一部でない改行）が現れていない。
  assert.equal(/(?<!\r)\n/.test(next), false);
  assert.equal(next.includes("## 見出し\r\n"), true);
  assert.equal(next.includes("あとがき"), true);
  assert.equal(next.includes('{"version":1,"elements":[]}'), true);
  // フェンス外の行は元のまま（差し替え前後で行数も保たれる）。
  assert.equal(next.split("\r\n").length, markdown.split("\r\n").length);
});

test("LF の Markdown は LF のまま保たれる", () => {
  const markdown = ["## 見出し", "", "```architecture", '{ "version": 1, "elements": [] }', "```", ""].join(
    "\n",
  );
  const next = replaceArchitectureBlock(markdown, 0, '{"version":1,"elements":[]}');
  assert.equal(next.includes("\r"), false);
  assert.equal(next.includes("## 見出し\n"), true);
});

test("スライド内のブロック番号をインポート元 Markdown 全体へ対応付ける", () => {
  const slides = [
    ["## 1", "```architecture", '{"version":1,"elements":[]}', "```"].join("\n"),
    [
      "## 2",
      "```architecture",
      '{"version":1,"elements":[]}',
      "```",
      "```architecture",
      '{"version":1,"elements":[]}',
      "```",
    ].join("\n"),
    "## 背表紙",
  ];

  assert.equal(importedArchitectureBlockIndex(slides, 0, 0), 0);
  assert.equal(importedArchitectureBlockIndex(slides, 1, 0), 1);
  assert.equal(importedArchitectureBlockIndex(slides, 1, 1), 2);
  assert.equal(importedArchitectureBlockIndex(slides, 2, 0), null);
  assert.equal(importedArchitectureBlockIndex(slides, 9, 0), null);
});

test("Architecture フェンスは renderer と同じく大文字小文字を区別せず数える", () => {
  const slides = [
    ["```Architecture", '{"version":1,"elements":[]}', "```"].join("\n"),
    ["```ARCHITECTURE", '{"version":1,"elements":[]}', "```"].join("\n"),
  ];

  assert.equal(findArchitectureBlocks(slides[0]).length, 1);
  assert.equal(importedArchitectureBlockIndex(slides, 1, 0), 1);
});

test("インポート元は期待するフェンスだけを書き換え、外部変更は拒否する", () => {
  const markdown = [
    "## 1",
    "```architecture",
    '{"version":1,"elements":[]}',
    "```",
    "",
    "---",
    "",
    "## 2",
    "```architecture",
    '{"version":1,"elements":[{"type":"node","id":"target","x":1,"y":2,"width":3,"height":4}]}',
    "```",
  ].join("\r\n");
  const slides = [
    ["## 1", "```architecture", '{"version":1,"elements":[]}', "```"].join("\n"),
    [
      "---",
      "page: 2",
      "total: 2",
      "---",
      "## 2",
      "```architecture",
      '{"version":1,"elements":[{"type":"node","id":"target","x":1,"y":2,"width":3,"height":4}]}',
      "```",
    ].join("\n"),
  ];
  const edited =
    '{"version":1,"elements":[{"type":"node","id":"target","x":11,"y":12,"width":3,"height":4}]}';

  const result = replaceImportedArchitectureBlock(markdown, slides, 1, 0, edited, markdown);
  assert.equal(result.ok, true);
  assert.equal(result.globalIndex, 1);
  assert.equal(findArchitectureBlocks(result.markdown)[0].body, '{"version":1,"elements":[]}');
  assert.equal(JSON.parse(findArchitectureBlocks(result.markdown)[1].body).elements[0].x, 11);
  assert.equal(/(?<!\r)\n/.test(result.markdown), false);

  const externallyChanged = markdown.replace('"x":1', '"x":99');
  assert.deepEqual(
    replaceImportedArchitectureBlock(externallyChanged, slides, 1, 0, edited, markdown),
    { ok: false, reason: "source_changed" },
  );

  const identicalInserted = markdown.replace(
    "## 1\r\n",
    [
      "## inserted",
      "```architecture",
      '{"version":1,"elements":[]}',
      "```",
      "",
      "## 1",
      "",
    ].join("\r\n"),
  );
  assert.deepEqual(
    replaceImportedArchitectureBlock(identicalInserted, slides, 1, 0, edited, markdown),
    { ok: false, reason: "source_changed" },
  );
});
