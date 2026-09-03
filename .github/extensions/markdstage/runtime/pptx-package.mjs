import { Buffer } from "node:buffer";

export const PPTX_DIMENSIONS = Object.freeze({
  widthPx: 1280,
  heightPx: 720,
  emusPerPx: 9525,
  widthEmu: 12192000,
  heightEmu: 6858000,
});

const XML =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
const NS_A = "http://schemas.openxmlformats.org/drawingml/2006/main";
const NS_P = "http://schemas.openxmlformats.org/presentationml/2006/main";
const NS_R =
  "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const NS_REL =
  "http://schemas.openxmlformats.org/package/2006/relationships";
const JAPANESE_FONT_FACE = "Yu Gothic";
const HUNDREDTH_POINTS_PER_PIXEL = 75;

const REL = {
  officeDocument: `${NS_R}/officeDocument`,
  core: `${NS_REL}/metadata/core-properties`,
  app: `${NS_R}/extended-properties`,
  slide: `${NS_R}/slide`,
  slideMaster: `${NS_R}/slideMaster`,
  slideLayout: `${NS_R}/slideLayout`,
  theme: `${NS_R}/theme`,
  image: `${NS_R}/image`,
  hyperlink: `${NS_R}/hyperlink`,
  notesSlide: `${NS_R}/notesSlide`,
  notesMaster: `${NS_R}/notesMaster`,
};

const CONTENT_TYPES = {
  "image/png": { extension: "png", contentType: "image/png" },
  "image/jpeg": { extension: "jpeg", contentType: "image/jpeg" },
  "image/gif": { extension: "gif", contentType: "image/gif" },
  "image/svg+xml": { extension: "svg", contentType: "image/svg+xml" },
};

const CRC_TABLE = new Uint32Array(256);
for (let i = 0; i < 256; i += 1) {
  let value = i;
  for (let bit = 0; bit < 8; bit += 1) {
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }
  CRC_TABLE[i] = value >>> 0;
}

function fail(message) {
  throw new TypeError(`Invalid PowerPoint model: ${message}`);
}

function isXmlCodePoint(codePoint) {
  return (
    codePoint === 0x9 ||
    codePoint === 0xa ||
    codePoint === 0xd ||
    (codePoint >= 0x20 && codePoint <= 0xd7ff) ||
    (codePoint >= 0xe000 && codePoint <= 0xfffd) ||
    (codePoint >= 0x10000 && codePoint <= 0x10ffff)
  );
}

function xmlEscape(value) {
  return [...String(value)]
    .map((character) => (isXmlCodePoint(character.codePointAt(0)) ? character : "\uFFFD"))
    .join("")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function xmlUnescape(value) {
  return value
    .replaceAll("&apos;", "'")
    .replaceAll("&quot;", '"')
    .replaceAll("&gt;", ">")
    .replaceAll("&lt;", "<")
    .replaceAll("&amp;", "&");
}

function finiteNumber(value, path) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    fail(`${path} must be a finite number`);
  }
  return value;
}

function positiveNumber(value, path) {
  const number = finiteNumber(value, path);
  if (number <= 0) fail(`${path} must be greater than zero`);
  return number;
}

function nonNegativeNumber(value, path) {
  const number = finiteNumber(value, path);
  if (number < 0) fail(`${path} must be zero or greater`);
  return number;
}

function optionalUnitInterval(value, path, fallback = 1) {
  if (value === undefined) return fallback;
  const number = finiteNumber(value, path);
  if (number < 0 || number > 1) fail(`${path} must be between 0 and 1`);
  return number;
}

function boundsOf(value, path) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    fail(`${path} must be an object`);
  }
  return {
    x: finiteNumber(value.x, `${path}.x`),
    y: finiteNumber(value.y, `${path}.y`),
    width: positiveNumber(value.width, `${path}.width`),
    height: positiveNumber(value.height, `${path}.height`),
  };
}

function emu(value) {
  return Math.round(value * PPTX_DIMENSIONS.emusPerPx);
}

function xfrmXml(bounds, tag = "a:xfrm") {
  return `<${tag}><a:off x="${emu(bounds.x)}" y="${emu(bounds.y)}"/><a:ext cx="${emu(bounds.width)}" cy="${emu(bounds.height)}"/></${tag}>`;
}

function parseChannel(value, path) {
  const text = String(value).trim();
  const number = text.endsWith("%")
    ? (Number.parseFloat(text) * 255) / 100
    : Number.parseFloat(text);
  if (!Number.isFinite(number) || number < 0 || number > 255) {
    fail(`${path} contains an invalid RGB channel`);
  }
  return Math.round(number);
}

function parseAlpha(value, path) {
  if (value === undefined) return 1;
  const text = String(value).trim();
  const number = text.endsWith("%")
    ? Number.parseFloat(text) / 100
    : Number.parseFloat(text);
  if (!Number.isFinite(number) || number < 0 || number > 1) {
    fail(`${path} contains an invalid alpha channel`);
  }
  return number;
}

function colorOf(value, path) {
  if (value === null || value === undefined || value === "transparent") return null;
  if (typeof value !== "string") fail(`${path} must be a CSS color string or null`);
  const text = value.trim();
  const hex = /^#([0-9a-f]{3,8})$/i.exec(text);
  if (hex) {
    let digits = hex[1];
    if (digits.length === 3 || digits.length === 4) {
      digits = [...digits].map((digit) => digit + digit).join("");
    }
    if (digits.length !== 6 && digits.length !== 8) {
      fail(`${path} must use #RGB, #RGBA, #RRGGBB, or #RRGGBBAA`);
    }
    return {
      hex: digits.slice(0, 6).toUpperCase(),
      alpha:
        digits.length === 8 ? Number.parseInt(digits.slice(6), 16) / 255 : 1,
    };
  }
  const rgb = /^rgba?\((.*)\)$/i.exec(text);
  if (!rgb) fail(`${path} must be a hex, rgb(), or rgba() color`);
  const inner = rgb[1].trim();
  let channels;
  let alpha;
  if (inner.includes(",")) {
    const parts = inner.split(",").map((part) => part.trim());
    if (parts.length !== 3 && parts.length !== 4) fail(`${path} is invalid`);
    channels = parts.slice(0, 3);
    alpha = parts[3];
  } else {
    const [channelText, alphaText] = inner.split("/").map((part) => part.trim());
    channels = channelText.split(/\s+/);
    alpha = alphaText;
  }
  if (channels.length !== 3) fail(`${path} is invalid`);
  const values = channels.map((part) => parseChannel(part, path));
  return {
    hex: values.map((part) => part.toString(16).padStart(2, "0")).join("").toUpperCase(),
    alpha: parseAlpha(alpha, path),
  };
}

