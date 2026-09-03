import { readdir, readFile, stat } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";

const DOCUMENTATION_PATHS = [
  "README.md",
  "README.ja.md",
  "DESIGN.md",
  "PRODUCT.md",
  ".github/RELEASING.md",
  ".github/release-notes",
  ".github/extensions/markdstage/README.md",
  ".github/extensions/markdstage/THIRD-PARTY-NOTICES.md",
  ".github/extensions/markdstage/docs",
  ".github/extensions/markdstage/schema/README.md",
  "docs/user-guide",
  "packages/markdstage-cli/README.md",
  "apps/MarkdStage.Desktop/README.md",
];

async function pathExists(path) {
  try {
    await stat(path);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

async function collectMarkdownFiles(path) {
  if (!(await pathExists(path))) return [];
  const metadata = await stat(path);
  if (metadata.isFile()) return path.endsWith(".md") ? [path] : [];
  if (!metadata.isDirectory()) return [];

  const entries = await readdir(path, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map((entry) => collectMarkdownFiles(resolve(path, entry.name))),
  );
  return nested.flat();
}

function localDestination(destination) {
  let value = destination.trim();
  if (value.startsWith("<") && value.endsWith(">")) value = value.slice(1, -1);
  if (
    !value ||
    value.startsWith("#") ||
    value.startsWith("/") ||
    value.startsWith("//") ||
    /^[a-z][a-z0-9+.-]*:/i.test(value)
  ) {
    return undefined;
  }

  value = value.split("#", 1)[0].split("?", 1)[0];
  if (!value) return undefined;
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export function extractLocalLinks(markdown) {
  const links = [];
  const lines = markdown.split(/\r?\n/);
  let fence;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const fenceMatch = line.match(/^\s*(`{3,}|~{3,})/);
    if (fenceMatch) {
      if (!fence) fence = fenceMatch[1][0];
      else if (fence === fenceMatch[1][0]) fence = undefined;
      continue;
    }
    if (fence) continue;

    const withoutCode = line.replace(/`[^`]*`/g, "");
    const reference = withoutCode.match(
      /^\s{0,3}\[[^\]]+]:\s*(<[^>]+>|[^\s]+)(?:\s+.*)?$/,
    );
    if (reference) {
      const destination = localDestination(reference[1]);
      if (destination) links.push({ destination, line: index + 1 });
      continue;
    }

    const inline = /(?<!!)\[[^\]]*]\(\s*(<[^>]+>|[^\s)]+)(?:\s+["'][^)]*["'])?\s*\)/g;
    for (const match of withoutCode.matchAll(inline)) {
      const destination = localDestination(match[1]);
      if (destination) links.push({ destination, line: index + 1 });
    }
  }

  return links;
}

export async function findBrokenMarkdownLinks(repoRoot, files) {
  const issues = [];
  for (const file of files) {
    const markdown = await readFile(file, "utf8");
    for (const link of extractLocalLinks(markdown)) {
      const target = resolve(dirname(file), link.destination);
      const fromRoot = relative(repoRoot, target);
      const outsideRepo =
        isAbsolute(fromRoot) || fromRoot === ".." || fromRoot.startsWith(`..${sep}`);
      if (outsideRepo || !(await pathExists(target))) {
        issues.push({
          file: relative(repoRoot, file).replaceAll("\\", "/"),
          line: link.line,
          destination: link.destination,
        });
      }
    }
  }
  return issues;
}

export async function documentationFiles(repoRoot) {
  const groups = await Promise.all(
    DOCUMENTATION_PATHS.map((path) => collectMarkdownFiles(resolve(repoRoot, path))),
  );
  return [...new Set(groups.flat())].sort();
}

async function main() {
  const repoRoot = resolve(process.cwd());
  const files = await documentationFiles(repoRoot);
  const issues = await findBrokenMarkdownLinks(repoRoot, files);
  if (issues.length > 0) {
    for (const issue of issues) {
      console.error(`${issue.file}:${issue.line}: missing local link ${issue.destination}`);
    }
    process.exitCode = 1;
    return;
  }
  console.log(`OK: ${files.length} documentation files have valid local links.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
