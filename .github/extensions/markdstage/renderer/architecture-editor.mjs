// Editing UI for ```architecture blocks (DOM layer).
//
// The core (architecture-edit.mjs) converts the complete DSL to a new complete DSL.
// This module handles only pointer / keyboard input and rerendering.
//
// Every rerender uses renderArchitectureBlock so planConnectorRoutes runs again
// and connectors follow automatically. The PoC failed by transforming only nodes,
// leaving connector lines behind.
//
// Importers call this module only in editing mode. Normal view, presenter view,
// and printing never call attach, so the editing UI cannot leak into them.

import { renderArchitectureBlock } from "./architecture.mjs";
import {
  EDIT_FINE_STEP,
  EDIT_STEP,
  createArchitectureEditSession,
} from "./architecture-edit.mjs";

const ARROW_DELTAS = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
};

const SELECTABLE = '[data-architecture-type="node"],[data-architecture-type="group"]';

/** Screen pixels per SVG user unit, used to convert drag distance. */
function viewBoxScale(svg) {
  const ctm = svg.getScreenCTM?.();
  if (ctm && Number.isFinite(ctm.a) && ctm.a !== 0 && Number.isFinite(ctm.d) && ctm.d !== 0) {
    return { x: ctm.a, y: ctm.d };
  }
  const rect = svg.getBoundingClientRect?.();
  const box = svg.viewBox?.baseVal;
  if (!rect?.width || !box?.width || !box?.height) return { x: 1, y: 1 };
  const scale = Math.min(rect.width / box.width, rect.height / box.height);
  return { x: scale || 1, y: scale || 1 };
}

/**
 * Attach the editing UI to container.
 *
 * @param {Element} container Element dedicated to the editing UI
 * @param {object} options
 *   - source: Complete DSL being edited
 *   - documentRef: DOM document
 *   - onCommit: Callback receiving the committed complete DSL, used for persistence
 *   - canOpenDetail: true when the source Markdown can be identified
 *   - onOpenDetail: Callback that opens the dedicated Architecture Editor canvas
 * @returns {{destroy():void, getSource():string}|null} null when the diagram is invalid
 */