function colorXml(value, path, opacity = 1) {
  const color = colorOf(value, path);
  if (!color) return "<a:noFill/>";
  const alpha = Math.round(color.alpha * opacity * 100000);
  return `<a:solidFill><a:srgbClr val="${color.hex}">${
    alpha < 100000 ? `<a:alpha val="${alpha}"/>` : ""
  }</a:srgbClr></a:solidFill>`;
}

function lineXml(element, path) {
  const width = element.strokeWidth === undefined
    ? 1
    : positiveNumber(element.strokeWidth, `${path}.strokeWidth`);
  const color = colorOf(element.stroke, `${path}.stroke`);
  if (!color) return `<a:ln w="${emu(width)}"><a:noFill/></a:ln>`;
  const opacity = optionalUnitInterval(element.opacity, `${path}.opacity`);
  const alpha = Math.round(color.alpha * opacity * 100000);
  const dash = dashXml(element.dash, `${path}.dash`);
  return `<a:ln w="${emu(width)}"><a:solidFill><a:srgbClr val="${color.hex}">${
    alpha < 100000 ? `<a:alpha val="${alpha}"/>` : ""
  }</a:srgbClr></a:solidFill>${dash}</a:ln>`;
}

function dashXml(value, path) {
  if (value === undefined || value === null || value === "solid") return "";
  const normalized = {
    dash: "dash",
    dashed: "dash",
    dot: "dot",
    dotted: "dot",
    dashDot: "dashDot",
    longDash: "lgDash",
  }[value];
  if (!normalized) fail(`${path} is not a supported dash style`);
  return `<a:prstDash val="${normalized}"/>`;
}

function detectContentType(data) {
  if (
    data.length >= 8 &&
    data.subarray(0, 8).equals(
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    )
  ) {
    return "image/png";
  }
  if (data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) {
    return "image/jpeg";
  }
  if (
    data.length >= 6 &&
    (data.subarray(0, 6).toString("ascii") === "GIF87a" ||
      data.subarray(0, 6).toString("ascii") === "GIF89a")
  ) {
    return "image/gif";
  }
  if (/^\s*<svg[\s>]/i.test(data.subarray(0, 512).toString("utf8"))) {
    return "image/svg+xml";
  }
  return null;
}

function bufferOf(value, path) {
  if (Buffer.isBuffer(value)) return Buffer.from(value);
  if (value instanceof ArrayBuffer) return Buffer.from(value);
  if (ArrayBuffer.isView(value)) {
    return Buffer.from(value.buffer, value.byteOffset, value.byteLength);
  }
  fail(`${path} must be a Buffer, ArrayBuffer, or typed array`);
}

function normalizeAssets(assets) {
  if (assets === undefined) return new Map();
  if (!Array.isArray(assets)) fail("assets must be an array");
  const result = new Map();
  for (let index = 0; index < assets.length; index += 1) {
    const asset = assets[index];
    const path = `assets[${index}]`;
    if (!asset || typeof asset !== "object" || Array.isArray(asset)) {
      fail(`${path} must be an object`);
    }
    if (typeof asset.id !== "string" || !asset.id.trim()) {
      fail(`${path}.id must be a non-empty string`);
    }
    if (result.has(asset.id)) fail(`duplicate asset id "${asset.id}"`);
    const data = bufferOf(asset.data, `${path}.data`);
    if (!data.length) fail(`${path}.data must not be empty`);
    const detected = detectContentType(data);
    const contentType = asset.contentType || detected;
    if (!CONTENT_TYPES[contentType]) {
      fail(`${path}.contentType must be PNG, JPEG, GIF, or SVG`);
    }
    if (asset.contentType && detected && asset.contentType !== detected) {
      fail(`${path}.contentType does not match its data`);
    }
    result.set(asset.id, {
      id: asset.id,
      data,
      contentType,
      extension: CONTENT_TYPES[contentType].extension,
      mediaPath: "",
    });
  }
  let mediaIndex = 1;
  for (const asset of result.values()) {
    asset.mediaPath = `ppt/media/image${mediaIndex}.${asset.extension}`;
    mediaIndex += 1;
  }
  return result;
}

function requireAsset(assets, id, path) {
  if (typeof id !== "string" || !id) fail(`${path} must be a non-empty asset id`);
  const asset = assets.get(id);
  if (!asset) fail(`${path} references missing asset "${id}"`);
  return asset;
}

function fontSizeOf(run, path) {
  let value = run.fontSize;
  let unit = run.fontSizeUnit || "px";
  if (run.fontSizePx !== undefined) {
    value = run.fontSizePx;
    unit = "px";
  } else if (run.fontSizePt !== undefined) {
    value = run.fontSizePt;
    unit = "pt";
  }
  if (value === undefined) return 1800;
  if (typeof value === "string") {
    const match = /^(\d+(?:\.\d+)?)\s*(px|pt)$/i.exec(value.trim());
    if (!match) fail(`${path}.fontSize must be a px or pt value`);
    value = Number(match[1]);
    unit = match[2].toLowerCase();
  }
  value = positiveNumber(value, `${path}.fontSize`);
  if (unit !== "px" && unit !== "pt") {
    fail(`${path}.fontSizeUnit must be "px" or "pt"`);
  }
  return Math.round((unit === "px" ? value * 0.75 : value) * 100);
}

function normalizeText(value, path) {
  if (typeof value === "string") {
    return { paragraphs: [{ runs: [{ text: value }] }] };
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    fail(`${path} must be a string or rich text object`);
  }
  if (!Array.isArray(value.paragraphs) || value.paragraphs.length === 0) {
    fail(`${path}.paragraphs must be a non-empty array`);
  }
  return value;
}

function bulletTextOffsetPx(paragraph, path) {
  if (
    !paragraph ||
    typeof paragraph !== "object" ||
    Array.isArray(paragraph) ||
    !paragraph.bullet ||
    !Array.isArray(paragraph.runs) ||
    paragraph.runs.length === 0
  ) {
    return 0;
  }
  const largestRunSize = Math.max(
    ...paragraph.runs.map((run, index) =>
      fontSizeOf(run, `${path}.runs[${index}]`),
    ),
  );
  return largestRunSize / HUNDREDTH_POINTS_PER_PIXEL;
}

