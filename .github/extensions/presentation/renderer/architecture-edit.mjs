// ```architecture ブロックの編集ワークフロー（DOM 非依存のコア）。
//
// 設計上の要点は 3 つある。
//
// 1. 編集結果は「元の DSL そのもの」に書き戻す。
//    以前の PoC は {version, overrides:[{id,x,y}]} という JSON をクリップボードへ
//    出していたが、parseArchitecture が受け付ける最上位キーは
//    $schema / version / canvas / title / description / elements だけで、
//    overrides を読む実装はどこにも無かった（＝貼り先が無い行き止まりの形式）。
//    そこで本モジュールは要素の x / y を直接書き換えた DSL 全文を返す。
//    こうすると「保存 = 元の Markdown のブロック差し替え」で完結する。
//
// 2. モデル座標は絶対、DSL 座標は親 group からの相対。
//    normalizeBox が親の origin を足し込んでいるので、書き戻すときは必ず
//    親 group の絶対座標を引く。ここを忘れると入れ子の図が壊れる。
//
// 3. layout を持つ group の子は x / y を書いても *黙って無視される*。
//    layoutPlacements は子を型でしか選別しておらず fixed / flow の区別が無く、
//    normalizeBox も placement を最優先する（placement?.x ?? element.x）。
//    リポジトリ内の実データではノードの約 68% がこれに該当するため、
//    「動かせるふりをして無視する」のではなく、判定して理由を返し、
//    利用者が明示的に layout を解除できる導線（releaseLayout）を用意する。

import { parseArchitecture } from "./architecture.mjs";

/** 通常の移動量（canvas 座標系）。 */
export const EDIT_STEP = 10;
/** Shift 併用時の微調整量。 */
export const EDIT_FINE_STEP = 1;
/** 履歴に積む編集の既定上限。 */
export const EDIT_HISTORY_LIMIT = 100;

// schema の coordinate / extent と同じ範囲。ここを外れると再パースで落ちるため、
// 書き戻す前にクランプしておく。
const COORDINATE_MIN = -4000;
const COORDINATE_MAX = 4000;
const EXTENT_MIN = 1;
const EXTENT_MAX = 4000;
// layout の計算結果は小数になる。丸めすぎると layout 解除で図がずれるので、
// 見た目に影響しない範囲（1/10000 canvas 単位）まで残す。
const COORDINATE_PRECISION = 4;

