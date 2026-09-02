import {
  ICONS,
  LAYOUTS,
  LAYOUT_DIRECTIONS,
  THEME_TOKENS,
  parseArchitecture,
  renderArchitectureBlock,
} from "../renderer/architecture.mjs";
import { createArchitectureDocument } from "../renderer/architecture-document.mjs";

const COLORS = [...Object.keys(THEME_TOKENS), "black", "white", "transparent", "none"];
const PORTS = ["auto", "top", "right", "bottom", "left"];
const ROUTING = ["straight", "orthogonal", "polyline"];
const LABEL_LAYERS = [
  { value: "front", label: "In front of boxes" },
  { value: "behind", label: "Behind boxes" },
];
const SHAPES = ["rect", "rounded-rect", "ellipse"];
const IMAGE_FITS = ["contain", "cover", "stretch"];
const ASSET_MAX_BYTES = 10 * 1024 * 1024;
const SNAP_SIZE = 10;
const SVG_NS = "http://www.w3.org/2000/svg";
const SHARED_LAYOUT_KEYS = ["gap", "rowGap", "columnGap", "padding"];

const sourceLabel = document.getElementById("sourceLabel");
const dirtyBadge = document.getElementById("dirtyBadge");
const tree = document.getElementById("elementTree");
const inspector = document.getElementById("inspector");
const viewport = document.getElementById("viewport");
const surface = document.getElementById("canvasSurface");
const status = document.getElementById("status");
const zoomStatus = document.getElementById("zoomStatus");
const snapToggle = document.getElementById("snapToggle");
const contextMenu = document.getElementById("contextMenu");
const assetDialog = document.getElementById("assetDialog");
const assetDialogTitle = document.getElementById("assetDialogTitle");
const assetDialogClose = document.getElementById("assetDialogClose");
const assetSearch = document.getElementById("assetSearch");
const assetImportButton = document.getElementById("assetImportButton");
const assetFileInput = document.getElementById("assetFileInput");
const assetList = document.getElementById("assetList");
const assetPreviewImageHost = document.getElementById("assetPreviewImageHost");
const assetPreviewEmpty = document.getElementById("assetPreviewEmpty");
const assetPreviewPath = document.getElementById("assetPreviewPath");
const assetDialogStatus = document.getElementById("assetDialogStatus");
const assetCancelButton = document.getElementById("assetCancelButton");
const assetChooseButton = document.getElementById("assetChooseButton");

let architecture = null;
let selectedRef = null;
let sourcePath = "";
let blockIndex = 0;
let dirty = false;
let zoom = 1;
let draftRevision = 0;
let targetGeneration = null;
let draftQueue = Promise.resolve();
let drag = null;
let pan = null;
let spacePressed = false;
let connectorTool = null;
let serverVersion = -1;
let contextMenuState = null;
let assetPickerState = null;
let availableAssets = [];
let selectedAssetPath = "";
let assetUploadPending = false;
let assetLibraryRequest = 0;

function announce(message, kind = "info") {
  status.textContent = message;
  status.dataset.kind = kind;
}

function setDirty(value) {
  dirty = Boolean(value);
  dirtyBadge.hidden = !dirty;
  document.querySelector('[data-action="save"]').disabled = !dirty;
}

function snap(value) {
  return snapToggle.checked ? Math.round(value / SNAP_SIZE) * SNAP_SIZE : value;
}

function viewBoxScale(svg) {
  const ctm = svg?.getScreenCTM?.();
  if (ctm && ctm.a && ctm.d) return { x: ctm.a, y: ctm.d };
  return { x: 1, y: 1 };
}

function rawEntries(raw) {
  const entries = [];
  const walk = (items, depth, parentId, prefix) => {
    if (!Array.isArray(items)) return;
    items.forEach((element, index) => {
      const sourcePath = `${prefix}[${index}]`;
      entries.push({
        element,
        depth,
        parentId,
        sourcePath,
        ref: element.id || sourcePath,
      });
      if (element.type === "group") {
        walk(element.children, depth + 1, element.id, `${sourcePath}.children`);
      }
    });
  };
  walk(raw.elements, 0, null, "elements");
  return entries;
}

function entryFor(ref) {
  return rawEntries(architecture.raw).find(
    (entry) => entry.ref === ref || entry.sourcePath === ref,
  ) || null;
}

function modelFor(ref) {
  return architecture.model.elements.find(
    (element) => element.id === ref || element.sourcePath === ref,
  ) || null;
}

function endpointOptions() {
  return architecture.model.elements
    .filter((element) => element.type !== "connector")
    .map((element) => ({ value: element.id, label: element.id }));
}

function queueDraft() {
  const source = architecture.source;
  const revision = ++draftRevision;
  const generation = targetGeneration;
  setDirty(true);
  draftQueue = draftQueue
    .catch(() => {})
    .then(async () => {
      const response = await fetch("./draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source, revision, generation }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || result.ok !== true) {
        throw new Error(result.message || "Could not retain draft");
      }
      serverVersion = Math.max(serverVersion, result.version ?? serverVersion);
      return result;
    })
    .catch((error) => {
      announce(`Could not retain edits: ${error.message}`, "error");
      throw error;
    });
  return draftQueue;
}

function applyResult(result, { select = undefined, quiet = false } = {}) {
  if (!result?.ok) {
    const message =
      result?.reason === "layout-managed"
        ? `The layout of ${result.layoutOwner} controls the placement of ${result.id}.`
        : result?.message || `Could not apply action (${result?.reason || "unknown"})`;
    announce(message, "error");
    return false;
  }
  if (select !== undefined) selectedRef = select;
  else if (result.ref) selectedRef = result.ref;
  renderAll();
  queueDraft();
  if (!quiet) announce("Changed. The update will not affect the Markdown until you save.");
  return true;
}

function iconFor(type) {
  if (type === "node") return "▣";
  if (type === "group") return "▤";
  if (type === "image") return "▧";
  return "→";
}

function labelFor(entry) {
  const item = entry.element;
  if (item.type === "connector") return `${item.from} → ${item.to}`;
  const detail = item.text
    ? String(item.text).split("\n")[0]
    : item.title || (item.type === "image" ? item.src : "");
  return item.id + (detail ? ` — ${detail}` : "");
}

function contextMenuReturnTarget(state) {
  if (!state?.ref) return null;
  const selector = CSS.escape(state.ref);
  return state.origin === "tree"
    ? tree.querySelector(`.tree-item[data-ref="${selector}"]`)
    : surface.querySelector(`[data-editor-ref="${selector}"]`);
}

function closeContextMenu({ restoreFocus = false } = {}) {
  const previous = contextMenuState;
  contextMenuState = null;
  contextMenu.hidden = true;
  contextMenu.replaceChildren();
  if (restoreFocus) contextMenuReturnTarget(previous)?.focus();
}

function releaseLayoutAvailable(ref) {
  const entry = entryFor(ref);
  return entry?.element.type === "group" && Boolean(entry.element.layout);
}