function paragraphXml(paragraph, path, relationships, leftMarginPx = 0) {
  if (!paragraph || typeof paragraph !== "object" || Array.isArray(paragraph)) {
    fail(`${path} must be an object`);
  }
  if (!Array.isArray(paragraph.runs) || paragraph.runs.length === 0) {
    fail(`${path}.runs must be a non-empty array`);
  }
  const align = {
    left: "l",
    center: "ctr",
    right: "r",
    justify: "just",
  }[paragraph.alignment || "left"];
  if (!align) fail(`${path}.alignment is invalid`);
  const level = paragraph.level === undefined ? 0 : paragraph.level;
  if (!Number.isInteger(level) || level < 0 || level > 8) {
    fail(`${path}.level must be an integer between 0 and 8`);
  }
  let bullet = "";
  if (paragraph.bullet) {
    const character =
      typeof paragraph.bullet === "string"
        ? paragraph.bullet
        : paragraph.bullet.character || "•";
    bullet = `<a:buChar char="${xmlEscape(character)}"/>`;
  }
  const bulletOffsetPx = bulletTextOffsetPx(paragraph, path);
  const paragraphMarginPx = Math.max(leftMarginPx, bulletOffsetPx);
  const indentation = [
    paragraphMarginPx > 0 ? `marL="${emu(paragraphMarginPx)}"` : "",
    bulletOffsetPx > 0 ? `indent="-${emu(bulletOffsetPx)}"` : "",
  ]
    .filter(Boolean)
    .join(" ");
  const indentationAttributes = indentation ? ` ${indentation}` : "";
  const runs = paragraph.runs
    .map((run, index) =>
      runXml(run, `${path}.runs[${index}]`, relationships),
    )
    .join("");
  return `<a:p><a:pPr algn="${align}" lvl="${level}"${indentationAttributes}>${bullet}</a:pPr>${runs}<a:endParaRPr lang="en-US"><a:ea typeface="${JAPANESE_FONT_FACE}"/></a:endParaRPr></a:p>`;
}

function runXml(run, path, relationships) {
  if (!run || typeof run !== "object" || Array.isArray(run)) {
    fail(`${path} must be an object`);
  }
  if (typeof run.text !== "string") fail(`${path}.text must be a string`);
  const size = fontSizeOf(run, path);
  const attributes = [
    'lang="en-US"',
    `sz="${size}"`,
    run.bold ? 'b="1"' : "",
    run.italic ? 'i="1"' : "",
    run.underline ? 'u="sng"' : "",
  ]
    .filter(Boolean)
    .join(" ");
  let properties = colorXml(
    run.color ?? "#000000",
    `${path}.color`,
    optionalUnitInterval(run.opacity, `${path}.opacity`),
  );
  if (run.fontFace !== undefined) {
    if (typeof run.fontFace !== "string" || !run.fontFace) {
      fail(`${path}.fontFace must be a non-empty string`);
    }
    properties += `<a:latin typeface="${xmlEscape(run.fontFace)}"/>`;
  }
  properties += `<a:ea typeface="${JAPANESE_FONT_FACE}"/>`;
  if (run.href !== undefined) {
    if (typeof run.href !== "string" || !run.href) {
      fail(`${path}.href must be a non-empty string`);
    }
    const relationshipId = relationships.hyperlink(run.href);
    properties += `<a:hlinkClick r:id="${relationshipId}"/>`;
  }
  const preserve = /^\s|\s$|\s{2}/.test(run.text) ? ' xml:space="preserve"' : "";
  return `<a:r><a:rPr ${attributes}>${properties}</a:rPr><a:t${preserve}>${xmlEscape(run.text)}</a:t></a:r>`;
}

function textBodyPropertiesXml(options, path) {
  const anchor = {
    top: "t",
    middle: "ctr",
    bottom: "b",
  }[options.verticalAlignment];
  if (options.verticalAlignment !== undefined && !anchor) {
    fail(`${path}.verticalAlignment must be "top", "middle", or "bottom"`);
  }
  const wrap = options.textWrap === undefined ? "square" : options.textWrap;
  if (wrap !== "square" && wrap !== "none") {
    fail(`${path}.textWrap must be "square" or "none"`);
  }
  const insets = { left: 0, top: 0, right: 0, bottom: 0 };
  if (options.textInsets !== undefined) {
    if (
      !options.textInsets ||
      typeof options.textInsets !== "object" ||
      Array.isArray(options.textInsets)
    ) {
      fail(`${path}.textInsets must be an object`);
    }
    for (const side of Object.keys(insets)) {
      if (options.textInsets[side] !== undefined) {
        insets[side] = nonNegativeNumber(
          options.textInsets[side],
          `${path}.textInsets.${side}`,
        );
      }
    }
  }
  const anchorAttribute = anchor ? ` anchor="${anchor}"` : "";
  return `<a:bodyPr wrap="${wrap}" lIns="${emu(insets.left)}" tIns="${emu(insets.top)}" rIns="${emu(insets.right)}" bIns="${emu(insets.bottom)}"${anchorAttribute}/>`;
}

function textBodyXml(
  value,
  path,
  relationships,
  tag = "p:txBody",
  bodyOptions = {},
  bodyPath = path,
  leftMarginPx = 0,
) {
  const text = normalizeText(value, path);
  const paragraphs = text.paragraphs
    .map((paragraph, index) =>
      paragraphXml(
        paragraph,
        `${path}.paragraphs[${index}]`,
        relationships,
        leftMarginPx,
      ),
    )
    .join("");
  return `<${tag}>${textBodyPropertiesXml(bodyOptions, bodyPath)}<a:lstStyle/>${paragraphs}</${tag}>`;
}

function shapeBase(id, name, bounds, properties, text = "") {
  return `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="${xmlEscape(name)}"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr>${xfrmXml(bounds)}${properties}</p:spPr>${text}</p:sp>`;
}

function textShapeXml(element, path, id, relationships) {
  const bounds = boundsOf(element, path);
  const text = { paragraphs: element.paragraphs };
  const paragraphs = Array.isArray(text.paragraphs) ? text.paragraphs : [];
  const bulletInsetPx = Math.max(
    0,
    ...paragraphs.map((paragraph, index) =>
      bulletTextOffsetPx(paragraph, `${path}.paragraphs[${index}]`),
    ),
  );
  const adjustedBounds =
    bulletInsetPx > 0
      ? {
          ...bounds,
          x: bounds.x - bulletInsetPx,
          width: bounds.width + bulletInsetPx,
        }
      : bounds;
  return shapeBase(
    id,
    `Text ${id}`,
    adjustedBounds,
    '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/><a:ln><a:noFill/></a:ln>',
    textBodyXml(
      text,
      `${path}`,
      relationships,
      "p:txBody",
      element,
      path,
      bulletInsetPx,
    ),
  );
}

