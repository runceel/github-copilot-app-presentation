const FENCE_OPEN = /^([ \t]{0,3})(`{3,}|~{3,})[ \t]*([^\s`~]*)[ \t]*$/;
const SLIDE_SIZE_DIRECTIVE = /^slide-size[ \t]*:/i;

function normalizeText(text) {
  return String(text ?? "").replace(/\r\n?/g, "\n");
}

function normalizeNote(text) {
  const lines = normalizeText(text).split("\n");
  while (lines.length && lines[0].trim() === "") lines.shift();
  while (lines.length && lines.at(-1).trim() === "") lines.pop();
  if (!lines.length) return "";

  const indents = lines
    .filter((line) => line.trim())
    .map((line) => line.match(/^[ \t]*/)?.[0].length ?? 0);
  const indent = indents.length ? Math.min(...indents) : 0;
  return lines.map((line) => line.slice(indent)).join("\n").trim();
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

function xmlSafeText(text) {
  return [...text]
    .map((character) => (isXmlCodePoint(character.codePointAt(0)) ? character : "\uFFFD"))
    .join("");
}

function decodeEntities(text) {
  const named = new Map([
    ["amp", "&"],
    ["apos", "'"],
    ["gt", ">"],
    ["lt", "<"],
    ["nbsp", " "],
    ["quot", '"'],
  ]);
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (entity, value) => {
    if (value[0] !== "#") return named.get(value.toLowerCase()) ?? entity;
    const codePoint =
      value[1]?.toLowerCase() === "x"
        ? Number.parseInt(value.slice(2), 16)
        : Number.parseInt(value.slice(1), 10);
    if (!Number.isSafeInteger(codePoint) || codePoint < 0 || codePoint > 0x10ffff) {
      return entity;
    }
    return isXmlCodePoint(codePoint) ? String.fromCodePoint(codePoint) : "\uFFFD";
  });
}

function htmlEntityDecoder(documentRef) {
  if (!documentRef || typeof documentRef.createElement !== "function") {
    return decodeEntities;
  }
  const textarea = documentRef.createElement("textarea");
  return (text) => {
    textarea.innerHTML = text;
    return textarea.value;
  };
}

function htmlTagEnd(value, start) {
  let quote = "";
  for (let index = start + 1; index < value.length; index += 1) {
    const character = value[index];
    if (quote) {
      if (character === quote) quote = "";
    } else if (character === '"' || character === "'") {
      quote = character;
    } else if (character === ">") {
      return index;
    }
  }
  return -1;
}

function htmlTokenText(value, decodeHtml) {
  const blockTags = new Set([
    "address",
    "article",
    "aside",
    "blockquote",
    "div",
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "li",
    "p",
    "pre",
    "section",
    "tr",
  ]);
  let output = "";
  let cursor = 0;
  while (cursor < value.length) {
    const start = value.indexOf("<", cursor);
    if (start < 0) {
      output += value.slice(cursor);
      break;
    }
    output += value.slice(cursor, start);
    if (value.startsWith("<!--", start)) {
      const end = value.indexOf("-->", start + 4);
      cursor = end < 0 ? value.length : end + 3;
      continue;
    }
    const end = htmlTagEnd(value, start);
    if (end < 0) {
      output += value.slice(start);
      break;
    }
    const source = value.slice(start + 1, end).trim();
    const closing = source.startsWith("/");
    const name = /^\/?\s*([a-z][a-z0-9-]*)/i.exec(source)?.[1]?.toLowerCase();
    if (!name) {
      output += value.slice(start, end + 1);
    } else if (name === "br") {
      output += "\n";
    } else if (!closing && name === "li") {
      output += "• ";
    } else if (closing && blockTags.has(name)) {
      output += "\n";
    }
    cursor = end + 1;
  }
  return decodeHtml(output);
}

function inlineTokensText(tokens, decodeHtml) {
  return (Array.isArray(tokens) ? tokens : [])
    .map((token) => {
      if (!token || typeof token !== "object") return "";
      if (token.type === "br") return "\n";
      if (token.type === "codespan" || token.type === "escape") {
        return decodeHtml(token.text || "");
      }
      if (token.type === "image") return decodeHtml(token.text || "");
      if (token.type === "html") {
        return htmlTokenText(token.text || token.raw || "", decodeHtml);
      }
      if (token.type === "link") {
        const label =
          inlineTokensText(token.tokens, decodeHtml) ||
          decodeHtml(token.text || token.href || "");
        const href = decodeHtml(token.href || "");
        if (!href || href === label || href === `mailto:${label}`) return label;
        return `${label} (${href})`;
      }
      if (Array.isArray(token.tokens)) return inlineTokensText(token.tokens, decodeHtml);
      return decodeHtml(token.text || "");
    })
    .join("");
}

function listTokenText(token, depth, decodeHtml) {
  const orderedStart = Number.isInteger(Number(token.start)) ? Number(token.start) : 1;
  return token.items
    .map((item, itemIndex) => {
      const marker = item.task
        ? item.checked
          ? "☒ "
          : "☐ "
        : token.ordered
          ? `${orderedStart + itemIndex}. `
          : "• ";
      const indent = "  ".repeat(depth);
      const continuation = `${indent}${" ".repeat(marker.length)}`;
      const lines = [];
      let started = false;
      for (const child of item.tokens || []) {
        if (child.type === "space") continue;
        if (child.type === "list") {
          lines.push(listTokenText(child, depth + 1, decodeHtml));
          continue;
        }
        const text = blockTokenText(child, depth, decodeHtml).trim();
        if (!text) continue;
        const childLines = text.split("\n");
        if (!started) {
          lines.push(`${indent}${marker}${childLines.shift() || ""}`);
          started = true;
        }
        lines.push(...childLines.map((line) => continuation + line));
        if (started && child.type === "paragraph" && lines.length > 1) {
          lines.push("");
        }
      }
      if (lines.at(-1) === "") lines.pop();
      return lines.join("\n");
    })
    .join("\n");
}

