import { randomUUID } from "node:crypto";
import { open, readFile, rename, rm, stat } from "node:fs/promises";
import { basename, dirname, join } from "node:path";

function sourceChangedError() {
  const error = new Error("source_changed");
  error.code = "SOURCE_CHANGED";
  return error;
}

export async function atomicReplaceMarkdown({
  path,
  markdown,
  expectedMarkdown,
  mode,
  revalidate,
}) {
  const temporary = join(dirname(path), `.${basename(path)}.${randomUUID()}.tmp`);
  let handle = null;
  try {
    const expectedInfo = await stat(path);
    handle = await open(temporary, "wx", mode);
    await handle.writeFile(markdown, "utf8");
    await handle.sync();
    await handle.close();
    handle = null;
    await revalidate();
    const currentInfo = await stat(path);
    if (
      currentInfo.dev !== expectedInfo.dev ||
      currentInfo.ino !== expectedInfo.ino ||
      currentInfo.size !== expectedInfo.size ||
      currentInfo.mtimeMs !== expectedInfo.mtimeMs ||
      currentInfo.ctimeMs !== expectedInfo.ctimeMs
    ) {
      throw sourceChangedError();
    }
    if ((await readFile(path, "utf8")) !== expectedMarkdown) {
      throw sourceChangedError();
    }
    await rename(temporary, path);
  } finally {
    await handle?.close().catch(() => {});
    await rm(temporary, { force: true }).catch(() => {});
  }
}