function shapeTextOf(element, path) {
  const hasText = element.text !== undefined;
  const hasParagraphs = element.paragraphs !== undefined;
  if (hasText && hasParagraphs) {
    fail(`${path} must specify either text or paragraphs, not both`);
  }
  if (hasParagraphs) {
    return { value: { paragraphs: element.paragraphs }, path };
  }
  if (hasText) {
    return { value: element.text, path: `${path}.text` };
  }
  return null;
}

function nativeShapeXml(element, path, id, relationships) {
  const bounds = boundsOf(element, path);
  const preset = {
    rect: "rect",
    roundedRect: "roundRect",
    ellipse: "ellipse",
  }[element.shape];
  if (!preset) fail(`${path}.shape must be rect, roundedRect, or ellipse`);
  const opacity = optionalUnitInterval(element.opacity, `${path}.opacity`);
  const properties = `${xfrmXml(bounds)}<a:prstGeom prst="${preset}"><a:avLst/></a:prstGeom>${colorXml(
    element.fill,
    `${path}.fill`,
    opacity,
  )}${lineXml(element, path)}`;
  const shapeText = shapeTextOf(element, path);
  if (!shapeText) textBodyPropertiesXml(element, path);
  const text = shapeText
     ? textBodyXml(
         shapeText.value,
         shapeText.path,
         relationships,
         "p:txBody",
         element,
         path,
       )
     : "";
  return `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="Shape ${id}"/><p:cNvSpPr txBox="0"/><p:nvPr/></p:nvSpPr><p:spPr>${properties}</p:spPr>${text}</p:sp>`;
}

function pictureXml(asset, bounds, id, relationshipId, name = `Image ${id}`) {
  return `<p:pic><p:nvPicPr><p:cNvPr id="${id}" name="${xmlEscape(name)}"/><p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr><p:nvPr/></p:nvPicPr><p:blipFill><a:blip r:embed="${relationshipId}"/><a:stretch><a:fillRect/></a:stretch></p:blipFill><p:spPr>${xfrmXml(bounds)}<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr></p:pic>`;
}

function tableXml(element, path, id, relationships) {
  const bounds = boundsOf(element, path);
  if (!Array.isArray(element.rows) || element.rows.length === 0) {
    fail(`${path}.rows must be a non-empty array`);
  }
  const columnCount = element.rows[0]?.cells?.length;
  if (!Number.isInteger(columnCount) || columnCount === 0) {
    fail(`${path}.rows[0].cells must be a non-empty array`);
  }
  const rowHeight = emu(bounds.height) / element.rows.length;
  const columnWidth = emu(bounds.width) / columnCount;
  const rows = element.rows
    .map((row, rowIndex) => {
      const rowPath = `${path}.rows[${rowIndex}]`;
      if (!row || !Array.isArray(row.cells) || row.cells.length !== columnCount) {
        fail(`${rowPath}.cells must contain exactly ${columnCount} cells`);
      }
      const cells = row.cells
        .map((cell, cellIndex) => {
          const cellPath = `${rowPath}.cells[${cellIndex}]`;
          if (!cell || typeof cell !== "object" || Array.isArray(cell)) {
            fail(`${cellPath} must be an object`);
          }
          const text =
            cell.text !== undefined
              ? cell.text
              : { paragraphs: cell.paragraphs };
          const fill = colorXml(cell.fill, `${cellPath}.fill`);
          const strokeColor = colorOf(cell.stroke, `${cellPath}.stroke`);
          const strokeWidth =
            cell.strokeWidth === undefined
              ? 1
              : positiveNumber(cell.strokeWidth, `${cellPath}.strokeWidth`);
          const borderFill = strokeColor
            ? `<a:solidFill><a:srgbClr val="${strokeColor.hex}"/></a:solidFill>`
            : "<a:noFill/>";
          const borders = ["L", "R", "T", "B"]
            .map(
              (side) =>
                `<a:ln${side} w="${emu(strokeWidth)}">${borderFill}</a:ln${side}>`,
            )
            .join("");
          return `<a:tc>${textBodyXml(text, `${cellPath}.text`, relationships, "a:txBody")}<a:tcPr>${borders}${fill}</a:tcPr></a:tc>`;
        })
        .join("");
      return `<a:tr h="${Math.round(rowHeight)}">${cells}</a:tr>`;
    })
    .join("");
  const columns = Array.from(
    { length: columnCount },
    () => `<a:gridCol w="${Math.round(columnWidth)}"/>`,
  ).join("");
  return `<p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="${id}" name="Table ${id}"/><p:cNvGraphicFramePr/><p:nvPr/></p:nvGraphicFramePr>${xfrmXml(bounds, "p:xfrm")}<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/table"><a:tbl><a:tblPr firstRow="1" bandRow="1"/><a:tblGrid>${columns}</a:tblGrid>${rows}</a:tbl></a:graphicData></a:graphic></p:graphicFrame>`;
}

function arrowXml(value, path) {
  if (value === undefined || value === null || value === false || value === "none") {
    return "";
  }
  const type =
    value === true
      ? "triangle"
      : {
          triangle: "triangle",
          arrow: "arrow",
          stealth: "stealth",
          diamond: "diamond",
          oval: "oval",
        }[value];
  if (!type) fail(`${path} is not a supported arrow end`);
  return `<a:tailEnd type="${type}"/>`;
}