export function attachArchitectureEditor(container, options = {}) {
  const documentRef = options.documentRef ?? globalThis.document;
  const onCommit = typeof options.onCommit === "function" ? options.onCommit : null;
  const onOpenDetail =
    typeof options.onOpenDetail === "function" ? options.onOpenDetail : null;
  const canOpenDetail = Boolean(options.canOpenDetail && onOpenDetail);
  let session;
  try {
    session = createArchitectureEditSession(options.source);
  } catch (_) {
    // Do not allow editing an invalid diagram; the renderer already displays the error.
    return null;
  }

  container.classList.add("architecture-editor");
  container.setAttribute("data-architecture-edit", "on");

  const toolbar = documentRef.createElement("div");
  toolbar.className = "architecture-editor-toolbar";
  toolbar.setAttribute("role", "toolbar");
  toolbar.setAttribute("aria-label", "Edit diagram");

  const undoButton = createButton("Undo (Ctrl+Z)", "undo");
  const redoButton = createButton("Redo (Ctrl+Y)", "redo");
  const releaseButton = createButton("Release layout (L)", "release");
  const detailButton = createButton("Advanced edit", "detail");
  detailButton.disabled = !canOpenDetail;
  detailButton.title = canOpenDetail
    ? "Open in the dedicated Architecture Editor"
    : "Available after loading Markdown with the canvas file picker";
  const status = documentRef.createElement("span");
  status.className = "architecture-editor-status";
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");
  status.setAttribute("data-architecture-edit-status", "idle");

  // Save result display. Keep it separate from status because the next operation
  // immediately overwrites status and would hide the failure. A failed save means
  // edits were actually lost, so display it until the next successful save.
  const saveState = documentRef.createElement("span");
  saveState.className = "architecture-editor-save";
  saveState.setAttribute("role", "status");
  saveState.setAttribute("aria-live", "polite");
  saveState.setAttribute("data-architecture-save-state", "idle");

  toolbar.append(undoButton, redoButton, releaseButton, detailButton, status, saveState);

  const surface = documentRef.createElement("div");
  surface.className = "architecture-editor-surface";

  container.append(toolbar, surface);

  let selectedId = null;
  let drag = null;
  let svg = null;
  // Prevent out-of-order save responses; only the latest request may update the display.
  let saveToken = 0;
  // Even during repeated moves, wait for the previous save response (deckVersion) before sending the next.
  let commitQueue = Promise.resolve();

  function createButton(label, action) {
    const button = documentRef.createElement("button");
    button.type = "button";
    button.className = "architecture-editor-button";
    button.textContent = label;
    button.setAttribute("data-architecture-edit-action", action);
    return button;
  }

  function announce(text, reason) {
    status.textContent = text;
    status.setAttribute("data-architecture-edit-status", reason);
  }

  /** Display the save result to the user. Keep failures visible until the next success. */
  function reportSave(state, text) {
    saveState.textContent = text;
    saveState.setAttribute("data-architecture-save-state", state);
  }

  /**
   * Persist committed DSL and always display the result.
   *
   * Fire-and-forget would make a server rejection with 409 / 404 / 413 look
   * successful, silently discarding the edit. Always display success or failure
   * to eliminate precisely that silent-ignore behavior.
   */
  async function commitAndReport(source) {
    if (!onCommit) return;
    const token = ++saveToken;
    reportSave("saving", "Saving…");
    let result;
    try {
      const pending = commitQueue.catch(() => {}).then(() => onCommit(source));
      commitQueue = pending;
      result = await pending;
    } catch (e) {
      result = { ok: false, message: e?.message || "Unknown error" };
    }
    // Do not let an overtaken response overwrite newer state.
    if (token !== saveToken) return;
    // Report success **only** when confirmed. Treat a missing onCommit result as
    // failure; it is safer to report an unsaved edit than falsely claim success.
    if (result?.ok === true) {
      reportSave(
        "saved",
        result.fileSaved ? "Saved to the source Markdown." : "Saved to the canvas.",
      );
      return;
    }
    const message = result?.message || "Could not verify the save result";
    reportSave("failed", `Could not save: ${message}. This edit has not been saved.`);
  }

  function refreshToolbar() {
    undoButton.disabled = !session.canUndo;
    redoButton.disabled = !session.canRedo;
    const placement = selectedId ? session.describe(selectedId) : null;
    releaseButton.disabled = !placement || placement.reason !== "layout-managed";
  }

  /** Rebuild the diagram. Connector rerouting occurs automatically here. */
  function renderDiagram() {
    const wrapper = renderArchitectureBlock(session.source, documentRef);
    surface.replaceChildren(wrapper);
    svg = wrapper.querySelector("svg");
    if (svg) {
      wireSvg(svg);
      svg.setAttribute("data-architecture-edit-surface", "true");
    }
    restoreSelection();
    refreshToolbar();
  }

  function nodeFor(id) {
    if (!svg || !id) return null;
    return svg.querySelector(`[data-architecture-id="${CSS.escape(id)}"]`);
  }

  function restoreSelection() {
    if (!selectedId) return;
    const node = nodeFor(selectedId);
    if (!node) {
      selectedId = null;
      return;
    }
    node.classList.add("architecture-selected");
    node.setAttribute("data-architecture-selected", "true");
  }

  function select(id, { focus = false } = {}) {
    if (selectedId && selectedId !== id) {
      const previous = nodeFor(selectedId);
      previous?.classList.remove("architecture-selected");
      previous?.removeAttribute("data-architecture-selected");
    }
    selectedId = id;
    const node = nodeFor(id);
    if (node) {
      node.classList.add("architecture-selected");
      node.setAttribute("data-architecture-selected", "true");
      if (focus) node.focus?.();
    }
    refreshToolbar();
    if (!id) {
      announce("", "idle");
      return;
    }
    const placement = session.describe(id);
    if (placement.reason === "layout-managed") {
      announcePlacement(placement);
    } else {
      announce(`Selected ${id}. Use the arrow keys to move it.`, "selected");
    }
  }

  function announcePlacement(placement) {
    announce(
      `${placement.id} cannot move directly because the layout (${placement.layoutType}) of group ` +
        `"${placement.layoutOwner}" controls its position. Press L (Release layout) to write ` +
        "the current placement as coordinates, then move the element.",
      "layout-managed",
    );
  }

  /** Shared path for applying session results to the UI. */
  function applyResult(result) {
    if (!result?.ok) {
      if (result?.reason === "layout-managed") announcePlacement(result);
      else if (result?.reason === "no-history") announce("No more undo or redo history.", "no-history");
      else if (result?.reason === "not-layout-managed") announce("This element is not managed by a layout.", "not-layout-managed");
      else if (result?.reason === "rejected") announce(`Could not apply edit: ${result.message}`, "rejected");
      else if (result?.reason === "unchanged") announce("The position did not change.", "unchanged");
      refreshToolbar();
      return false;
    }
    renderDiagram();
    const node = nodeFor(selectedId);
    node?.focus?.();
    if (result.reason === "moved") {
      announce(`Moved ${result.id} to x ${result.x}, y ${result.y}.`, "moved");
    } else if (result.reason === "layout-released") {
      announce(
        `Released layout (${result.layoutType}) from group "${result.id}" and wrote ` +
          `coordinates for ${result.released} child elements. They can now move.`,
        "layout-released",
      );
    } else if (result.reason === "undone") {
      announce("Undid the previous edit.", "undone");
    } else if (result.reason === "redone") {
      announce("Redid the edit.", "redone");
    }
    void commitAndReport(session.source);
    return true;
  }

  function moveSelected(dx, dy) {
    if (!selectedId) return;
    applyResult(session.move(selectedId, dx, dy));
  }

  function releaseSelected() {
    if (!selectedId) return;
    const placement = session.describe(selectedId);
    if (placement.reason !== "layout-managed") {
      announce("This element is not managed by a layout.", "not-layout-managed");
      return;
    }
    // Release the group controlling placement, not the selected element.
    const result = session.releaseLayout(placement.layoutOwner);
    applyResult(result);
  }

  function onKeyDown(event) {
    const id = event.currentTarget?.dataset?.architectureId;
    if (!id) return;
    if (event.ctrlKey || event.metaKey) {
      const key = event.key.toLowerCase();
      if (key === "z") {
        event.preventDefault();
        event.stopPropagation();
        applyResult(event.shiftKey ? session.redo() : session.undo());
      } else if (key === "y") {
        event.preventDefault();
        event.stopPropagation();
        applyResult(session.redo());
      }
      return;
    }
    const delta = ARROW_DELTAS[event.key];
    if (delta) {
      // Prevent propagation to slide navigation because ← and → conflict with navigation.
      event.preventDefault();
      event.stopPropagation();
      select(id);
      const step = event.shiftKey ? EDIT_FINE_STEP : EDIT_STEP;
      moveSelected(delta[0] * step, delta[1] * step);
      return;
    }
    if (event.key === "l" || event.key === "L") {
      event.preventDefault();
      event.stopPropagation();
      select(id);
      releaseSelected();
      return;
    }
    if (event.key === "Escape") {
      event.stopPropagation();
      select(null);
    }
  }

  function onPointerDown(event) {
    const target = event.currentTarget;
    const id = target?.dataset?.architectureId;
    if (!id) return;
    if (typeof event.button === "number" && event.button !== 0) return;
    event.stopPropagation();
    select(id, { focus: true });
    const placement = session.describe(id);
    if (!placement.movable) return;
    event.preventDefault();
    target.setPointerCapture?.(event.pointerId);
    drag = {
      id,
      target,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      dx: 0,
      dy: 0,
      moved: false,
    };
  }

  function onPointerMove(event) {
    if (!drag || event.pointerId !== drag.pointerId) return;
    const scale = viewBoxScale(svg);
    drag.dx = (event.clientX - drag.startX) / (scale.x || 1);
    drag.dy = (event.clientY - drag.startY) / (scale.y || 1);
    if (Math.abs(drag.dx) >= 0.5 || Math.abs(drag.dy) >= 0.5) drag.moved = true;
    // Move only the visual transform until commit; do not reparse every frame.
    drag.target.setAttribute("transform", `translate(${drag.dx} ${drag.dy})`);
  }

  function onPointerUp(event) {
    if (!drag || event.pointerId !== drag.pointerId) return;
    const pending = drag;
    drag = null;
    pending.target.releasePointerCapture?.(pending.pointerId);
    pending.target.removeAttribute("transform");
    if (!pending.moved) return;
    applyResult(session.move(pending.id, pending.dx, pending.dy));
  }

  function wireSvg(target) {
    // In normal view, architecture.mjs adds tabindex="0" to the root <svg> so the
    // complete diagram is one tab stop. Editing mode makes each element a tab stop;
    // retaining the root would add an empty stop between the diagram and first
    // element, so remove it here.
    target.removeAttribute("tabindex");
    // NOTE: Tab order follows DOM order (rendering/z order), not declaration order.
    // SVG DOM order is also stacking order, so sorting by declaration would change
    // appearance. Code requiring declaration order must read data-architecture-order
    // (see "Reading order" in the README).
    target.querySelectorAll(SELECTABLE).forEach((node) => {
      const placement = session.describe(node.dataset.architectureId);
      node.setAttribute("tabindex", "0");
      node.setAttribute("aria-keyshortcuts", "ArrowUp ArrowRight ArrowDown ArrowLeft L");
      node.setAttribute(
        "data-architecture-movable",
        placement.movable ? "true" : "false",
      );
      if (!placement.movable) {
        node.setAttribute("data-architecture-layout-owner", placement.layoutOwner ?? "");
      }
      node.addEventListener("pointerdown", onPointerDown);
      node.addEventListener("keydown", onKeyDown);
      node.addEventListener("focus", () => select(node.dataset.architectureId));
    });
    target.addEventListener("pointerdown", () => select(null));
  }

  undoButton.addEventListener("click", () => applyResult(session.undo()));
  redoButton.addEventListener("click", () => applyResult(session.redo()));
  releaseButton.addEventListener("click", () => releaseSelected());
  detailButton.addEventListener("click", async () => {
    if (!canOpenDetail) {
      announce(
        "Advanced editing requires a source Markdown association. Load Markdown with the canvas file picker.",
        "source-not-available",
      );
      return;
    }
    detailButton.disabled = true;
    announce("Opening the dedicated Architecture Editor…", "opening-detail");
    try {
      const result = await onOpenDetail();
      if (result?.ok === true) {
        announce("Opened the dedicated Architecture Editor.", "detail-opened");
      } else {
        announce(
          result?.message || "Could not open the dedicated Architecture Editor.",
          "detail-open-failed",
        );
      }
    } catch (error) {
      announce(
        error?.message || "Could not open the dedicated Architecture Editor.",
        "detail-open-failed",
      );
    } finally {
      detailButton.disabled = !canOpenDetail;
    }
  });

  const ownerDocument = container.ownerDocument ?? documentRef;
  ownerDocument.addEventListener("pointermove", onPointerMove);
  ownerDocument.addEventListener("pointerup", onPointerUp);
  ownerDocument.addEventListener("pointercancel", onPointerUp);

  renderDiagram();
  announce("Editing mode. Select a diagram element and move it with the arrow keys or by dragging.", "ready");

  return {
    getSource: () => session.source,
    destroy() {
      ownerDocument.removeEventListener("pointermove", onPointerMove);
      ownerDocument.removeEventListener("pointerup", onPointerUp);
      ownerDocument.removeEventListener("pointercancel", onPointerUp);
      container.replaceChildren();
      container.classList.remove("architecture-editor");
      container.removeAttribute("data-architecture-edit");
    },
  };
}
