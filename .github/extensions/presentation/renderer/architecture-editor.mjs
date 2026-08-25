// ```architecture ブロックの編集 UI（DOM 層）。
//
// コア（architecture-edit.mjs）が「DSL 全文 → 新しい DSL 全文」を担当し、
// ここは入力（ポインタ / キーボード）と再描画だけを担当する。
//
// 再描画は毎回 renderArchitectureBlock を通す。こうすると planConnectorRoutes が
// 走り直すのでコネクターが自動で追従する（ノードだけ transform で動かすと
// 線が置き去りになる、というのが PoC の壊れ方だった）。
//
// このモジュールは編集モードでしか import 元から呼ばれない。通常表示・presenter・
// 印刷では attach 自体が行われないので、編集 UI が混入する余地がない。

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

/** SVG のユーザー単位あたりの画面ピクセル数。ドラッグ量の換算に使う。 */
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
 * 編集 UI を container に取り付ける。
 *
 * @param {Element} container 編集 UI が専有する要素
 * @param {object} options
 *   - source: 編集対象の DSL 全文
 *   - documentRef: DOM document
 *   - onCommit: 確定した DSL 全文を受け取るコールバック（永続化に使う）
 * @returns {{destroy():void, getSource():string}|null} 図が不正なら null
 */
export function attachArchitectureEditor(container, options = {}) {
  const documentRef = options.documentRef ?? globalThis.document;
  const onCommit = typeof options.onCommit === "function" ? options.onCommit : null;
  let session;
  try {
    session = createArchitectureEditSession(options.source);
  } catch (_) {
    // 図が壊れている状態では編集させない（レンダラーがエラー表示を出している）。
    return null;
  }

  container.classList.add("architecture-editor");
  container.setAttribute("data-architecture-edit", "on");

  const toolbar = documentRef.createElement("div");
  toolbar.className = "architecture-editor-toolbar";
  toolbar.setAttribute("role", "toolbar");
  toolbar.setAttribute("aria-label", "図の編集");

  const undoButton = createButton("元に戻す (Ctrl+Z)", "undo");
  const redoButton = createButton("やり直す (Ctrl+Y)", "redo");
  const releaseButton = createButton("レイアウト解除 (L)", "release");
  const status = documentRef.createElement("span");
  status.className = "architecture-editor-status";
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");
  status.setAttribute("data-architecture-edit-status", "idle");

  // 保存結果の表示。status とは別に持つ理由: status は次の操作ですぐ上書きされる
  // ので、保存に失敗したという事実が消えてしまう。保存失敗は「編集が実際に
  // 失われている」状態なので、次に保存が成功するまで出したままにする。
  const saveState = documentRef.createElement("span");
  saveState.className = "architecture-editor-save";
  saveState.setAttribute("role", "status");
  saveState.setAttribute("aria-live", "polite");
  saveState.setAttribute("data-architecture-save-state", "idle");

  toolbar.append(undoButton, redoButton, releaseButton, status, saveState);

  const surface = documentRef.createElement("div");
  surface.className = "architecture-editor-surface";

  container.append(toolbar, surface);

  let selectedId = null;
  let drag = null;
  let svg = null;
  // 保存応答の追い越し対策。最後に投げた保存だけが表示を書き換えられる。
  let saveToken = 0;
  // 移動を連打しても、前の保存応答（deckVersion）を受け取ってから次を送る。
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

  /** 保存結果を利用者に見える形で出す。失敗は次の成功まで残す。 */
  function reportSave(state, text) {
    saveState.textContent = text;
    saveState.setAttribute("data-architecture-save-state", state);
  }

  /**
   * 確定した DSL を永続化し、その結果を必ず画面へ出す。
   *
   * ここを投げっぱなしにすると、サーバーが 409 / 404 / 413 で拒否しても利用者には
   * 保存できたように見え、編集が黙って消える。このフェーズが潰したかった
   * 「黙って無視される」挙動そのものなので、成否は必ず表示する。
   */
  async function commitAndReport(source) {
    if (!onCommit) return;
    const token = ++saveToken;
    reportSave("saving", "保存中…");
    let result;
    try {
      const pending = commitQueue.catch(() => {}).then(() => onCommit(source));
      commitQueue = pending;
      result = await pending;
    } catch (e) {
      result = { ok: false, message: e?.message || "不明なエラー" };
    }
    // 追い越された古い応答で新しい状態を上書きしない。
    if (token !== saveToken) return;
    // 成功と言い切れるとき **だけ** 成功にする。onCommit が結果を返し忘れた場合も
    // 「失敗」側へ倒す: 保存できたと嘘をつくより、できていないと言う方が安全。
    if (result?.ok === true) {
      reportSave(
        "saved",
        result.fileSaved ? "元 Markdown に保存しました。" : "canvas に保存しました。",
      );
      return;
    }
    const message = result?.message || "保存結果を確認できませんでした";
    reportSave("failed", `保存できませんでした: ${message}。この編集はまだ保存されていません。`);
  }

  function refreshToolbar() {
    undoButton.disabled = !session.canUndo;
    redoButton.disabled = !session.canRedo;
    const placement = selectedId ? session.describe(selectedId) : null;
    releaseButton.disabled = !placement || placement.reason !== "layout-managed";
  }

  /** 図を作り直す。コネクターの再ルーティングはここで自動的に行われる。 */
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
      announce(`${id} を選択しました。矢印キーで移動できます。`, "selected");
    }
  }

  function announcePlacement(placement) {
    announce(
      `${placement.id} は group「${placement.layoutOwner}」の layout (${placement.layoutType}) が` +
        "位置を決めているため、そのままでは動かせません。L キー（レイアウト解除）で" +
        "現在の配置を座標として書き出すと移動できます。",
      "layout-managed",
    );
  }

  /** セッションからの戻り値を UI へ反映する共通経路。 */
  function applyResult(result) {
    if (!result?.ok) {
      if (result?.reason === "layout-managed") announcePlacement(result);
      else if (result?.reason === "no-history") announce("これ以上戻す / 進む履歴はありません。", "no-history");
      else if (result?.reason === "not-layout-managed") announce("この要素は layout の管理下にありません。", "not-layout-managed");
      else if (result?.reason === "rejected") announce(`編集を適用できませんでした: ${result.message}`, "rejected");
      else if (result?.reason === "unchanged") announce("位置は変わりませんでした。", "unchanged");
      refreshToolbar();
      return false;
    }
    renderDiagram();
    const node = nodeFor(selectedId);
    node?.focus?.();
    if (result.reason === "moved") {
      announce(`${result.id} を x ${result.x}, y ${result.y} へ移動しました。`, "moved");
    } else if (result.reason === "layout-released") {
      announce(
        `group「${result.id}」の layout (${result.layoutType}) を解除し、` +
          `子要素 ${result.released} 件を座標として書き出しました。移動できます。`,
        "layout-released",
      );
    } else if (result.reason === "undone") {
      announce("直前の編集を元に戻しました。", "undone");
    } else if (result.reason === "redone") {
      announce("編集をやり直しました。", "redone");
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
      announce("この要素は layout の管理下にありません。", "not-layout-managed");
      return;
    }
    // 解除するのは「選択中の要素」ではなく「その配置を決めている group」。
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
      // スライド送りへ伝播させない（← → はナビゲーションと衝突する）。
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
    // 確定までは transform で見た目だけ動かす（毎フレーム再パースしない）。
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
    // 通常表示では図全体で 1 タブストップにするため architecture.mjs が
    // ルート <svg> に tabindex="0" を付ける。編集モードでは要素そのものが
    // タブストップになるので、ルートを残すと「図」→「最初の要素」と
    // 空振りのストップが 1 つ増える。ここで取り下げる。
    target.removeAttribute("tabindex");
    // NOTE: Tab 順は DOM 順、すなわち描画順（z 順）であって宣言順ではない。
    // SVG は DOM 順がそのまま重なり順なので、宣言順に並べ替えると見た目が変わる。
    // 宣言順が要る処理は data-architecture-order を読むこと（README「読み上げ順」参照）。
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

  const ownerDocument = container.ownerDocument ?? documentRef;
  ownerDocument.addEventListener("pointermove", onPointerMove);
  ownerDocument.addEventListener("pointerup", onPointerUp);
  ownerDocument.addEventListener("pointercancel", onPointerUp);

  renderDiagram();
  announce("編集モードです。図の要素を選んで矢印キーまたはドラッグで移動できます。", "ready");

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