function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function roundCoordinate(value) {
  const rounded = Number(value.toFixed(COORDINATE_PRECISION));
  // -0 は JSON では "-0" になり差分がうるさいので 0 に寄せる。
  return Object.is(rounded, -0) ? 0 : rounded;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

/**
 * `elements[0].children[2]` のような sourcePath を
 * [{key:"elements",index:0},{key:"children",index:2}] へ分解する。
 * 想定外の形なら null を返し、呼び出し側で書き戻しを中止する。
 */
export function parseSourcePath(sourcePath) {
  if (typeof sourcePath !== "string" || sourcePath.length === 0) return null;
  const segments = [];
  const pattern = /([A-Za-z_][A-Za-z0-9_]*)\[(\d+)\]/g;
  let cursor = 0;
  let match = pattern.exec(sourcePath);
  while (match !== null) {
    if (match.index !== cursor) return null;
    segments.push({ key: match[1], index: Number(match[2]) });
    cursor = match.index + match[0].length;
    match = pattern.exec(sourcePath);
    // 区切りの "." は「次のセグメントがある」ときだけ食べる。
    // そうしないと "elements[0]." のような末尾ドットを通してしまう。
    if (match !== null && sourcePath[cursor] === ".") cursor += 1;
  }
  if (segments.length === 0 || cursor !== sourcePath.length) return null;
  return segments;
}

/**
 * 生 JSON から sourcePath の要素を取り出す。
 * parent は「その要素を children に持つ group」（最上位要素なら null）。
 */
export function resolveRawElement(raw, sourcePath) {
  const segments = parseSourcePath(sourcePath);
  if (!segments || !isPlainObject(raw)) return null;
  let owner = raw;
  for (let i = 0; i < segments.length; i += 1) {
    const { key, index } = segments[i];
    const list = owner?.[key];
    if (!Array.isArray(list)) return null;
    const next = list[index];
    if (!isPlainObject(next)) return null;
    if (i === segments.length - 1) {
      return { element: next, parent: owner === raw ? null : owner };
    }
    owner = next;
  }
  return null;
}

/** 親 group の sourcePath。最上位要素なら null。 */
export function parentSourcePath(sourcePath) {
  if (typeof sourcePath !== "string") return null;
  const marker = sourcePath.lastIndexOf(".children[");
  return marker === -1 ? null : sourcePath.slice(0, marker);
}

function findById(model, id) {
  return (
    model.elements.find((element) => element.type !== "connector" && element.id === id) ?? null
  );
}

function findBySourcePath(model, sourcePath) {
  return model.elements.find((element) => element.sourcePath === sourcePath) ?? null;
}

/**
 * 「その要素の位置を最終的に決めているのは誰か」を返す。
 * movable が false のときは理由（layout-managed）と解除対象の group id を添える。
 */
export function describePlacement(model, id) {
  const element = findById(model, id);
  if (!element) return { found: false, movable: false, reason: "unknown", id };
  const parentPath = parentSourcePath(element.sourcePath);
  const parent = parentPath ? findBySourcePath(model, parentPath) : null;
  const origin = parent ? { x: parent.x, y: parent.y } : { x: 0, y: 0 };
  if (parent?.layout) {
    return {
      found: true,
      movable: false,
      reason: "layout-managed",
      id,
      type: element.type,
      layoutOwner: parent.id,
      layoutType: parent.layout.type,
      origin,
    };
  }
  return {
    found: true,
    movable: true,
    reason: "free",
    id,
    type: element.type,
    layoutOwner: null,
    layoutType: null,
    origin,
  };
}

/** 編集結果の DSL を安定した書式（2 スペース）で文字列化する。 */
export function serializeArchitecture(raw) {
  return `${JSON.stringify(raw, null, 2)}\n`;
}

/**
 * 編集セッション。source（DSL 全文）とモデルを常に同期させ、
 * 変更のたびに「新しい DSL 全文」を履歴へ積む。
 * 1 手 = 1 スナップショットなので undo / redo は添字の移動だけで済む。
 */
export function createArchitectureEditSession(source, options = {}) {
  const limit = Math.max(1, Math.trunc(options.historyLimit ?? EDIT_HISTORY_LIMIT));
  const entries = [snapshot(source)];
  let cursor = 0;

  function snapshot(text) {
    return { source: text, model: parseArchitecture(text) };
  }

  function current() {
    return entries[cursor];
  }

  function push(entry) {
    entries.splice(cursor + 1);
    entries.push(entry);
    if (entries.length > limit) entries.shift();
    cursor = entries.length - 1;
  }

  function commit(raw, info) {
    const text = serializeArchitecture(raw);
    let model;
    try {
      model = parseArchitecture(text);
    } catch (error) {
      // 書き戻した結果が DSL として不正なら履歴に積まない（壊れた図を保存しない）。
      return { ...info, ok: false, reason: "rejected", message: error?.message ?? "" };
    }
    push({ source: text, model });
    return { ...info, ok: true, source: text, model };
  }

  function move(id, dx, dy) {
    const { source: text, model } = current();
    const placement = describePlacement(model, id);
    if (!placement.found) return { ...placement, ok: false };
    if (!placement.movable) return { ...placement, ok: false };
    const element = findById(model, id);
    const raw = JSON.parse(text);
    const located = resolveRawElement(raw, element.sourcePath);
    if (!located) return { ok: false, reason: "unresolved", id };
    const x = clamp(
      roundCoordinate(element.x - placement.origin.x + dx),
      COORDINATE_MIN,
      COORDINATE_MAX,
    );
    const y = clamp(
      roundCoordinate(element.y - placement.origin.y + dy),
      COORDINATE_MIN,
      COORDINATE_MAX,
    );
    if (x === located.element.x && y === located.element.y) {
      return { ok: false, reason: "unchanged", id, x, y };
    }
    located.element.x = x;
    located.element.y = y;
    return commit(raw, { reason: "moved", id, x, y, type: element.type });
  }

  /**
   * group から layout を外し、その時点で layout が計算していた
   * x / y / width / height を全ての流し込み子へ書き出す。
   *
   * スキーマ上 layout を持たない親の子は x / y / width / height が必須
   * （boxRequired）なので 4 つとも書く必要がある。同じ値を書くので
   * 解除の前後で図の見た目は変わらない。
   */
  function releaseLayout(groupId) {
    const { source: text, model } = current();
    const group = findById(model, groupId);
    if (!group) return { ok: false, reason: "unknown", id: groupId };
    if (group.type !== "group") return { ok: false, reason: "not-a-group", id: groupId };
    if (!group.layout) return { ok: false, reason: "not-layout-managed", id: groupId };
    const raw = JSON.parse(text);
    const located = resolveRawElement(raw, group.sourcePath);
    if (!located) return { ok: false, reason: "unresolved", id: groupId };
    const children = Array.isArray(located.element.children) ? located.element.children : [];
    let released = 0;
    children.forEach((child, index) => {
      if (!isPlainObject(child)) return;
      if (child.type !== "node" && child.type !== "group") return;
      const placed = findBySourcePath(model, `${group.sourcePath}.children[${index}]`);
      if (!placed) return;
      child.x = clamp(roundCoordinate(placed.x - group.x), COORDINATE_MIN, COORDINATE_MAX);
      child.y = clamp(roundCoordinate(placed.y - group.y), COORDINATE_MIN, COORDINATE_MAX);
      child.width = clamp(roundCoordinate(placed.width), EXTENT_MIN, EXTENT_MAX);
      child.height = clamp(roundCoordinate(placed.height), EXTENT_MIN, EXTENT_MAX);
      released += 1;
    });
    delete located.element.layout;
    return commit(raw, {
      reason: "layout-released",
      id: groupId,
      layoutType: group.layout.type,
      released,
    });
  }

  function undo() {
    if (cursor === 0) return { ok: false, reason: "no-history" };
    cursor -= 1;
    return { ok: true, reason: "undone", source: current().source, model: current().model };
  }

  function redo() {
    if (cursor >= entries.length - 1) return { ok: false, reason: "no-history" };
    cursor += 1;
    return { ok: true, reason: "redone", source: current().source, model: current().model };
  }

  return {
    get source() {
      return current().source;
    },
    get model() {
      return current().model;
    },
    get canUndo() {
      return cursor > 0;
    },
    get canRedo() {
      return cursor < entries.length - 1;
    },
    get depth() {
      return entries.length;
    },
    describe: (id) => describePlacement(current().model, id),
    move,
    releaseLayout,
    undo,
    redo,
  };
}