function layoutTypeFor(ref) {
  const layout = entryFor(ref)?.element.layout;
  return typeof layout === "string" ? layout : layout?.type || "";
}

function updateGroupLayout(ref, type) {
  const entry = entryFor(ref);
  if (entry?.element.type !== "group") {
    return { ok: false, message: "Layouts can be changed only on groups." };
  }
  if (!type) return architecture.releaseLayout(ref);

  const current =
    typeof entry.element.layout === "string"
      ? { type: entry.element.layout }
      : entry.element.layout || {};
  const next = { type };
  for (const key of SHARED_LAYOUT_KEYS) {
    if (current[key] !== undefined) next[key] = current[key];
  }
  if (type === "grid" && current.columns !== undefined) next.columns = current.columns;
  if (type === "layered" && current.direction !== undefined) {
    next.direction = current.direction;
  }
  return architecture.setGroupLayout(ref, next);
}

function applyGroupLayout(ref, type) {
  const changed = applyResult(updateGroupLayout(ref, type), { quiet: true });
  if (changed) {
    announce(
      type
        ? `Changed the layout of ${ref} to ${type}.`
        : `Removed the layout from ${ref}.`,
    );
  }
  return changed;
}

function menuItemsFor({ ref, point }) {
  const entry = ref ? entryFor(ref) : null;
  if (!entry) {
    const suffix = point ? " here" : "";
    return [
      { label: `Add node${suffix}`, action: "add-node" },
      { label: `Add group${suffix}`, action: "add-group" },
      { label: `Add image${suffix}`, action: "add-image" },
      { separator: true },
      { label: "Undo", action: "undo", shortcut: "Ctrl+Z", disabled: !architecture.canUndo },
      { label: "Redo", action: "redo", shortcut: "Ctrl+Y", disabled: !architecture.canRedo },
      { separator: true },
      { label: "Save to Markdown", action: "save", shortcut: "Ctrl+S", disabled: !dirty },
    ];
  }

  const items = [];
  if (entry.element.type === "group") {
    const suffix = point ? " here" : "";
    items.push(
      { label: `Add child node${suffix}`, action: "add-node" },
      { label: `Add child group${suffix}`, action: "add-group" },
      { label: `Add child image${suffix}`, action: "add-image" },
      { separator: true },
      {
        label: "Layout",
        submenu: "layout",
        choices: [
          { label: "None", value: "" },
          ...[...LAYOUTS].map((type) => ({ label: type, value: type })),
        ],
      },
      { separator: true },
    );
  }
  if (entry.element.type !== "connector") {
    items.push({ label: "Start connector here", action: "start-connector" }, { separator: true });
  }
  items.push(
    { label: "Duplicate", action: "duplicate", shortcut: "Ctrl+D" },
    { label: "Bring forward", action: "order-front" },
    { label: "Send backward", action: "order-back" },
  );
  items.push({ separator: true }, { label: "Delete", action: "delete", shortcut: "Delete", danger: true });
  return items;
}

function activateContextMenuItem(button) {
  if (button.disabled || !contextMenuState) return;
  const action = button.dataset.action;
  const actionContext = {
    ref: contextMenuState.ref,
    point: contextMenuState.point,
    returnFocus: contextMenuReturnTarget(contextMenuState),
  };
  if (action === "set-layout") actionContext.layoutType = button.dataset.layoutType || "";
  closeContextMenu();
  invokeAction(action, actionContext);
}

function directMenuItems(menu) {
  return [...menu.children]
    .map((child) =>
      child.matches(".context-menu-item")
        ? child
        : child.querySelector(":scope > .context-menu-item"),
    )
    .filter((item) => item && !item.disabled);
}

function closeContextSubmenu({ restoreFocus = false } = {}) {
  const trigger = contextMenu.querySelector('.context-menu-item[aria-expanded="true"]');
  if (!trigger) return;
  trigger.setAttribute("aria-expanded", "false");
  const submenu = trigger.parentElement.querySelector(":scope > .context-submenu");
  if (submenu) submenu.hidden = true;
  if (restoreFocus) trigger.focus();
}

function positionContextSubmenu(trigger, submenu) {
  submenu.style.left = "0px";
  submenu.style.top = "0px";
  const margin = 8;
  const gap = 4;
  const triggerBounds = trigger.getBoundingClientRect();
  const openRight = triggerBounds.right + gap + submenu.offsetWidth <= window.innerWidth - margin;
  const left = openRight
    ? triggerBounds.right + gap
    : triggerBounds.left - submenu.offsetWidth - gap;
  const top = Math.min(
    triggerBounds.top,
    window.innerHeight - submenu.offsetHeight - margin,
  );
  submenu.style.left = `${Math.max(margin, left)}px`;
  submenu.style.top = `${Math.max(margin, top)}px`;
}

function openContextSubmenu(trigger, { focusFirst = false } = {}) {
  if (trigger.disabled) return;
  closeContextSubmenu();
  const submenu = trigger.parentElement.querySelector(":scope > .context-submenu");
  if (!submenu) return;
  trigger.setAttribute("aria-expanded", "true");
  submenu.hidden = false;
  positionContextSubmenu(trigger, submenu);
  if (focusFirst) directMenuItems(submenu)[0]?.focus();
}

function createContextMenuButton(item, role = "menuitem") {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "context-menu-item";
  if (item.action) button.dataset.action = item.action;
  button.dataset.danger = item.danger ? "true" : "false";
  button.setAttribute("role", role);
  button.disabled = Boolean(item.disabled);
  button.setAttribute("aria-disabled", button.disabled ? "true" : "false");
  const label = document.createElement("span");
  label.textContent = item.label;
  button.appendChild(label);
  if (item.shortcut) {
    const shortcut = document.createElement("span");
    shortcut.className = "context-menu-shortcut";
    shortcut.textContent = item.shortcut;
    shortcut.setAttribute("aria-hidden", "true");
    button.appendChild(shortcut);
  }
  return button;
}

function appendContextSubmenu(item, ref) {
  const host = document.createElement("div");
  host.className = "context-menu-submenu-host";
  host.setAttribute("role", "none");
  const trigger = createContextMenuButton(item);
  trigger.dataset.submenu = item.submenu;
  trigger.setAttribute("aria-haspopup", "menu");
  trigger.setAttribute("aria-expanded", "false");
  const indicator = document.createElement("span");
  indicator.className = "context-menu-submenu-indicator";
  indicator.textContent = "›";
  indicator.setAttribute("aria-hidden", "true");
  trigger.appendChild(indicator);

  const submenu = document.createElement("div");
  submenu.className = "context-menu context-submenu";
  submenu.setAttribute("role", "menu");
  submenu.setAttribute("aria-label", `Layout for ${ref}`);
  submenu.hidden = true;
  const selected = layoutTypeFor(ref);
  for (const choice of item.choices) {
    const button = createContextMenuButton(
      { label: choice.label, action: "set-layout" },
      "menuitemradio",
    );
    button.dataset.layoutType = choice.value;
    const checked = choice.value === selected;
    button.setAttribute("aria-checked", checked ? "true" : "false");
    const mark = document.createElement("span");
    mark.className = "context-menu-check";
    mark.textContent = checked ? "✓" : "";
    mark.setAttribute("aria-hidden", "true");
    button.prepend(mark);
    button.addEventListener("click", () => activateContextMenuItem(button));
    submenu.appendChild(button);
  }
  trigger.addEventListener("click", () => openContextSubmenu(trigger, { focusFirst: true }));
  trigger.addEventListener("pointerenter", () => openContextSubmenu(trigger));
  host.addEventListener("pointerleave", () => {
    closeContextSubmenu({ restoreFocus: submenu.contains(document.activeElement) });
  });
  host.append(trigger, submenu);
  contextMenu.appendChild(host);
}