function connectorXml(element, path, nextId, relationships) {
  if (!Array.isArray(element.points) || element.points.length < 2) {
    fail(`${path}.points must contain at least two points`);
  }
  const points = element.points.map((point, index) => {
    if (!point || typeof point !== "object") fail(`${path}.points[${index}] must be an object`);
    return {
      x: finiteNumber(point.x, `${path}.points[${index}].x`),
      y: finiteNumber(point.y, `${path}.points[${index}].y`),
    };
  });
  const width = element.strokeWidth === undefined
    ? 1
    : positiveNumber(element.strokeWidth, `${path}.strokeWidth`);
  const color = colorOf(element.stroke ?? "#000000", `${path}.stroke`);
  if (!color) fail(`${path}.stroke cannot be null`);
  const opacity = optionalUnitInterval(element.opacity, `${path}.opacity`);
  const alpha = Math.round(color.alpha * opacity * 100000);
  const dash = dashXml(element.dash, `${path}.dash`);
  const shapes = [];
  for (let index = 0; index < points.length - 1; index += 1) {
    const start = points[index];
    const end = points[index + 1];
    if (start.x === end.x && start.y === end.y) {
      fail(`${path}.points[${index}] and points[${index + 1}] must differ`);
    }
    const id = nextId();
    const x = Math.min(start.x, end.x);
    const y = Math.min(start.y, end.y);
    const flipH = end.x < start.x ? ' flipH="1"' : "";
    const flipV = end.y < start.y ? ' flipV="1"' : "";
    const tail =
      index === points.length - 2
        ? arrowXml(element.arrowEnd, `${path}.arrowEnd`)
        : "";
    shapes.push(
      `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="Connector ${id}"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm${flipH}${flipV}><a:off x="${emu(x)}" y="${emu(y)}"/><a:ext cx="${emu(Math.abs(end.x - start.x))}" cy="${emu(Math.abs(end.y - start.y))}"/></a:xfrm><a:prstGeom prst="line"><a:avLst/></a:prstGeom><a:ln w="${emu(width)}"><a:solidFill><a:srgbClr val="${color.hex}">${
        alpha < 100000 ? `<a:alpha val="${alpha}"/>` : ""
      }</a:srgbClr></a:solidFill>${dash}${tail}</a:ln></p:spPr></p:sp>`,
    );
  }
  if (element.label !== undefined) {
    const id = nextId();
    const labelBounds = element.labelBounds
      ? boundsOf(element.labelBounds, `${path}.labelBounds`)
      : {
          x: (Math.min(...points.map((point) => point.x)) +
            Math.max(...points.map((point) => point.x))) /
            2 -
            60,
          y: (Math.min(...points.map((point) => point.y)) +
            Math.max(...points.map((point) => point.y))) /
            2 -
            12,
          width: 120,
          height: 24,
        };
    shapes.push(
      shapeBase(
        id,
        `Connector label ${id}`,
        labelBounds,
        '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/><a:ln><a:noFill/></a:ln>',
        textBodyXml(element.label, `${path}.label`, relationships),
      ),
    );
  }
  return shapes.join("");
}

function relationshipRegistry(notesSlideNumber = null) {
  const entries = [
    {
      id: "rId1",
      type: REL.slideLayout,
      target: "../slideLayouts/slideLayout1.xml",
      external: false,
    },
  ];
  if (notesSlideNumber !== null) {
    entries.push({
      id: `rId${entries.length + 1}`,
      type: REL.notesSlide,
      target: `../notesSlides/notesSlide${notesSlideNumber}.xml`,
      external: false,
    });
  }
  const images = new Map();
  const hyperlinks = new Map();
  const add = (type, target, external) => {
    const id = `rId${entries.length + 1}`;
    entries.push({ id, type, target, external });
    return id;
  };
  return {
    image(asset) {
      if (!images.has(asset.id)) {
        images.set(
          asset.id,
          add(REL.image, `../media/${asset.mediaPath.split("/").at(-1)}`, false),
        );
      }
      return images.get(asset.id);
    },
    hyperlink(href) {
      if (!hyperlinks.has(href)) {
        hyperlinks.set(href, add(REL.hyperlink, href, true));
      }
      return hyperlinks.get(href);
    },
    xml() {
      return relationshipsXml(entries);
    },
  };
}

function baseShapeTree() {
  return '<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>';
}

function buildSlide(slide, slideIndex, assets, notesSlideNumber = null) {
  const path = `slides[${slideIndex}]`;
  if (!slide || typeof slide !== "object" || Array.isArray(slide)) {
    fail(`${path} must be an object`);
  }
  if (!Array.isArray(slide.elements)) fail(`${path}.elements must be an array`);
  const relationships = relationshipRegistry(notesSlideNumber);
  let shapeId = 2;
  const nextId = () => shapeId++;
  const shapes = [];
  if (slide.backgroundAssetId !== undefined) {
    const asset = requireAsset(
      assets,
      slide.backgroundAssetId,
      `${path}.backgroundAssetId`,
    );
    if (asset.contentType !== "image/png") {
      fail(`${path}.backgroundAssetId must reference a PNG asset`);
    }
    const id = nextId();
    shapes.push(
      pictureXml(
        asset,
        {
          x: 0,
          y: 0,
          width: PPTX_DIMENSIONS.widthPx,
          height: PPTX_DIMENSIONS.heightPx,
        },
        id,
        relationships.image(asset),
        "Slide background",
      ),
    );
  }
  for (let index = 0; index < slide.elements.length; index += 1) {
    const element = slide.elements[index];
    const elementPath = `${path}.elements[${index}]`;
    if (!element || typeof element !== "object" || Array.isArray(element)) {
      fail(`${elementPath} must be an object`);
    }
    if (element.type === "text") {
      shapes.push(textShapeXml(element, elementPath, nextId(), relationships));
    } else if (element.type === "table") {
      shapes.push(tableXml(element, elementPath, nextId(), relationships));
    } else if (element.type === "image") {
      const asset = requireAsset(assets, element.assetId, `${elementPath}.assetId`);
      shapes.push(
        pictureXml(
          asset,
          boundsOf(element, elementPath),
          nextId(),
          relationships.image(asset),
        ),
      );
    } else if (element.type === "shape") {
      shapes.push(nativeShapeXml(element, elementPath, nextId(), relationships));
    } else if (element.type === "connector" || element.type === "polyline") {
      shapes.push(connectorXml(element, elementPath, nextId, relationships));
    } else {
      fail(`${elementPath}.type is not supported`);
    }
  }
  return {
    xml: `${XML}<p:sld xmlns:a="${NS_A}" xmlns:r="${NS_R}" xmlns:p="${NS_P}"><p:cSld><p:spTree>${baseShapeTree()}${shapes.join("")}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`,
    rels: relationships.xml(),
  };
}

function relationshipsXml(entries) {
  return `${XML}<Relationships xmlns="${NS_REL}">${entries
    .map(
      (entry) =>
        `<Relationship Id="${xmlEscape(entry.id)}" Type="${xmlEscape(entry.type)}" Target="${xmlEscape(entry.target)}"${
          entry.external ? ' TargetMode="External"' : ""
        }/>`,
    )
    .join("")}</Relationships>`;
}

function contentTypesXml(slideCount, assets, notesCount) {
  const imageTypes = new Map();
  for (const asset of assets.values()) {
    imageTypes.set(asset.extension, asset.contentType);
  }
  const defaults = [...imageTypes]
    .map(
      ([extension, contentType]) =>
        `<Default Extension="${extension}" ContentType="${contentType}"/>`,
    )
    .join("");
  const slides = Array.from(
    { length: slideCount },
    (_, index) =>
      `<Override PartName="/ppt/slides/slide${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`,
  ).join("");
  const notes = Array.from(
    { length: notesCount },
    (_, index) =>
      `<Override PartName="/ppt/notesSlides/notesSlide${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.notesSlide+xml"/>`,
  ).join("");
  const notesMaster =
    notesCount > 0
      ? '<Override PartName="/ppt/notesMasters/notesMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.notesMaster+xml"/>'
      : "";
  const notesTheme =
    notesCount > 0
      ? '<Override PartName="/ppt/theme/theme2.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>'
      : "";
  return `${XML}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>${defaults}<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/><Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/><Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/><Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/><Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>${notesTheme}${slides}${notesMaster}${notes}</Types>`;
}

