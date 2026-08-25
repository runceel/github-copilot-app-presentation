// 1 枚の Markdown ファイルを「スライド 1 枚分の Markdown 断片」の配列へ分割する。
//
// これまで分割は Skill（生成 AI）側の責務だったが、canvas から直接 Markdown を
// インポートできるようにするため、本体（拡張機能）側にも機械的な分割を持たせる。
// 文章の要約やスライド化の判断は行わない。純粋な分割・front matter の合成だけを担う。
//
// 実行時 npm 依存は持たない（拡張は ZIP 配布されるため）。

// 開始フェンス。marked と同じく ``` / ~~~ の 3 個以上、情報文字列は 1 語だけ見る。
const FENCE_OPEN = /^([ \t]{0,3})(`{3,}|~{3,})[ \t]*([^\s`~]*)[ \t]*$/;

// スライド区切り。行頭から `---`（3 個以上のハイフン）だけの行。`***` / `___` の
// 水平線は区切りにしない（front matter と同じ記号だけを区切りとして扱う）。
const SEPARATOR = /^[ \t]{0,3}-{3,}[ \t]*$/;

// front matter の 1 行。`key: value`。値は空でもよい。
const META_LINE = /^([A-Za-z][\w-]*)[ \t]*:(.*)$/;

// front matter 内で許すコメント行。
const META_COMMENT = /^[ \t]*#/;

// デッキ front matter から各スライドへ継承しないキー。
// - layout: 継承すると全ページが表紙／背表紙になってしまう。ただしファイル先頭の
//   front matter は 1 枚目自身の front matter でもあるため、1 枚目にだけは効かせる。
// - page:   通し番号はスライドごとに決まる（デッキ全体の値には意味がない）
const NON_INHERITED_KEYS = new Set(["layout", "page"]);

// 自動ページ番号を振らないレイアウト（表紙・セクション区切り・背表紙）。
const UNNUMBERED_LAYOUTS = new Set(["title", "section", "backcover"]);

function normalizeText(text) {
  return String(text).replace(/\r\n?/g, "\n").replace(/^\uFEFF/, "");
}

/**
 * front matter ブロック（`---` 〜 `---`）を 1 つ読む。
 *
 * lines[start] が `---` で、閉じる `---` までの中身が `key: value`・空行・
 * コメントだけのときに限り front matter とみなす。条件を満たさないときは null を
 * 返し、呼び出し側は通常の区切り／本文として扱う。
 *
 * この「中身を見てから判断する」方式により、スライド区切りの `---` の直後に置かれた
 * ページごとの front matter を、余分なスライドとして割ってしまうことを防ぐ。
 */
function readFrontMatterAt(lines, start) {
  if (!SEPARATOR.test(lines[start] ?? "")) return null;
  const entries = [];
  for (let i = start + 1; i < lines.length; i += 1) {
    const line = lines[i];
    if (SEPARATOR.test(line)) {
      // 中身が空の `---` `---` は front matter とみなさない（水平線 2 本と区別できない）。
      if (!entries.length) return null;
      return { meta: entriesToMeta(entries), end: i };
    }
    if (line.trim() === "" || META_COMMENT.test(line)) continue;
    const matched = META_LINE.exec(line);
    if (!matched) return null;
    entries.push([matched[1], matched[2].trim()]);
  }
  return null;
}

function entriesToMeta(entries) {
  const meta = new Map();
  for (const [key, value] of entries) meta.set(key.toLowerCase(), { key, value });
  return meta;
}

function metaLayout(meta) {
  return (meta.get("layout")?.value || "").toLowerCase();
}

/** front matter の Map を `---` で囲んだテキストへ戻す。 */
function formatFrontMatter(meta) {
  if (!meta.size) return "";
  const lines = ["---"];
  for (const { key, value } of meta.values()) {
    lines.push(value === "" ? `${key}:` : `${key}: ${value}`);
  }
  lines.push("---");
  return lines.join("\n");
}

/**
 * Markdown ファイル全体を、デッキ共通 front matter と各スライドへ分割する。
 *
 * 戻り値の slides は `{ meta, body }` の配列（meta は key(lower) → { key, value }）。
 *
 * 分割規則:
 * - コードフェンス内の `---` は区切りにしない。
 * - ファイル先頭の front matter はデッキ共通設定として取り出す。
 * - 区切り直後（または本文の途中でも先頭が空のとき）の front matter は、その
 *   スライドのものとして取り込む。
 * - 直前の行が空行でない `---` は setext 見出し（H2）とみなし、区切りにしない。
 */