function openContextMenu({ clientX, clientY, ref = null, point = null, origin = "canvas" }) {
  closeContextMenu();
  contextMenuState = { ref, point, origin };
  contextMenu.setAttribute(
    "aria-label",
    ref ? `Editing actions for ${labelFor(entryFor(ref))}` : "Drawing area editing actions",
  );
  for (const item of menuItemsFor({ ref, point })) {
    if (item.separator) {
      const separator = document.createElement("hr");
      separator.className = "context-menu-separator";
      separator.setAttribute("role", "separator");
      contextMenu.appendChild(separator);
      continue;
    }
    if (item.submenu) {
      appendContextSubmenu(item, ref);
      continue;
    }
    const button = createContextMenuButton(item);
    button.addEventListener("click", () => activateContextMenuItem(button));
    button.addEventListener("pointerenter", () => closeContextSubmenu());
    contextMenu.appendChild(button);
  }
  contextMenu.hidden = false;
  contextMenu.style.left = "0px";
  contextMenu.style.top = "0px";
  const margin = 8;
  const left = Math.min(clientX, window.innerWidth - contextMenu.offsetWidth - margin);
  const top = Math.min(clientY, window.innerHeight - contextMenu.offsetHeight - margin);
  contextMenu.style.left = `${Math.max(margin, left)}px`;
  contextMenu.style.top = `${Math.max(margin, top)}px`;
  contextMenu.querySelector(".context-menu-item:not(:disabled)")?.focus();
}

function eventMenuPosition(target) {
  const bounds = target.getBoundingClientRect();
  return {
    clientX: bounds.left + Math.min(bounds.width, 40),
    clientY: bounds.top + Math.min(bounds.height, 24),
  };
}

function architecturePoint(clientX, clientY) {
  const svg = surface.querySelector("svg");
  const matrix = svg?.getScreenCTM?.();
  if (!svg || !matrix) return null;
  const source = svg.createSVGPoint();
  source.x = clientX;
  source.y = clientY;
  const point = source.matrixTransform(matrix.inverse());
  return { x: point.x, y: point.y };
}

function openElementContextMenu(ref, options) {
  const point =
    options.origin === "diagram"
      ? architecturePoint(options.clientX, options.clientY)
      : null;
  selectedRef = ref;
  connectorTool = null;
  renderAll();
  openContextMenu({ ...options, ref, point });
}

function openBlankContextMenu(options) {
  const point =
    options.origin === "canvas"
      ? architecturePoint(options.clientX, options.clientY)
      : null;
  selectedRef = null;
  connectorTool = null;
  renderAll();
  openContextMenu({ ...options, point });
}

function setAssetDialogStatus(message, kind = "info") {
  assetDialogStatus.textContent = message;
  assetDialogStatus.dataset.kind = kind;
}

function selectAsset(path) {
  selectedAssetPath = path || "";
  assetChooseButton.disabled = !selectedAssetPath || assetUploadPending;
  assetList.querySelectorAll(".asset-option").forEach((option) => {
    option.setAttribute(
      "aria-selected",
      option.dataset.path === selectedAssetPath ? "true" : "false",
    );
  });
  assetPreviewImageHost.replaceChildren();
  assetPreviewEmpty.hidden = Boolean(selectedAssetPath);
  assetPreviewPath.textContent = selectedAssetPath;
  if (selectedAssetPath) {
    const image = document.createElement("img");
    image.src = `/${selectedAssetPath}`;
    image.alt = "";
    assetPreviewImageHost.appendChild(image);
  }
}

function renderAssetLibrary() {
  const query = assetSearch.value.trim().toLocaleLowerCase();
  const matches = availableAssets.filter((asset) =>
    asset.path.toLocaleLowerCase().includes(query),
  );
  assetList.replaceChildren();
  if (!matches.length) {
    const empty = document.createElement("p");
    empty.className = "asset-list-empty";
    empty.textContent = query
      ? "No images match the search."
      : "No images are available in assets/.";
    assetList.appendChild(empty);
  }
  for (const asset of matches) {
    const option = document.createElement("button");
    option.type = "button";
    option.className = "asset-option";
    option.dataset.path = asset.path;
    option.setAttribute("role", "option");
    option.setAttribute("aria-selected", asset.path === selectedAssetPath ? "true" : "false");
    option.title = asset.path;
    const image = document.createElement("img");
    image.src = `/${asset.path}`;
    image.alt = "";
    const label = document.createElement("span");
    label.textContent = asset.path;
    option.append(image, label);
    option.addEventListener("click", () => selectAsset(asset.path));
    option.addEventListener("dblclick", () => {
      selectAsset(asset.path);
      confirmAssetSelection();
    });
    assetList.appendChild(option);
  }
  setAssetDialogStatus(`${matches.length} images`);
}

async function loadAssetLibrary(preferredPath = "", request = assetLibraryRequest) {
  setAssetDialogStatus("Loading images…");
  assetChooseButton.disabled = true;
  try {
    const response = await fetch("./asset-library");
    const result = await response.json().catch(() => ({}));
    if (request !== assetLibraryRequest || !assetDialog.open) return false;
    if (!response.ok || result.ok !== true || !Array.isArray(result.assets)) {
      throw new Error(result.message || "Could not retrieve the image list.");
    }
    availableAssets = result.assets;
    selectedAssetPath =
      preferredPath && availableAssets.some((asset) => asset.path === preferredPath)
        ? preferredPath
        : "";
    renderAssetLibrary();
    selectAsset(selectedAssetPath);
    return true;
  } catch (error) {
    if (request !== assetLibraryRequest || !assetDialog.open) return false;
    availableAssets = [];
    selectedAssetPath = "";
    renderAssetLibrary();
    setAssetDialogStatus(error.message, "error");
    return false;
  }
}

function restoreAssetPickerFocus(state) {
  if (state?.returnFocus?.isConnected) {
    state.returnFocus.focus();
    return;
  }
  if (selectedRef) {
    tree.querySelector(`.tree-item[data-ref="${CSS.escape(selectedRef)}"]`)?.focus();
  }
}

