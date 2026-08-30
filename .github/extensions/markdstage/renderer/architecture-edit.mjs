// Editing workflow for ```architecture blocks (DOM-independent core).
//
// Three key design points:
//
// 1. Write editing results back to the source DSL itself.
//    The previous PoC copied {version, overrides:[{id,x,y}]} JSON to the clipboard,
//    but parseArchitecture accepts only $schema / version / canvas / title /
//    description / elements at the top level, and no implementation consumed
//    overrides. It was a dead-end format with nowhere to paste it. This module
//    instead returns the complete DSL with element x / y values updated directly.
//    Saving then requires only replacing the block in the source Markdown.
//
// 2. Model coordinates are absolute; DSL coordinates are relative to the parent group.
//    normalizeBox adds the parent's origin, so writing back must subtract the
//    parent group's absolute coordinates. Omitting this breaks nested diagrams.
//
// 3. A child of a group with a layout *silently ignores* explicit x / y values.
//    layoutPlacements filters children only by type, with no fixed / flow distinction,
//    and normalizeBox prioritizes placement (placement?.x ?? element.x). About 68%
//    of nodes in repository data meet this condition. Rather than pretending to
//    move them and ignoring the edit, detect it, explain why, and provide
//    releaseLayout so users can explicitly release the layout.

import { normalizeArchitectureSource, parseArchitecture } from "./architecture.mjs";

/** Standard movement increment in canvas coordinates. */
export const EDIT_STEP = 10;
/** Fine movement increment while Shift is held. */
export const EDIT_FINE_STEP = 1;
/** Default maximum number of edits stored in history. */
export const EDIT_HISTORY_LIMIT = 100;

// Same range as schema coordinate / extent. Values outside it fail reparsing,
// so clamp before writing back.
const COORDINATE_MIN = -4000;
const COORDINATE_MAX = 4000;
const EXTENT_MIN = 1;
const EXTENT_MAX = 4000;
// Layout calculations produce fractional values. Excessive rounding shifts the
// diagram when releasing layout, so retain precision to 1/10000 canvas units,
// below the threshold of visual impact.
const COORDINATE_PRECISION = 4;

function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function roundCoordinate(value) {
  const rounded = Number(value.toFixed(COORDINATE_PRECISION));
  // Normalize -0 to 0 because JSON renders it as "-0", creating noisy diffs.
  return Object.is(rounded, -0) ? 0 : rounded;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

/**
 * Parse a sourcePath such as `elements[0].children[2]` into
 * [{key:"elements",index:0},{key:"children",index:2}].
 * Return null for unexpected forms so the caller aborts the write-back.
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
    // Consume "." only when another segment follows; otherwise a trailing dot
    // such as "elements[0]." would be accepted.
    if (match !== null && sourcePath[cursor] === ".") cursor += 1;
  }
  if (segments.length === 0 || cursor !== sourcePath.length) return null;
  return segments;
}

/**
 * Get the sourcePath element from raw JSON.
 * parent is the group whose children contains the element, or null for a top-level element.
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

/** sourcePath of the parent group, or null for a top-level element. */
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
 * Return what ultimately determines the element's position.
 * When movable is false, include the layout-managed reason and the group ID to release.
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

/** Serialize the edited DSL with stable two-space formatting. */
export function serializeArchitecture(raw) {
  return `${JSON.stringify(raw, null, 2)}\n`;
}

/**
 * Editing session that keeps source (the complete DSL) synchronized with the model
 * and adds the complete new DSL to history after each change.
 * One edit equals one snapshot, so undo / redo only moves the history index.
 */
export function createArchitectureEditSession(source, options = {}) {
  const limit = Math.max(1, Math.trunc(options.historyLimit ?? EDIT_HISTORY_LIMIT));
  const entries = [snapshot(source)];
  let cursor = 0;

  function snapshot(text) {
    const normalized = normalizeArchitectureSource(text);
    return { source: normalized, model: parseArchitecture(normalized) };
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
      // Do not add invalid rewritten DSL to history, preventing broken diagrams from being saved.
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
   * Remove layout from a group and write the x / y / width / height calculated
   * by that layout to every flowed child.
   *
   * The schema requires all four values for children of a parent without a layout
   * (boxRequired). Writing the calculated values preserves the diagram's appearance.
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