function tableTokenText(token, decodeHtml) {
  const rows = [
    token.header || [],
    ...(Array.isArray(token.rows) ? token.rows : []),
  ];
  return rows
    .map((row) =>
      row.map((cell) => inlineTokensText(cell.tokens, decodeHtml)).join(" | "),
    )
    .join("\n");
}

function blockTokenText(token, listDepth, decodeHtml) {
  if (!token || typeof token !== "object") return "";
  if (["heading", "paragraph", "text"].includes(token.type)) {
    return inlineTokensText(token.tokens, decodeHtml) || decodeHtml(token.text || "");
  }
  if (token.type === "code") return token.text || "";
  if (token.type === "blockquote") {
    return blockTokensText(token.tokens, listDepth, decodeHtml);
  }
  if (token.type === "list") return listTokenText(token, listDepth, decodeHtml);
  if (token.type === "table") return tableTokenText(token, decodeHtml);
  if (token.type === "html") {
    return htmlTokenText(token.text || token.raw || "", decodeHtml);
  }
  if (Array.isArray(token.tokens)) {
    return blockTokensText(token.tokens, listDepth, decodeHtml);
  }
  return token.type === "space" || token.type === "hr"
    ? ""
    : decodeHtml(token.text || "");
}

function blockTokensText(tokens, listDepth, decodeHtml) {
  return (Array.isArray(tokens) ? tokens : [])
    .map((token) => blockTokenText(token, listDepth, decodeHtml).trimEnd())
    .filter(Boolean)
    .join("\n\n");
}

/**
 * Convert speaker-note Markdown into readable plain text for PowerPoint notes.
 *
 * Paragraphs, list indentation, code contents, link destinations, and table
 * columns remain readable while presentation-only Markdown markers are removed.
 */
export function speakerNotesToPlainText(
  markdown,
  markedApi = globalThis.marked,
  documentRef = globalThis.document,
) {
  if (!markedApi || typeof markedApi.lexer !== "function") {
    throw new TypeError("A Marked lexer is required to convert speaker notes.");
  }
  const tokens = markedApi.lexer(normalizeText(markdown), { gfm: true });
  const decodeHtml = htmlEntityDecoder(documentRef);
  return xmlSafeText(blockTokensText(tokens, 0, decodeHtml))
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function closesFence(line, fence) {
  const indentation = line.match(/^[ \t]*/)?.[0].length ?? 0;
  if (indentation > 3) return false;
  const trimmed = line.slice(indentation).trimEnd();
  if (!trimmed || trimmed[0] !== fence[0]) return false;
  let count = 0;
  while (trimmed[count] === fence[0]) count += 1;
  return count >= fence.length && trimmed.slice(count).trim() === "";
}

function parseSpeakerNotes(markdown) {
  const notes = [];
  const output = [];
  let fence = "";
  let comment = null;

  for (const line of normalizeText(markdown).split("\n")) {
    if (comment === null && fence) {
      if (closesFence(line, fence)) fence = "";
      output.push(line);
      continue;
    }

    if (comment === null) {
      const opening = FENCE_OPEN.exec(line);
      if (opening) {
        fence = opening[2];
        output.push(line);
        continue;
      }
    }

    let visible = "";
    let cursor = 0;
    while (cursor <= line.length) {
      if (comment === null) {
        const start = line.indexOf("<!--", cursor);
        if (start < 0) {
          visible += line.slice(cursor);
          break;
        }
        const before = visible + line.slice(cursor, start);
        if (before.trim() || before.length > 3) {
          visible += line.slice(cursor);
          break;
        }
        visible = before;
        comment = [];
        cursor = start + 4;
      }

      const end = line.indexOf("-->", cursor);
      if (end < 0) {
        comment.push(line.slice(cursor), "\n");
        break;
      }

      comment.push(line.slice(cursor, end));
      const note = normalizeNote(comment.join(""));
      if (note && !SLIDE_SIZE_DIRECTIVE.test(note)) notes.push(note);
      comment = null;
      cursor = end + 3;
    }
    output.push(visible);
  }

  return {
    markdown: output.join("\n"),
    notes: notes.join("\n\n"),
  };
}

/**
 * Extract Slidev/Marp-style speaker notes from top-level HTML comments.
 *
 * Comments inside fenced code examples are ignored. The renderer's
 * `slide-size:` comment is a display directive rather than a speaker note.
 */
export function extractSpeakerNotes(markdown) {
  return parseSpeakerNotes(markdown).notes;
}

/** Remove speaker-note comments while preserving comments in fenced examples. */
export function stripSpeakerNotes(markdown) {
  return parseSpeakerNotes(markdown).markdown;
}

/** Return visible Markdown and speaker notes from one parser pass. */
export function splitSpeakerNotes(markdown) {
  return parseSpeakerNotes(markdown);
}