function closeAssetPicker() {
  if (assetDialog.open) assetDialog.close();
}

function openAssetPicker(state) {
  assetPickerState = {
    ...state,
    returnFocus: state.returnFocus || document.activeElement,
  };
  assetDialogTitle.textContent =
    state.mode === "add-image"
      ? "Add image"
      : state.mode === "node-icon"
        ? "Select node image"
        : "Replace image";
  assetSearch.value = "";
  availableAssets = [];
  selectedAssetPath = "";
  selectAsset("");
  assetDialog.showModal();
  const request = ++assetLibraryRequest;
  void loadAssetLibrary(state.currentPath || "", request).then((loaded) => {
    if (loaded && assetDialog.open && request === assetLibraryRequest) assetSearch.focus();
  });
}

function confirmAssetSelection() {
  if (!assetPickerState || !selectedAssetPath || assetUploadPending) return;
  const state = assetPickerState;
  let result;
  if (state.mode === "add-image") {
    result = architecture.addImage({
      parentId: state.parentId,
      src: selectedAssetPath,
      ...addPosition(state.point, state.parentId, 340, 220),
    });
  } else if (state.mode === "node-icon") {
    result = architecture.setElement(state.ref, "icon", selectedAssetPath);
  } else {
    result = architecture.setElement(state.ref, "src", selectedAssetPath);
  }
  if (applyResult(result)) closeAssetPicker();
}

function setAssetUploadPending(value) {
  assetUploadPending = value;
  assetImportButton.disabled = value;
  assetSearch.disabled = value;
  assetChooseButton.disabled = value || !selectedAssetPath;
  assetList.querySelectorAll("button").forEach((button) => {
    button.disabled = value;
  });
}

async function uploadAsset(file) {
  if (!file) return;
  if (file.size > ASSET_MAX_BYTES) {
    setAssetDialogStatus("Images must be 10 MB or smaller.", "error");
    return;
  }
  setAssetUploadPending(true);
  setAssetDialogStatus(`Importing ${file.name}…`);
  try {
    const response = await fetch(`./asset-upload?name=${encodeURIComponent(file.name)}`, {
      method: "POST",
      headers: { "Content-Type": file.type || "application/octet-stream" },
      body: file,
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || result.ok !== true || !result.asset?.path) {
      throw new Error(result.message || "Could not import the image.");
    }
    const request = ++assetLibraryRequest;
    const loaded = await loadAssetLibrary(result.asset.path, request);
    if (loaded) setAssetDialogStatus(`Imported as ${result.asset.path}.`);
  } catch (error) {
    setAssetDialogStatus(error.message, "error");
  } finally {
    setAssetUploadPending(false);
    assetFileInput.value = "";
  }
}

function renderTree() {
  tree.replaceChildren();
  for (const entry of rawEntries(architecture.raw)) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "tree-item";
    button.style.paddingLeft = `${10 + entry.depth * 16}px`;
    button.dataset.ref = entry.ref;
    button.setAttribute("role", "treeitem");
    button.setAttribute("aria-level", String(entry.depth + 1));
    button.setAttribute("aria-selected", entry.ref === selectedRef ? "true" : "false");
    button.setAttribute("aria-haspopup", "menu");
    const icon = document.createElement("span");
    icon.className = "tree-icon";
    icon.textContent = iconFor(entry.element.type);
    const label = document.createElement("span");
    label.className = "tree-label";
    label.textContent = labelFor(entry);
    button.append(icon, label);
    button.addEventListener("click", () => {
      selectedRef = entry.ref;
      connectorTool = null;
      renderAll();
    });
    button.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      event.stopPropagation();
      openElementContextMenu(entry.ref, {
        clientX: event.clientX,
        clientY: event.clientY,
        origin: "tree",
      });
    });
    button.addEventListener("keydown", (event) => {
      if (event.key !== "ContextMenu" && !(event.shiftKey && event.key === "F10")) return;
      event.preventDefault();
      event.stopPropagation();
      openElementContextMenu(entry.ref, {
        ...eventMenuPosition(event.currentTarget),
        origin: "tree",
      });
    });
    tree.appendChild(button);
  }
}

function addResizeHandles(svg, element) {
  if (!element || element.type === "connector") return;
  if (!architecture.describe(element.id).movable) return;
  const corners = {
    nw: [element.x, element.y],
    ne: [element.x + element.width, element.y],
    sw: [element.x, element.y + element.height],
    se: [element.x + element.width, element.y + element.height],
  };
  for (const [corner, [cx, cy]] of Object.entries(corners)) {
    const handle = document.createElementNS(SVG_NS, "circle");
    handle.classList.add("editor-resize-handle");
    handle.dataset.corner = corner;
    handle.dataset.ref = element.id;
    handle.setAttribute("cx", String(cx));
    handle.setAttribute("cy", String(cy));
    handle.setAttribute("r", "10");
    handle.setAttribute("tabindex", "0");
    handle.setAttribute("role", "button");
    handle.setAttribute("aria-label", `${element.id} ${corner} resize handle`);
    handle.addEventListener("pointerdown", beginResize);
    handle.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      event.stopPropagation();
      openElementContextMenu(element.id, {
        clientX: event.clientX,
        clientY: event.clientY,
        origin: "diagram",
      });
    });
    svg.appendChild(handle);
  }
}

function decorateDiagram(svg) {
  const byOrder = new Map(
    architecture.model.elements.map((element) => [
      String(element.order),
      element.id || element.sourcePath,
    ]),
  );
  svg.removeAttribute("tabindex");
  svg.querySelectorAll("[data-architecture-type]").forEach((node) => {
    const ref =
      node.dataset.architectureId ||
      byOrder.get(node.dataset.architectureOrder || "") ||
      "";
    if (!ref) return;
    const element = modelFor(ref);
    node.dataset.editorRef = ref;
    node.dataset.editorMovable =
      element?.type !== "connector" && architecture.describe(ref).movable ? "true" : "false";
    node.setAttribute("tabindex", "0");
    node.setAttribute("aria-haspopup", "menu");
    if (ref === selectedRef) node.dataset.editorSelected = "true";
    node.addEventListener("click", (event) => {
      event.stopPropagation();
      chooseElement(ref);
    });
    node.addEventListener("pointerdown", beginMove);
    node.addEventListener("keydown", onElementKeyDown);
    node.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      event.stopPropagation();
      openElementContextMenu(ref, {
        clientX: event.clientX,
        clientY: event.clientY,
        origin: "diagram",
      });
    });
  });
  if (connectorTool?.from) {
    svg
      .querySelector(`[data-editor-ref="${CSS.escape(connectorTool.from)}"]`)
      ?.classList.add("connector-source");
  }
  addResizeHandles(svg, modelFor(selectedRef));
  svg.addEventListener("click", (event) => {
    if (event.target === svg) {
      selectedRef = null;
      renderAll();
    }
  });
}