function presentationXml(slideCount, notesCount) {
  const slides = Array.from(
    { length: slideCount },
    (_, index) =>
      `<p:sldId id="${256 + index}" r:id="rId${index + 2}"/>`,
  ).join("");
  const notesMaster =
    notesCount > 0
      ? `<p:notesMasterIdLst><p:notesMasterId r:id="rId${slideCount + 2}"/></p:notesMasterIdLst>`
      : "";
  return `${XML}<p:presentation xmlns:a="${NS_A}" xmlns:r="${NS_R}" xmlns:p="${NS_P}"><p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst>${notesMaster}<p:sldIdLst>${slides}</p:sldIdLst><p:sldSz cx="${PPTX_DIMENSIONS.widthEmu}" cy="${PPTX_DIMENSIONS.heightEmu}" type="screen16x9"/><p:notesSz cx="6858000" cy="9144000"/><p:defaultTextStyle/></p:presentation>`;
}

function presentationRelsXml(slideCount, notesCount) {
  const entries = [
    {
      id: "rId1",
      type: REL.slideMaster,
      target: "slideMasters/slideMaster1.xml",
    },
    ...Array.from({ length: slideCount }, (_, index) => ({
      id: `rId${index + 2}`,
      type: REL.slide,
      target: `slides/slide${index + 1}.xml`,
    })),
  ];
  if (notesCount > 0) {
    entries.push({
      id: `rId${slideCount + 2}`,
      type: REL.notesMaster,
      target: "notesMasters/notesMaster1.xml",
    });
  }
  return relationshipsXml(entries);
}

function coreXml(title) {
  return `${XML}<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${xmlEscape(title)}</dc:title><dc:creator>MarkdStage</dc:creator><cp:lastModifiedBy>MarkdStage</cp:lastModifiedBy></cp:coreProperties>`;
}

function appXml(slideCount, notesCount) {
  return `${XML}<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><Application>MarkdStage</Application><PresentationFormat>On-screen Show (16:9)</PresentationFormat><Slides>${slideCount}</Slides><Notes>${notesCount}</Notes><HiddenSlides>0</HiddenSlides><MMClips>0</MMClips><ScaleCrop>false</ScaleCrop><Company/><LinksUpToDate>false</LinksUpToDate><SharedDoc>false</SharedDoc><HyperlinksChanged>false</HyperlinksChanged><AppVersion>1.0</AppVersion></Properties>`;
}

function themeXml() {
  return `${XML}<a:theme xmlns:a="${NS_A}" name="MarkdStage"><a:themeElements><a:clrScheme name="MarkdStage"><a:dk1><a:sysClr val="windowText" lastClr="000000"/></a:dk1><a:lt1><a:sysClr val="window" lastClr="FFFFFF"/></a:lt1><a:dk2><a:srgbClr val="1F1F1F"/></a:dk2><a:lt2><a:srgbClr val="F2F2F2"/></a:lt2><a:accent1><a:srgbClr val="4472C4"/></a:accent1><a:accent2><a:srgbClr val="ED7D31"/></a:accent2><a:accent3><a:srgbClr val="A5A5A5"/></a:accent3><a:accent4><a:srgbClr val="FFC000"/></a:accent4><a:accent5><a:srgbClr val="5B9BD5"/></a:accent5><a:accent6><a:srgbClr val="70AD47"/></a:accent6><a:hlink><a:srgbClr val="0563C1"/></a:hlink><a:folHlink><a:srgbClr val="954F72"/></a:folHlink></a:clrScheme><a:fontScheme name="MarkdStage"><a:majorFont><a:latin typeface="Aptos Display"/><a:ea typeface="${JAPANESE_FONT_FACE}"/><a:cs typeface=""/><a:font script="Jpan" typeface="${JAPANESE_FONT_FACE}"/></a:majorFont><a:minorFont><a:latin typeface="Aptos"/><a:ea typeface="${JAPANESE_FONT_FACE}"/><a:cs typeface=""/><a:font script="Jpan" typeface="${JAPANESE_FONT_FACE}"/></a:minorFont></a:fontScheme><a:fmtScheme name="MarkdStage"><a:fillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="accent1"/></a:solidFill><a:solidFill><a:schemeClr val="accent2"/></a:solidFill></a:fillStyleLst><a:lnStyleLst><a:ln w="9525"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln><a:ln w="19050"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln><a:ln w="28575"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln></a:lnStyleLst><a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst><a:bgFillStyleLst><a:solidFill><a:schemeClr val="lt1"/></a:solidFill><a:solidFill><a:schemeClr val="lt2"/></a:solidFill><a:solidFill><a:schemeClr val="dk1"/></a:solidFill></a:bgFillStyleLst></a:fmtScheme></a:themeElements></a:theme>`;
}

function slideMasterXml() {
  return `${XML}<p:sldMaster xmlns:a="${NS_A}" xmlns:r="${NS_R}" xmlns:p="${NS_P}"><p:cSld name="MarkdStage"><p:spTree>${baseShapeTree()}</p:spTree></p:cSld><p:clrMap accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" bg1="lt1" bg2="lt2" folHlink="folHlink" hlink="hlink" tx1="dk1" tx2="dk2"/><p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst><p:txStyles><p:titleStyle/><p:bodyStyle/><p:otherStyle/></p:txStyles></p:sldMaster>`;
}

function slideLayoutXml() {
  return `${XML}<p:sldLayout xmlns:a="${NS_A}" xmlns:r="${NS_R}" xmlns:p="${NS_P}" type="blank" preserve="1"><p:cSld name="Blank"><p:spTree>${baseShapeTree()}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>`;
}

function notesPlaceholderXml({ id, name, type, idx, x, y, cx, cy, paragraphs = "" }) {
  return `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="${xmlEscape(name)}"/><p:cNvSpPr txBox="1"/><p:nvPr><p:ph type="${type}" idx="${idx}"/></p:nvPr></p:nvSpPr><p:spPr><a:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/><a:ln><a:noFill/></a:ln></p:spPr><p:txBody><a:bodyPr/><a:lstStyle/>${paragraphs || "<a:p/>"}</p:txBody></p:sp>`;
}

