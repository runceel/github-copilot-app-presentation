import { mkdtemp, readFile, rm } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const testDirectory = dirname(fileURLToPath(import.meta.url));
export const repository = resolve(testDirectory, "../..");

export async function createWorkspace() {
  const directory = await mkdtemp(join(testDirectory, ".work-"));
  return {
    directory,
    dispose: () => rm(directory, { recursive: true, force: true }),
  };
}

export async function readContent() {
  const json = async (name) => JSON.parse(await readFile(join(repository, "site", "content", `${name}.json`), "utf8"));
  const source = (name) => readFile(join(repository, "site", "examples", `${name}.md`), "utf8");
  const [ja, en, product, markdown, architecture] = await Promise.all([
    json("ja"), json("en"), json("product"), source("markdown"), source("architecture"),
  ]);
  return { ja, en, product, sources: { markdown, architecture } };
}

export const normalizeNewlines = (value) => value.replaceAll("\r\n", "\n");