function renderSurface() {
  const wrapper = renderArchitectureBlock(architecture.source, document);
  wrapper.style.width = `${960 * zoom}px`;
  surface.replaceChildren(wrapper);
  decorateDiagram(wrapper.querySelector("svg"));
}

function section(title) {
  const container = document.createElement("section");
  container.className = "inspector-section";
  const heading = document.createElement("h3");
  heading.textContent = title;
  container.appendChild(heading);
  inspector.appendChild(container);
  return container;
}

function readValue(path) {
  const entry = entryFor(selectedRef);
  let value = entry?.element;
  for (const part of path.split(".")) value = value?.[part];
  return value;
}

function addField(container, {
  label,
  path,
  value,
  type = "text",
  options = null,
  min,
  max,
  step,
  multiline = false,
  suggestions = null,
  onChange,
}) {
  const id = `field-${path.replace(/[^A-Za-z0-9_-]/g, "-")}-${container.children.length}`;
  const caption = document.createElement("label");
  caption.htmlFor = id;
  caption.textContent = label;
  let input;
  if (multiline) input = document.createElement("textarea");
  else if (options) {
    input = document.createElement("select");
    for (const option of options) {
      const item = document.createElement("option");
      item.value = typeof option === "string" ? option : option.value;
      item.textContent = typeof option === "string" ? option : option.label;
      input.appendChild(item);
    }
  } else {
    input = document.createElement("input");
    input.type = type;
    if (suggestions?.length) {
      const list = document.createElement("datalist");
      list.id = `${id}-list`;
      for (const suggestion of suggestions) {
        const option = document.createElement("option");
        option.value = suggestion;
        list.appendChild(option);
      }
      input.setAttribute("list", list.id);
      container.appendChild(list);
    }
  }
  input.id = id;
  if (min !== undefined) input.min = String(min);
  if (max !== undefined) input.max = String(max);
  if (step !== undefined) input.step = String(step);
  if (type === "checkbox") input.checked = Boolean(value);
  else input.value = value ?? "";
  input.addEventListener("change", () => {
    let next;
    if (type === "checkbox") next = input.checked;
    else if (type === "number") next = input.value === "" ? undefined : Number(input.value);
    else next = input.value === "" ? undefined : input.value;
    if (onChange) onChange(next, input);
    else applyResult(architecture.setElement(selectedRef, path, next));
  });
  container.append(caption, input);
  return input;
}

function addInspectorAction(container, label, onClick) {
  const row = document.createElement("div");
  row.className = "inspector-action-row";
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = label;
  button.addEventListener("click", onClick);
  row.appendChild(button);
  container.appendChild(row);
  return button;
}

function addStyleFields(container) {
  for (const [label, path] of [
    ["Fill", "style.fill"],
    ["Stroke", "style.stroke"],
    ["Text color", "style.textColor"],
  ]) {
    addField(container, {
      label,
      path,
      value: readValue(path),
      suggestions: COLORS,
    });
  }
  for (const [label, path, min, max, step] of [
    ["Stroke width", "style.strokeWidth", 0.5, 20, 0.5],
    ["Font size", "style.fontSize", 8, 160, 1],
    ["Opacity", "style.opacity", 0, 1, 0.05],
    ["Corner radius", "style.cornerRadius", 0, 200, 1],
  ]) {
    addField(container, {
      label,
      path,
      value: readValue(path),
      type: "number",
      min,
      max,
      step,
    });
  }
  addField(container, {
    label: "Dash pattern",
    path: "style.dash",
    value: readValue("style.dash"),
  });
}

function renderRootInspector() {
  const raw = architecture.raw;
  const general = section("Diagram");
  addField(general, {
    label: "Title",
    path: "root-title",
    value: raw.title,
    onChange: (value) => applyResult(architecture.setRoot("title", value), { select: null }),
  });
  addField(general, {
    label: "Description",
    path: "root-description",
    value: raw.description,
    multiline: true,
    onChange: (value) => applyResult(architecture.setRoot("description", value), { select: null }),
  });
  addField(general, {
    label: "Width",
    path: "canvas-width",
    value: raw.canvas?.width ?? architecture.model.canvas.width,
    type: "number",
    min: 320,
    max: 4000,
    onChange: (value) => applyResult(architecture.setRoot("canvas.width", value), { select: null }),
  });
  addField(general, {
    label: "Height",
    path: "canvas-height",
    value: raw.canvas?.height ?? architecture.model.canvas.height,
    type: "number",
    min: 180,
    max: 4000,
    onChange: (value) => applyResult(architecture.setRoot("canvas.height", value), { select: null }),
  });
  const help = document.createElement("p");
  help.className = "inspector-help";
  help.textContent = "Select an element to edit properties specific to its type.";
  general.appendChild(help);
}