function notesParagraphsXml(notes) {
  return notes
    .split("\n")
    .map((line) => {
      if (!line) {
        return `<a:p><a:endParaRPr lang="en-US"><a:ea typeface="${JAPANESE_FONT_FACE}"/></a:endParaRPr></a:p>`;
      }
      const preserve = /^\s|\s$|\s{2}/.test(line) ? ' xml:space="preserve"' : "";
      return `<a:p><a:r><a:rPr lang="en-US" dirty="0"><a:ea typeface="${JAPANESE_FONT_FACE}"/></a:rPr><a:t${preserve}>${xmlEscape(line)}</a:t></a:r><a:endParaRPr lang="en-US"><a:ea typeface="${JAPANESE_FONT_FACE}"/></a:endParaRPr></a:p>`;
    })
    .join("");
}

function notesMasterXml() {
  const slideImage = notesPlaceholderXml({
    id: 2,
    name: "Slide Image Placeholder 1",
    type: "sldImg",
    idx: 1,
    x: 1143000,
    y: 685800,
    cx: 4572000,
    cy: 3429000,
  });
  const body = notesPlaceholderXml({
    id: 3,
    name: "Notes Placeholder 2",
    type: "body",
    idx: 2,
    x: 685800,
    y: 4343400,
    cx: 5486400,
    cy: 4114800,
  });
  return `${XML}<p:notesMaster xmlns:a="${NS_A}" xmlns:r="${NS_R}" xmlns:p="${NS_P}"><p:cSld name="Notes Master"><p:spTree>${baseShapeTree()}${slideImage}${body}</p:spTree></p:cSld><p:clrMap accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" bg1="lt1" bg2="lt2" folHlink="folHlink" hlink="hlink" tx1="dk1" tx2="dk2"/><p:notesStyle><a:lvl1pPr marL="0" algn="l"><a:defRPr sz="1200"><a:latin typeface="Aptos"/><a:ea typeface="${JAPANESE_FONT_FACE}"/></a:defRPr></a:lvl1pPr></p:notesStyle></p:notesMaster>`;
}

function notesSlideXml(notes) {
  const slideImage = notesPlaceholderXml({
    id: 2,
    name: "Slide Image Placeholder 1",
    type: "sldImg",
    idx: 1,
    x: 1143000,
    y: 685800,
    cx: 4572000,
    cy: 3429000,
  });
  const body = notesPlaceholderXml({
    id: 3,
    name: "Notes Placeholder 2",
    type: "body",
    idx: 2,
    x: 685800,
    y: 4343400,
    cx: 5486400,
    cy: 4114800,
    paragraphs: notesParagraphsXml(notes),
  });
  return `${XML}<p:notes xmlns:a="${NS_A}" xmlns:r="${NS_R}" xmlns:p="${NS_P}"><p:cSld><p:spTree>${baseShapeTree()}${slideImage}${body}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:notes>`;
}

function notesSlideRelsXml(slideIndex) {
  return relationshipsXml([
    {
      id: "rId1",
      type: REL.notesMaster,
      target: "../notesMasters/notesMaster1.xml",
    },
    {
      id: "rId2",
      type: REL.slide,
      target: `../slides/slide${slideIndex + 1}.xml`,
    },
  ]);
}

function normalizedNotes(slide, slideIndex) {
  const path = `slides[${slideIndex}]`;
  if (!slide || typeof slide !== "object" || Array.isArray(slide)) {
    fail(`${path} must be an object`);
  }
  if (slide.notes === undefined || slide.notes === null || slide.notes === "") return "";
  if (typeof slide.notes !== "string") fail(`${path}.notes must be a string`);
  return slide.notes.replace(/\r\n?/g, "\n").trim();
}

