// 「layout 解除」がリポジトリ内の実データ全部で安全かを検証する。
//
// 背景: layout を持つ group の子は x/y を書いても黙って無視される。
// リポジトリ内の実データではノードの約 68% がこれに該当するため、
// 編集機能は「動かせない」と拒否したうえで、明示操作で layout を座標へ
// 焼き出す（release）という逃げ道を用意している。
//
// この release が壊れていないことを、玩具の fixture ではなく実データで固定する。
//   1. 解除後の DSL が JSON Schema を通る（Flow→Fixed へ変わるので x/y/w/h が全部必要）
//   2. 解除後も parseArchitecture を通る
//   3. 解除の前後で図の幾何が完全一致する（1px も動かない）
//
// 実行: node --test test/schema/architecture-edit-schema.test.mjs

import assert from "node:assert/strict";
import test from "node:test";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  architectureSemanticSnapshot,
  parseArchitecture,
} from "../../.github/extensions/presentation/renderer/architecture.mjs";
import {
  createArchitectureEditSession,
  describePlacement,
} from "../../.github/extensions/presentation/renderer/architecture-edit.mjs";
import { extractArchitectureSources } from "../utils/architecture.mjs";
import { schemaCheckSource } from "./validator.mjs";

const repoRoot = fileURLToPath(new URL("../..", import.meta.url));
const examplesDir = path.join(
  repoRoot,
  ".github",
  "extensions",
  "presentation",
  "schema",
  "examples",
);
const SKIP_DIRECTORIES = new Set([
  ".git",
  "node_modules",
  "test-results",
  "playwright-report",
  "dist",
]);

async function collectMarkdownFiles(directory) {
  const found = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (SKIP_DIRECTORIES.has(entry.name)) continue;
      found.push(...(await collectMarkdownFiles(path.join(directory, entry.name))));
    } else if (entry.isFile() && entry.name.toLowerCase().endsWith(".md")) {
      found.push(path.join(directory, entry.name));
    }
  }
  return found;
}