function renderInspector() {
  inspector.replaceChildren();
  const entry = entryFor(selectedRef);
  const model = modelFor(selectedRef);
  if (!entry || !model) {
    renderRootInspector();
    return;
  }

  const general = section(entry.element.type);
  if (entry.element.type !== "connector") {
    addField(general, { label: "ID", path: "id", value: entry.element.id });
    addField(general, {
      label: "Parent",
      path: "parent",
      value: entry.parentId || "",
      options: [
        { value: "", label: "(root)" },
        ...architecture.model.elements
          .filter(
            (element) =>
              element.type === "group" &&
              element.id !== entry.element.id &&
              !element.sourcePath.startsWith(`${entry.sourcePath}.children`),
          )
          .map((element) => ({ value: element.id, label: element.id })),
      ],
      onChange: (value) =>
        applyResult(architecture.reparent(selectedRef, value || null), {
          select: entry.element.id,
        }),
    });
  }

  if (entry.element.type === "node") {
    addField(general, { label: "Text", path: "text", value: entry.element.text, multiline: true });
    addField(general, {
      label: "Shape",
      path: "shape",
      value: entry.element.shape || "rect",
      options: SHAPES,
    });
    addField(general, {
      label: "Icon",
      path: "icon",
      value: entry.element.icon,
      suggestions: [...ICONS],
    });
    addInspectorAction(general, "Select image from assets/", (event) => {
      openAssetPicker({
        mode: "node-icon",
        ref: selectedRef,
        currentPath: entry.element.icon,
        returnFocus: event.currentTarget,
      });
    });
  } else if (entry.element.type === "image") {
    addField(general, {
      label: "Image",
      path: "src",
      value: entry.element.src,
    });
    addInspectorAction(general, "Replace image", (event) => {
      openAssetPicker({
        mode: "image-src",
        ref: selectedRef,
        currentPath: entry.element.src,
        returnFocus: event.currentTarget,
      });
    });
    addField(general, {
      label: "Display mode",
      path: "fit",
      value: entry.element.fit || "contain",
      options: IMAGE_FITS,
    });
  } else if (entry.element.type === "group") {
    addField(general, { label: "Title", path: "title", value: entry.element.title });
    addField(general, {
      label: "Layout",
      path: "layout",
      value:
        typeof entry.element.layout === "string"
          ? entry.element.layout
          : entry.element.layout?.type || "",
      options: [{ value: "", label: "(None)" }, ...LAYOUTS],
      onChange: (value) => {
        applyGroupLayout(selectedRef, value);
      },
    });
    if (entry.element.layout) {
      const layout = typeof entry.element.layout === "string" ? { type: entry.element.layout } : entry.element.layout;
      for (const [label, key, min, max] of [
        ["Gap", "gap", 0, 240],
        ["Row gap", "rowGap", 0, 240],
        ["Column gap", "columnGap", 0, 240],
        ["Padding", "padding", 0, 400],
      ]) {
        addField(general, {
          label,
          path: `layout.${key}`,
          value: layout[key],
          type: "number",
          min,
          max,
          onChange: (value) =>
            applyResult(
              architecture.setElement(selectedRef, "layout", {
                ...layout,
                [key]: value,
              }),
            ),
        });
      }
      if (layout.type === "grid") {
        addField(general, {
        label: "Columns",
        path: "layout.columns",
        value: layout.columns,
        type: "number",
        min: 1,
        max: 12,
        onChange: (value) =>
          applyResult(
            architecture.setElement(selectedRef, "layout", {
              ...layout,
              columns: value,
            }),
          ),
        });
      }
      if (layout.type === "layered") {
        addField(general, {
          label: "Direction",
          path: "layout.direction",
          value: layout.direction || "down",
          options: LAYOUT_DIRECTIONS,
          onChange: (value) =>
            applyResult(
              architecture.setElement(selectedRef, "layout", {
                ...layout,
                direction: value,
              }),
            ),
        });
      }
    }
  } else {
    addField(general, {
      label: "Source",
      path: "from",
      value: entry.element.from,
      options: endpointOptions(),
    });
    addField(general, {
      label: "Target",
      path: "to",
      value: entry.element.to,
      options: endpointOptions(),
    });
    addField(general, {
      label: "Source port",
      path: "fromPort",
      value: entry.element.fromPort || "auto",
      options: PORTS,
    });
    addField(general, {
      label: "Target port",
      path: "toPort",
      value: entry.element.toPort || "auto",
      options: PORTS,
    });
    addField(general, { label: "Label", path: "label", value: entry.element.label });
    addField(general, {
      label: "Label stacking",
      path: "labelLayer",
      value: entry.element.labelLayer || "front",
      options: LABEL_LAYERS,
    });
    addField(general, {
      label: "Routing",
      path: "routing",
      value: entry.element.routing || "orthogonal",
      options: ROUTING,
    });
    addField(general, {
      label: "Arrow",
      path: "arrow",
      value: entry.element.arrow !== false,
      type: "checkbox",
    });
    addField(general, {
      label: "Lane",
      path: "lane",
      value: entry.element.lane,
      type: "number",
      min: -12,
      max: 12,
      step: 1,
    });
    if (entry.element.routing === "polyline") {
      addField(general, {
        label: "Waypoints JSON",
        path: "points",
        value: JSON.stringify(entry.element.points || [], null, 2),
        multiline: true,
        onChange: (value, input) => {
          try {
            input.setCustomValidity("");
            applyResult(architecture.setElement(selectedRef, "points", JSON.parse(value || "[]")));
          } catch (_) {
            input.setCustomValidity("Enter a JSON array of points containing x/y values.");
            input.reportValidity();
          }
        },
      });
    }
  }

  if (entry.element.type !== "connector") {
    const geometry = section("Geometry");
    for (const [label, key, min, max] of [
      ["X", "x", -4000, 4000],
      ["Y", "y", -4000, 4000],
      ["Width", "width", 1, 4000],
      ["Height", "height", 1, 4000],
    ]) {
      addField(geometry, {
        label,
        path: key,
        value: entry.element[key] ?? model[key],
        type: "number",
        min,
        max,
      });
    }
  }

  const accessibility = section("Accessibility / order");
  addField(accessibility, {
    label: "Accessible name",
    path: "ariaLabel",
    value: entry.element.ariaLabel,
    multiline: true,
  });
  addField(accessibility, {
    label: "Z",
    path: "z",
    value: entry.element.z,
    type: "number",
    min: -100,
    max: 100,
    step: 1,
  });

  const style = section("Style");
  addStyleFields(style);
}

function refreshToolbar() {
  const entry = entryFor(selectedRef);
  document.querySelector('[data-action="undo"]').disabled = !architecture.canUndo;
  document.querySelector('[data-action="redo"]').disabled = !architecture.canRedo;
  for (const action of ["duplicate", "delete", "order-back", "order-front"]) {
    document.querySelector(`[data-action="${action}"]`).disabled = !entry;
  }
  document.querySelector('[data-action="release-layout"]').disabled =
    !selectedRef || !releaseLayoutAvailable(selectedRef);
  setDirty(dirty);
}

function renderAll() {
  closeContextMenu();
  renderTree();
  renderSurface();
  renderInspector();
  refreshToolbar();
  zoomStatus.textContent = `${Math.round(zoom * 100)}%`;
}

function chooseElement(ref) {
  const element = modelFor(ref);
  if (connectorTool && element?.type !== "connector") {
    if (!connectorTool.from) {
      connectorTool.from = element.id;
      announce(`Set ${element.id} as the source. Select a target.`);
      renderAll();
      return;
    }
    if (connectorTool.from === element.id) {
      announce("Select a target different from the source.", "error");
      return;
    }
    const from = connectorTool.from;
    connectorTool = null;
    applyResult(architecture.addConnector({ from, to: element.id }), { select: null });
    return;
  }
  connectorTool = null;
  selectedRef = ref;
  renderAll();
}

function beginMove(event) {
  if (event.button !== 0 || event.currentTarget.dataset.architectureType === "connector") return;
  if (connectorTool) return;
  const ref = event.currentTarget.dataset.editorRef;
  if (!ref) return;
  selectedRef = ref;
  const placement = architecture.describe(ref);
  if (!placement.movable) {
    announce(`${ref} cannot move because it is managed by a layout.`, "error");
    renderAll();
    return;
  }
  event.preventDefault();
  event.stopPropagation();
  event.currentTarget.setPointerCapture?.(event.pointerId);
  drag = {
    kind: "move",
    ref,
    target: event.currentTarget,
    pointerId: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    dx: 0,
    dy: 0,
  };
}

function beginResize(event) {
  event.preventDefault();
  event.stopPropagation();
  const ref = event.currentTarget.dataset.ref;
  const element = modelFor(ref);
  if (!element) return;
  drag = {
    kind: "resize",
    ref,
    corner: event.currentTarget.dataset.corner,
    pointerId: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    box: { x: element.x, y: element.y, width: element.width, height: element.height },
    dx: 0,
    dy: 0,
  };
}