function crc32(data) {
  let crc = 0xffffffff;
  for (const byte of data) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function zipStored(entries) {
  if (entries.length > 0xffff) throw new RangeError("ZIP contains too many entries");
  const localParts = [];
  const centralParts = [];
  let offset = 0;
  for (const entry of entries) {
    const name = Buffer.from(entry.name, "utf8");
    const data = Buffer.isBuffer(entry.data)
      ? entry.data
      : Buffer.from(entry.data, "utf8");
    if (name.length > 0xffff || data.length > 0xffffffff) {
      throw new RangeError("ZIP entry is too large");
    }
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt16LE(0, 10);
    local.writeUInt16LE(0x0021, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    localParts.push(local, name, data);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt16LE(0, 12);
    central.writeUInt16LE(0x0021, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);
    centralParts.push(central, name);
    offset += local.length + name.length + data.length;
  }
  const centralDirectory = Buffer.concat(centralParts);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralDirectory.length, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20);
  return Buffer.concat([...localParts, centralDirectory, eocd]);
}

function packageEntries(buffer) {
  if (!Buffer.isBuffer(buffer)) {
    throw new TypeError("PowerPoint package must be a Buffer");
  }
  let eocdOffset = -1;
  const minimum = Math.max(0, buffer.length - 65557);
  for (let offset = buffer.length - 22; offset >= minimum; offset -= 1) {
    if (buffer.readUInt32LE(offset) === 0x06054b50) {
      eocdOffset = offset;
      break;
    }
  }
  if (eocdOffset < 0) throw new Error("Invalid ZIP: EOCD record is missing");
  const count = buffer.readUInt16LE(eocdOffset + 10);
  const centralSize = buffer.readUInt32LE(eocdOffset + 12);
  const centralOffset = buffer.readUInt32LE(eocdOffset + 16);
  const commentLength = buffer.readUInt16LE(eocdOffset + 20);
  if (eocdOffset + 22 + commentLength !== buffer.length) {
    throw new Error("Invalid ZIP: EOCD length is inconsistent");
  }
  if (centralOffset + centralSize !== eocdOffset) {
    throw new Error("Invalid ZIP: central directory is inconsistent");
  }
  const files = new Map();
  let cursor = centralOffset;
  for (let index = 0; index < count; index += 1) {
    if (cursor + 46 > eocdOffset || buffer.readUInt32LE(cursor) !== 0x02014b50) {
      throw new Error("Invalid ZIP: central directory entry is missing");
    }
    const method = buffer.readUInt16LE(cursor + 10);
    const crc = buffer.readUInt32LE(cursor + 16);
    const compressedSize = buffer.readUInt32LE(cursor + 20);
    const size = buffer.readUInt32LE(cursor + 24);
    const nameLength = buffer.readUInt16LE(cursor + 28);
    const extraLength = buffer.readUInt16LE(cursor + 30);
    const entryCommentLength = buffer.readUInt16LE(cursor + 32);
    const localOffset = buffer.readUInt32LE(cursor + 42);
    const name = buffer
      .subarray(cursor + 46, cursor + 46 + nameLength)
      .toString("utf8");
    if (files.has(name)) throw new Error(`Invalid ZIP: duplicate entry "${name}"`);
    if (method !== 0 || compressedSize !== size) {
      throw new Error(`Invalid ZIP: "${name}" is not stored`);
    }
    if (
      localOffset + 30 > centralOffset ||
      buffer.readUInt32LE(localOffset) !== 0x04034b50
    ) {
      throw new Error(`Invalid ZIP: local header for "${name}" is missing`);
    }
    const localNameLength = buffer.readUInt16LE(localOffset + 26);
    const localExtraLength = buffer.readUInt16LE(localOffset + 28);
    const localName = buffer
      .subarray(localOffset + 30, localOffset + 30 + localNameLength)
      .toString("utf8");
    const dataOffset = localOffset + 30 + localNameLength + localExtraLength;
    const data = buffer.subarray(dataOffset, dataOffset + size);
    if (localName !== name || data.length !== size || crc32(data) !== crc) {
      throw new Error(`Invalid ZIP: local data for "${name}" is inconsistent`);
    }
    files.set(name, { data, size, crc32: crc });
    cursor += 46 + nameLength + extraLength + entryCommentLength;
  }
  if (cursor !== eocdOffset) {
    throw new Error("Invalid ZIP: central directory size is inconsistent");
  }
  return files;
}

export function buildPptxPackage({ title = "Presentation", slides, assets = [] } = {}) {
  if (typeof title !== "string") fail("title must be a string");
  if (!Array.isArray(slides) || slides.length === 0) {
    fail("slides must be a non-empty array");
  }
  if (slides.length > 0x7ffffeff) fail("slides contains too many items");
  const normalizedAssets = normalizeAssets(assets);
  const notesSlides = [];
  const builtSlides = slides.map((slide, index) => {
    const notes = normalizedNotes(slide, index);
    const notesSlideNumber = notes ? notesSlides.length + 1 : null;
    const built = buildSlide(slide, index, normalizedAssets, notesSlideNumber);
    if (notes) {
      notesSlides.push({
        notes,
        slideIndex: index,
        number: notesSlideNumber,
      });
    }
    return built;
  });
  const entries = [
    {
      name: "[Content_Types].xml",
      data: contentTypesXml(slides.length, normalizedAssets, notesSlides.length),
    },
    {
      name: "_rels/.rels",
      data: relationshipsXml([
        { id: "rId1", type: REL.officeDocument, target: "ppt/presentation.xml" },
        { id: "rId2", type: REL.core, target: "docProps/core.xml" },
        { id: "rId3", type: REL.app, target: "docProps/app.xml" },
      ]),
    },
    { name: "docProps/core.xml", data: coreXml(title) },
    { name: "docProps/app.xml", data: appXml(slides.length, notesSlides.length) },
    {
      name: "ppt/presentation.xml",
      data: presentationXml(slides.length, notesSlides.length),
    },
    {
      name: "ppt/_rels/presentation.xml.rels",
      data: presentationRelsXml(slides.length, notesSlides.length),
    },
    { name: "ppt/theme/theme1.xml", data: themeXml() },
    { name: "ppt/slideMasters/slideMaster1.xml", data: slideMasterXml() },
    {
      name: "ppt/slideMasters/_rels/slideMaster1.xml.rels",
      data: relationshipsXml([
        {
          id: "rId1",
          type: REL.slideLayout,
          target: "../slideLayouts/slideLayout1.xml",
        },
        { id: "rId2", type: REL.theme, target: "../theme/theme1.xml" },
      ]),
    },
    { name: "ppt/slideLayouts/slideLayout1.xml", data: slideLayoutXml() },
    {
      name: "ppt/slideLayouts/_rels/slideLayout1.xml.rels",
      data: relationshipsXml([
        {
          id: "rId1",
          type: REL.slideMaster,
          target: "../slideMasters/slideMaster1.xml",
        },
      ]),
    },
    ...(notesSlides.length
      ? [
          { name: "ppt/theme/theme2.xml", data: themeXml() },
          { name: "ppt/notesMasters/notesMaster1.xml", data: notesMasterXml() },
          {
            name: "ppt/notesMasters/_rels/notesMaster1.xml.rels",
            data: relationshipsXml([
              { id: "rId1", type: REL.theme, target: "../theme/theme2.xml" },
            ]),
          },
        ]
      : []),
    ...builtSlides.flatMap((slide, index) => [
      { name: `ppt/slides/slide${index + 1}.xml`, data: slide.xml },
      {
        name: `ppt/slides/_rels/slide${index + 1}.xml.rels`,
        data: slide.rels,
      },
    ]),
    ...notesSlides.flatMap((notesSlide) => [
      {
        name: `ppt/notesSlides/notesSlide${notesSlide.number}.xml`,
        data: notesSlideXml(notesSlide.notes),
      },
      {
        name: `ppt/notesSlides/_rels/notesSlide${notesSlide.number}.xml.rels`,
        data: notesSlideRelsXml(notesSlide.slideIndex),
      },
    ]),
    ...[...normalizedAssets.values()].map((asset) => ({
      name: asset.mediaPath,
      data: asset.data,
    })),
  ];
  return zipStored(entries);
}

export function inspectPptxPackage(buffer) {
  const files = packageEntries(buffer);
  const presentation = files.get("ppt/presentation.xml")?.data.toString("utf8");
  if (!presentation) throw new Error("Invalid PowerPoint package: presentation.xml is missing");
  const dimensions = /<p:sldSz\b[^>]*\bcx="(\d+)"[^>]*\bcy="(\d+)"/.exec(
    presentation,
  );
  if (!dimensions) throw new Error("Invalid PowerPoint package: slide dimensions are missing");
  const slideNames = [...files.keys()]
    .filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name))
    .sort((left, right) => {
      const number = (name) => Number(/\d+/.exec(name)[0]);
      return number(left) - number(right);
    });
  const notesNames = [...files.keys()].filter((name) =>
    /^ppt\/notesSlides\/notesSlide\d+\.xml$/.test(name),
  );
  const core = files.get("docProps/core.xml")?.data.toString("utf8") || "";
  const title = /<dc:title>([\s\S]*?)<\/dc:title>/.exec(core);
  return {
    valid: true,
    byteLength: buffer.length,
    entries: [...files].map(([name, entry]) => ({
      name,
      size: entry.size,
      crc32: entry.crc32,
    })),
    slideCount: slideNames.length,
    notesCount: notesNames.length,
    mediaCount: [...files.keys()].filter((name) => name.startsWith("ppt/media/"))
      .length,
    dimensions: {
      widthEmu: Number(dimensions[1]),
      heightEmu: Number(dimensions[2]),
    },
    title: title ? xmlUnescape(title[1]) : "",
  };
}