/** リポジトリ内の architecture ソースを Markdown と examples の両方から集める。 */
async function collectSources() {
  const collected = [];
  for (const file of await collectMarkdownFiles(repoRoot)) {
    const markdown = await readFile(file, "utf8");
    extractArchitectureSources(markdown).forEach((source, index) => {
      collected.push({ label: `${path.relative(repoRoot, file)}#${index}`, source });
    });
  }
  for (const entry of await readdir(examplesDir, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
    collected.push({
      label: path.join("schema/examples", entry.name),
      source: await readFile(path.join(examplesDir, entry.name), "utf8"),
    });
  }
  return collected;
}

const sources = await collectSources();

/** 図の中の「layout を持つ group」の id を列挙する。 */
function layoutGroups(model) {
  return model.elements
    .filter((element) => element.type === "group" && element.layout)
    .map((element) => element.id);
}

/** 幾何の比較用。connector は端点がノード位置から導出されるので併せて見る。 */
function geometry(model) {
  return model.elements.map((element) => ({
    id: element.id,
    type: element.type,
    x: element.x,
    y: element.y,
    width: element.width,
    height: element.height,
  }));
}

// layout の計算結果は 378.79999999999995 のような二進浮動小数になる。
// DSL は人が読み書きするファイルなので書き戻す際に丸めており、
// 解除の前後で座標がビット単位で一致することはない。
// 丸め幅は 1/10000 canvas 単位、入れ子の解除でも高々 4 段なので、
// 「見えない差」の上限としてこの値を使う（canvas 4000px 換算で 0.001px）。
const INVISIBLE = 1e-3;

/** 数値だけ許容誤差つきで、それ以外は厳密に比較する。 */
function assertGeometryClose(actual, expected, label) {
  assert.equal(actual.length, expected.length, `${label}: 要素数が変わった`);
  for (let i = 0; i < actual.length; i += 1) {
    for (const key of Object.keys(expected[i])) {
      const a = actual[i][key];
      const b = expected[i][key];
      if (typeof a === "number" && typeof b === "number") {
        assert.ok(
          Math.abs(a - b) <= INVISIBLE,
          `${label}: ${expected[i].id ?? expected[i].type}.${key} が ${b} から ${a} へずれた`,
        );
      } else {
        assert.deepEqual(a, b, `${label}: ${expected[i].id ?? expected[i].type}.${key}`);
      }
    }
  }
}

/**
 * 折れ線から「隣の 2 点を結ぶ直線上に載っているだけの点」を落とす。
 *
 * ルーターは連続点の重複と共線を 0.001 の閾値で畳んでいる（architecture.mjs）。
 * ところが layout の計算結果は 696.5999999999999 のような値になり、
 * 696.6 との差が閾値未満でも「別の値」なので角として残ってしまう。
 * 座標を丸めるとこの幽霊の角が消えて点が 1 つ減るが、線の形は同じ。
 * ここでは形だけを比べたいので、両者を同じ規則で正規化してから突き合わせる。
 */
function canonicalPoints(points) {
  const kept = [];
  for (const point of points) {
    const last = kept[kept.length - 1];
    if (last && Math.abs(last.x - point.x) <= INVISIBLE && Math.abs(last.y - point.y) <= INVISIBLE) {
      continue;
    }
    kept.push(point);
  }
  const result = [];
  for (let i = 0; i < kept.length; i += 1) {
    const previous = result[result.length - 1];
    const next = kept[i + 1];
    if (previous && next) {
      const cross =
        (kept[i].x - previous.x) * (next.y - previous.y) -
        (kept[i].y - previous.y) * (next.x - previous.x);
      const span = Math.hypot(next.x - previous.x, next.y - previous.y);
      // previous→next の直線までの距離が見えない範囲なら、この点は不要。
      if (span > 0 && Math.abs(cross) / span <= INVISIBLE) continue;
    }
    result.push(kept[i]);
  }
  return result;
}

/** connector の points を正規化した意味構造スナップショット。 */
function canonicalSnapshot(model) {
  const snapshot = architectureSemanticSnapshot(model);
  return {
    ...snapshot,
    elements: snapshot.elements.map((element) =>
      Array.isArray(element.points)
        ? { ...element, points: canonicalPoints(element.points) }
        : element,
    ),
  };
}

/** 意味構造スナップショット（座標を含む）を同じ許容誤差で比較する。 */
function assertSnapshotClose(actual, expected, label) {
  const walk = (a, b, at) => {
    if (typeof a === "number" && typeof b === "number") {
      assert.ok(Math.abs(a - b) <= INVISIBLE, `${label}: ${at} が ${b} から ${a} へずれた`);
      return;
    }
    if (Array.isArray(b)) {
      assert.ok(Array.isArray(a), `${label}: ${at} が配列でない`);
      assert.equal(a.length, b.length, `${label}: ${at} の要素数が変わった`);
      b.forEach((value, index) => walk(a[index], value, `${at}[${index}]`));
      return;
    }
    if (b !== null && typeof b === "object") {
      assert.ok(a !== null && typeof a === "object", `${label}: ${at} がオブジェクトでない`);
      assert.deepEqual(Object.keys(a).sort(), Object.keys(b).sort(), `${label}: ${at} のキー`);
      for (const key of Object.keys(b)) walk(a[key], b[key], `${at}.${key}`);
      return;
    }
    assert.deepEqual(a, b, `${label}: ${at}`);
  };
  walk(actual, expected, "snapshot");
}

test("実データに layout 管理下のノードが実在する（このテスト自体が空振りしていない）", () => {
  assert.ok(sources.length > 0, "architecture ソースが 1 つも集まっていない");

  let managed = 0;
  let total = 0;
  let groups = 0;
  for (const { source } of sources) {
    const model = parseArchitecture(source);
    groups += layoutGroups(model).length;
    for (const element of model.elements) {
      if (element.type !== "node" && element.type !== "group") continue;
      total += 1;
      if (describePlacement(model, element.id).reason === "layout-managed") managed += 1;
    }
  }

  // 実測値そのものを固定すると図の追加で落ちるので、「無視できない割合で存在する」ことだけ固定する。
  assert.ok(groups > 0, "layout を持つ group が 1 つも無い");
  assert.ok(
    managed / total > 0.4,
    `layout 管理下の割合が想定より低い: ${managed}/${total}`,
  );
});

test("layout を解除しても図の幾何は 1px も変わらない（実データ全件）", () => {
  let released = 0;
  for (const { label, source } of sources) {
    const baseline = parseArchitecture(source);
    for (const groupId of layoutGroups(baseline)) {
      const session = createArchitectureEditSession(source);
      const result = session.releaseLayout(groupId);
      assert.equal(result.ok, true, `${label} / ${groupId}: 解除に失敗 (${result.reason})`);
      released += 1;

      assertGeometryClose(geometry(session.model), geometry(baseline), `${label} / ${groupId}`);
      assertSnapshotClose(
        canonicalSnapshot(session.model),
        canonicalSnapshot(baseline),
        `${label} / ${groupId}`,
      );
    }
  }
  assert.ok(released > 0, "解除対象が 1 つも無かった");
});

test("layout を解除した DSL は JSON Schema を通る（Flow→Fixed の箱が全部埋まる）", () => {
  for (const { label, source } of sources) {
    for (const groupId of layoutGroups(parseArchitecture(source))) {
      const session = createArchitectureEditSession(source);
      assert.equal(session.releaseLayout(groupId).ok, true);
      const verdict = schemaCheckSource(session.source);
      assert.equal(verdict.ok, true, `${label} / ${groupId}: ${verdict.message}`);
    }
  }
});

test("入れ子の layout を外側から順に全部解除しても両検証器を通る", () => {
  for (const { label, source } of sources) {
    const session = createArchitectureEditSession(source);
    const baseline = parseArchitecture(source);

    // 解除するたびにモデルが変わるので、その都度残りを数え直す。
    let guard = 0;
    for (;;) {
      const remaining = layoutGroups(session.model);
      if (remaining.length === 0) break;
      assert.ok((guard += 1) < 64, `${label}: 解除が収束しない`);
      assert.equal(session.releaseLayout(remaining[0]).ok, true);
    }

    if (guard === 0) continue;
    assertGeometryClose(geometry(session.model), geometry(baseline), `${label}: 全解除`);
    const verdict = schemaCheckSource(session.source);
    assert.equal(verdict.ok, true, `${label}: 全解除後に schema 違反 - ${verdict.message}`);
    // 全部外したので、以降はどのノードも自由に動かせる。
    for (const element of session.model.elements) {
      if (element.type !== "node" && element.type !== "group") continue;
      assert.equal(
        session.describe(element.id).movable,
        true,
        `${label}: ${element.id} が解除後も動かせない`,
      );
    }
  }
});

test("移動を書き戻した DSL も JSON Schema を通る（実データ全件・動かせる要素のみ）", () => {
  for (const { label, source } of sources) {
    const session = createArchitectureEditSession(source);
    let moved = 0;
    for (const element of parseArchitecture(source).elements) {
      if (element.type !== "node" && element.type !== "group") continue;
      if (!describePlacement(session.model, element.id).movable) continue;
      const result = session.move(element.id, 10, -10);
      assert.equal(result.ok, true, `${label}: ${element.id} の移動に失敗 (${result.reason})`);
      moved += 1;
    }
    if (moved === 0) continue;
    const verdict = schemaCheckSource(session.source);
    assert.equal(verdict.ok, true, `${label}: 移動後に schema 違反 - ${verdict.message}`);
  }
});