function updateDrag(event) {
  if (!drag || event.pointerId !== drag.pointerId) return;
  const svg = surface.querySelector("svg");
  const scale = viewBoxScale(svg);
  drag.dx = (event.clientX - drag.startX) / scale.x;
  drag.dy = (event.clientY - drag.startY) / scale.y;
  if (drag.kind === "move") {
    drag.target.setAttribute("transform", `translate(${drag.dx} ${drag.dy})`);
  }
}

function finishDrag(event) {
  if (!drag || event.pointerId !== drag.pointerId) return;
  const pending = drag;
  drag = null;
  if (pending.kind === "move") {
    pending.target.removeAttribute("transform");
    const dx = snap(pending.dx);
    const dy = snap(pending.dy);
    if (dx || dy) applyResult(architecture.move(pending.ref, dx, dy));
    return;
  }
  let { x, y, width, height } = pending.box;
  const right = x + width;
  const bottom = y + height;
  const nextX = snap(x + pending.dx);
  const nextY = snap(y + pending.dy);
  const nextRight = snap(right + pending.dx);
  const nextBottom = snap(bottom + pending.dy);
  if (pending.corner.includes("w")) {
    x = Math.min(nextX, right - 20);
    width = right - x;
  }
  if (pending.corner.includes("e")) width = Math.max(20, nextRight - x);
  if (pending.corner.includes("n")) {
    y = Math.min(nextY, bottom - 20);
    height = bottom - y;
  }
  if (pending.corner.includes("s")) height = Math.max(20, nextBottom - y);
  applyResult(architecture.resize(pending.ref, { x, y, width, height }));
}

function onElementKeyDown(event) {
  if (["INPUT", "TEXTAREA", "SELECT"].includes(event.target.tagName)) return;
  const ref = event.currentTarget.dataset.editorRef;
  if (event.key === "ContextMenu" || (event.shiftKey && event.key === "F10")) {
    event.preventDefault();
    event.stopPropagation();
    openElementContextMenu(ref, {
      ...eventMenuPosition(event.currentTarget),
      origin: "diagram",
    });
    return;
  }
  if (event.key.startsWith("Arrow") && modelFor(ref)?.type !== "connector") {
    event.preventDefault();
    const step = event.shiftKey ? 1 : SNAP_SIZE;
    const delta = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    }[event.key];
    if (delta) applyResult(architecture.move(ref, delta[0], delta[1]));
  }
}

async function save() {
  try {
    await draftQueue;
  } catch (_) {
    announce("Cannot save because the draft could not be retained.", "error");
    return;
  }
  const generation = targetGeneration;
  const revision = draftRevision;
  announce("Saving to Markdown…");
  let response;
  try {
    response = await fetch("./save", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ generation, revision }),
    });
  } catch (_) {
    announce("Could not connect to the Markdown save server.", "error");
    return;
  }
  const result = await response.json().catch(() => ({}));
  if (!response.ok || result.ok !== true) {
    announce(result.message || "Could not save to Markdown.", "error");
    return;
  }
  if (generation !== targetGeneration || result.generation !== targetGeneration) return;
  draftRevision = Math.max(draftRevision, result.savedRevision ?? draftRevision);
  const hasNewerLocalDraft = draftRevision > (result.savedRevision ?? -1);
  setDirty(Boolean(result.dirty || hasNewerLocalDraft));
  announce(
    dirty
      ? "Changes made while saving are still unsaved. Save again."
      : "Saved to the source Markdown.",
  );
}

function setZoom(value) {
  zoom = Math.min(2.5, Math.max(0.3, value));
  renderSurface();
  zoomStatus.textContent = `${Math.round(zoom * 100)}%`;
}

function fitZoom() {
  const available = Math.max(320, viewport.clientWidth - 96);
  setZoom(Math.min(1, available / 996));
  viewport.scrollTo({ left: 0, top: 0 });
}

function addPosition(point, parentId, width, height) {
  if (!point) return {};
  const parent = parentId ? modelFor(parentId) : null;
  return {
    x: snap(point.x - (parent?.x || 0) - width / 2),
    y: snap(point.y - (parent?.y || 0) - height / 2),
  };
}

function invokeAction(action, context = {}) {
  const ref = Object.hasOwn(context, "ref") ? context.ref : selectedRef;
  if (action === "undo") {
    applyResult(architecture.undo(), { quiet: true });
  } else if (action === "redo") {
    applyResult(architecture.redo(), { quiet: true });
  } else if (action === "add-node") {
    const parentId = entryFor(ref)?.element.type === "group" ? ref : null;
    applyResult(architecture.addNode({
      parentId,
      ...addPosition(context.point, parentId, 260, 140),
    }));
  } else if (action === "add-group") {
    const parentId = entryFor(ref)?.element.type === "group" ? ref : null;
    applyResult(architecture.addGroup({
      parentId,
      ...addPosition(context.point, parentId, 520, 320),
    }));
  } else if (action === "add-image") {
    const parentId = entryFor(ref)?.element.type === "group" ? ref : null;
    openAssetPicker({
      mode: "add-image",
      parentId,
      point: context.point,
      returnFocus: context.returnFocus || document.activeElement,
    });
  } else if (action === "add-connector") {
    connectorTool = { from: null };
    announce("Select the connector source.");
    renderAll();
  } else if (action === "start-connector" && ref) {
    const element = modelFor(ref);
    if (!element || element.type === "connector") return;
    selectedRef = ref;
    connectorTool = { from: element.id };
    announce(`Set ${element.id} as the source. Select a target.`);
    renderAll();
  } else if (action === "duplicate" && ref) {
    applyResult(architecture.duplicate(ref));
  } else if (action === "delete" && ref) {
    const deleted = ref;
    if (applyResult(architecture.remove(ref), { select: null })) {
      announce(`Deleted ${deleted}.`);
    }
  } else if (action === "release-layout" && ref) {
    applyGroupLayout(ref, "");
  } else if (action === "set-layout" && ref) {
    applyGroupLayout(ref, context.layoutType || "");
  } else if (action === "order-back" && ref) {
    applyResult(architecture.reorder(ref, -1), { select: null });
  } else if (action === "order-front" && ref) {
    applyResult(architecture.reorder(ref, 1), { select: null });
  } else if (action === "zoom-out") {
    setZoom(zoom - 0.1);
  } else if (action === "zoom-in") {
    setZoom(zoom + 0.1);
  } else if (action === "zoom-fit") {
    fitZoom();
  } else if (action === "save") {
    void save();
  }
}