export function splitMarkdownDeck(text) {
  const lines = normalizeText(text).split("\n");
  let cursor = 0;

  // 先頭の空行を飛ばしてから、デッキ共通 front matter を読む。
  while (cursor < lines.length && lines[cursor].trim() === "") cursor += 1;
  let deckMeta = new Map();
  const deckFrontMatter = readFrontMatterAt(lines, cursor);
  if (deckFrontMatter) {
    deckMeta = deckFrontMatter.meta;
    cursor = deckFrontMatter.end + 1;
  }

  const slides = [];
  let meta = new Map();
  let body = [];
  let sawContent = false;
  let fence = null;

  const flush = () => {
    const text = body.join("\n").trim();
    if (text || meta.size) slides.push({ meta, body: text });
    meta = new Map();
    body = [];
    sawContent = false;
  };

  for (let i = cursor; i < lines.length; i += 1) {
    const line = lines[i];

    if (fence) {
      body.push(line);
      if (new RegExp(`^[ \\t]{0,3}[${fence[0]}]{${fence.length},}[ \\t]*$`).test(line)) {
        fence = null;
      }
      continue;
    }

    const open = FENCE_OPEN.exec(line);
    if (open) {
      fence = open[2];
      body.push(line);
      sawContent = true;
      continue;
    }

    if (SEPARATOR.test(line)) {
      // 直前が空行でない `---` は setext 見出し（H2）なので、区切りにはしない。
      // front matter の判定より先に見ることで、見出し直後の `key: value` らしき
      // 段落を front matter と誤認しない。
      const previous = i > 0 ? lines[i - 1] : "";
      if (sawContent && previous.trim() !== "") {
        body.push(line);
        continue;
      }
      // 区切りの `---` は、そのまま次のスライドの front matter の開始行にもなれる
      // （`---` / `key: value` / `---` の形）。中身を見て front matter だと分かった
      // ときだけ取り込み、余分な空スライドとして割らない。
      const front = readFrontMatterAt(lines, i);
      if (front) {
        // 何も溜まっていなければ、このスライド自身の front matter。
        if (sawContent || meta.size) flush();
        meta = front.meta;
        i = front.end;
        continue;
      }
      flush();
      continue;
    }

    body.push(line);
    if (line.trim() !== "") sawContent = true;
  }
  flush();

  return { deckMeta, slides };
}

/**
 * Markdown ファイルを、拡張機能がそのまま表示できるスライド断片の配列へ変換する。
 *
 * - デッキ共通 front matter を各スライドへ継承する（スライド側の指定が優先）。
 * - `layout` は継承しない。ただしファイル先頭の front matter は 1 枚目自身の
 *   front matter でもあるため、1 枚目にだけは効かせる（`layout: title` など）。
 * - `page` / `total` は、デッキにもスライドにも指定が無いときだけ自動付与する。
 *   表紙・セクション区切り・背表紙には振らない（通し番号の対象にはする）。
 */
export function buildDeckSlides(text) {
  const { deckMeta, slides } = splitMarkdownDeck(text);
  if (!slides.length) return [];

  const merged = slides.map((slide, i) => {
    const meta = new Map();
    for (const [key, entry] of deckMeta) {
      // ファイル先頭の front matter は 1 枚目のものでもあるので、layout も渡す。
      if (NON_INHERITED_KEYS.has(key) && !(i === 0 && key === "layout")) continue;
      meta.set(key, entry);
    }
    for (const [key, entry] of slide.meta) meta.set(key, entry);
    return { meta, body: slide.body };
  });

  const total = String(merged.filter((slide) => metaLayout(slide.meta) !== "backcover").length);

  let ordinal = 0;
  return merged.map((slide) => {
    const layout = metaLayout(slide.meta);
    if (layout !== "backcover") ordinal += 1;
    if (!UNNUMBERED_LAYOUTS.has(layout)) {
      if (!slide.meta.has("page")) {
        slide.meta.set("page", { key: "page", value: String(ordinal) });
      }
      if (!slide.meta.has("total")) {
        slide.meta.set("total", { key: "total", value: total });
      }
    }

    const front = formatFrontMatter(slide.meta);
    if (!front) return slide.body;
    return slide.body ? `${front}\n${slide.body}` : front;
  });
}
