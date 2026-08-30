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