function wireControls() {
  document.querySelectorAll("[data-action]").forEach((button) => {
    button.addEventListener("click", () => invokeAction(button.dataset.action));
  });
  document.addEventListener("pointermove", updateDrag);
  document.addEventListener("pointerup", finishDrag);
  document.addEventListener("pointercancel", finishDrag);
  assetSearch.addEventListener("input", renderAssetLibrary);
  assetImportButton.addEventListener("click", () => assetFileInput.click());
  assetFileInput.addEventListener("change", () => {
    void uploadAsset(assetFileInput.files?.[0]);
  });
  assetChooseButton.addEventListener("click", confirmAssetSelection);
  assetCancelButton.addEventListener("click", closeAssetPicker);
  assetDialogClose.addEventListener("click", closeAssetPicker);
  assetDialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    closeAssetPicker();
  });
  assetDialog.addEventListener("close", () => {
    assetLibraryRequest += 1;
    const previous = assetPickerState;
    assetPickerState = null;
    availableAssets = [];
    selectedAssetPath = "";
    assetPreviewImageHost.replaceChildren();
    restoreAssetPickerFocus(previous);
  });
  document.addEventListener("pointerdown", (event) => {
    if (!contextMenu.hidden && !contextMenu.contains(event.target)) closeContextMenu();
  }, true);
  contextMenu.addEventListener("keydown", (event) => {
    const activeMenu = document.activeElement.closest('[role="menu"]');
    const items = activeMenu ? directMenuItems(activeMenu) : [];
    const current = items.indexOf(document.activeElement);
    let next = null;
    if (event.key === "ArrowDown") next = items[(current + 1 + items.length) % items.length];
    else if (event.key === "ArrowUp") next = items[(current - 1 + items.length) % items.length];
    else if (event.key === "Home") next = items[0];
    else if (event.key === "End") next = items.at(-1);
    else if (
      event.key === "ArrowRight" &&
      document.activeElement.matches('[aria-haspopup="menu"]')
    ) {
      event.preventDefault();
      event.stopPropagation();
      openContextSubmenu(document.activeElement, { focusFirst: true });
      return;
    } else if (event.key === "ArrowLeft" && activeMenu?.classList.contains("context-submenu")) {
      event.preventDefault();
      event.stopPropagation();
      closeContextSubmenu({ restoreFocus: true });
      return;
    } else if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      closeContextMenu({ restoreFocus: true });
      return;
    } else if (event.key === "Tab") {
      closeContextMenu({ restoreFocus: true });
      return;
    }
    if (next) {
      event.preventDefault();
      event.stopPropagation();
      if (activeMenu === contextMenu && !next.matches('[aria-haspopup="menu"]')) {
        closeContextSubmenu();
      }
      next.focus();
      return;
    }
    event.stopPropagation();
  });
  tree.closest(".element-panel")?.addEventListener("contextmenu", (event) => {
    if (event.target.closest(".tree-item")) return;
    event.preventDefault();
    openBlankContextMenu({
      clientX: event.clientX,
      clientY: event.clientY,
      origin: "tree",
    });
  });
  viewport.addEventListener("contextmenu", (event) => {
    if (event.target.closest("[data-editor-ref]")) return;
    event.preventDefault();
    openBlankContextMenu({
      clientX: event.clientX,
      clientY: event.clientY,
      origin: "canvas",
    });
  });
  viewport.addEventListener("pointerdown", (event) => {
    if (event.button !== 1 && !(event.button === 0 && spacePressed)) return;
    event.preventDefault();
    pan = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      left: viewport.scrollLeft,
      top: viewport.scrollTop,
    };
  });
  viewport.addEventListener("pointermove", (event) => {
    if (!pan || pan.pointerId !== event.pointerId) return;
    viewport.scrollLeft = pan.left - (event.clientX - pan.x);
    viewport.scrollTop = pan.top - (event.clientY - pan.y);
  });
  viewport.addEventListener("pointerup", () => {
    pan = null;
  });
  viewport.addEventListener("scroll", () => closeContextMenu(), { passive: true });
  tree.closest(".editor-sidebar")?.addEventListener("scroll", () => closeContextMenu(), {
    passive: true,
  });
  viewport.addEventListener(
    "wheel",
    (event) => {
      if (!event.ctrlKey) return;
      event.preventDefault();
      setZoom(zoom + (event.deltaY < 0 ? 0.1 : -0.1));
    },
    { passive: false },
  );
  window.addEventListener("keydown", (event) => {
    if (assetDialog.open) return;
    const editable = ["INPUT", "TEXTAREA", "SELECT"].includes(event.target.tagName);
    if (event.code === "Space" && !editable) spacePressed = true;
    const modifier = event.ctrlKey || event.metaKey;
    const key = event.key.toLowerCase();
    if (modifier && key === "s") {
      event.preventDefault();
      if (editable) event.target.blur();
      void save();
      return;
    }
    if (editable) return;
    if (modifier && key === "z") {
      event.preventDefault();
      invokeAction(event.shiftKey ? "redo" : "undo");
    } else if (modifier && key === "y") {
      event.preventDefault();
      invokeAction("redo");
    } else if (modifier && key === "d") {
      event.preventDefault();
      invokeAction("duplicate");
    } else if (event.key === "Delete") {
      event.preventDefault();
      invokeAction("delete");
    } else if (event.key === "Escape") {
      connectorTool = null;
      selectedRef = null;
      renderAll();
    }
  });
  window.addEventListener("keyup", (event) => {
    if (event.code === "Space") spacePressed = false;
  });
  window.addEventListener("resize", () => closeContextMenu(), { passive: true });
  window.addEventListener("blur", () => closeContextMenu());
  window.addEventListener("beforeunload", (event) => {
    if (!dirty) return;
    event.preventDefault();
    event.returnValue = "";
  });
}

async function refreshState() {
  const response = await fetch("./state", { cache: "no-store" });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const state = await response.json();
  if (!Number.isInteger(state.version) || state.version < serverVersion) return;
  serverVersion = state.version;
  sourcePath = state.sourcePath;
  blockIndex = state.blockIndex;
  const stateRevision = state.draftRevision ?? 0;
  const stateGeneration = state.generation ?? 0;
  document.documentElement.dataset.theme = state.theme || "dark";
  sourceLabel.textContent = `${sourcePath} — diagram ${blockIndex + 1}`;
  if (targetGeneration !== stateGeneration) {
    targetGeneration = stateGeneration;
    draftRevision = stateRevision;
    architecture = createArchitectureDocument(state.source);
    selectedRef = null;
    setDirty(state.dirty);
    renderAll();
    return;
  }
  if (stateRevision < draftRevision) {
    setDirty(true);
    refreshToolbar();
    return;
  }
  draftRevision = stateRevision;
  if (!architecture || architecture.source !== state.source) {
    architecture = createArchitectureDocument(state.source);
    selectedRef = null;
    setDirty(state.dirty);
    renderAll();
  } else {
    setDirty(state.dirty);
    refreshToolbar();
  }
}

async function init() {
  wireControls();
  await refreshState();
  fitZoom();
  announce("Select the diagram to edit it. The Markdown remains unchanged until you save.");
  const events = new EventSource("./events");
  events.onmessage = () => {
    void refreshState().catch((error) => announce(error.message, "error"));
  };
}

init().catch((error) => {
  announce(`Could not start the editor: ${error.message}`, "error");
  try {
    parseArchitecture("{}");
  } catch (_) {
    // Keep the status visible; there is no editable document to render.
  }
});
