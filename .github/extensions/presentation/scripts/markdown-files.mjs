// workspace 内の Markdown を探すユーティリティ。
//
// canvas の 📂 ボタン（Markdown インポート）から使う。extension.mjs と
// テストハーネスの両方から import できるよう、SDK にも canvas の状態にも
// 依存しない純粋な関数として切り出してある。

import { readdir } from "node:fs/promises";
import { extname, join, relative, resolve, sep } from "node:path";

export const MARKDOWN_EXTENSIONS = new Set([".md", ".markdown"]);
export const MARKDOWN_SCAN_MAX_FILES = 500;
export const MARKDOWN_SCAN_MAX_DEPTH = 6;
export const MARKDOWN_MAX_BYTES = 2 * 1024 * 1024;

// 生成物が溜まりやすく、スライドのソースが置かれることはまずないディレクトリ。
// ドット始まり（.git など）は名前で一括除外するのでここには挙げない。
const SKIP_DIRS = new Set(["node_modules", "vendor", "out", "dist", "build"]);

export function isMarkdownPath(path) {
  return MARKDOWN_EXTENSIONS.has(extname(path).toLowerCase());
}

/**
 * rootDir 配下の Markdown を再帰的に集め、相対パス（`/` 区切り）で返す。
 * 巨大リポジトリで走査が止まらなくならないよう、件数と深さに上限を設ける。
 *
 * @returns {Promise<{ files: string[], truncated: boolean }>}
 */
export async function listMarkdownFiles(rootDir) {
  const root = resolve(rootDir);
  const files = [];
  let truncated = false;

  const walk = async (dir, depth) => {
    if (truncated || depth > MARKDOWN_SCAN_MAX_DEPTH) return;
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch (_) {
      return;
    }
    for (const entry of entries) {
      if (truncated) return;
      if (entry.name.startsWith(".")) continue;
      const abs = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) continue;
        await walk(abs, depth + 1);
        continue;
      }
      if (!entry.isFile() || !isMarkdownPath(entry.name)) continue;
      if (files.length >= MARKDOWN_SCAN_MAX_FILES) {
        truncated = true;
        return;
      }
      files.push(relative(root, abs).split(sep).join("/"));
    }
  };

  await walk(root, 0);
  files.sort((a, b) => a.localeCompare(b));
  return { files, truncated };
}
