// Deck lifecycle helpers shared by the CLI commands.

import {
  createDeckSession,
  createUrlToken,
  startPresentationServer,
} from "./runtime.mjs";

/**
 * Open a deck, start its loopback presentation server, and hand both to `run`.
 * The server is always closed again, including on failure.
 */
export async function withDeckServer(options, run) {
  const token = createUrlToken();
  const session = await createDeckSession({
    file: options.file,
    workspaceRoot: options.workspace,
    theme: options.theme,
    themeFile: options.themeFile,
    assetUrlPrefix: `/${token}/theme-assets/`,
    log: options.log,
  });
  const server = await startPresentationServer(session, {
    token,
    onLog: options.log,
  });
  try {
    return await run(session, server);
  } finally {
    await server.close();
  }
}

export function parsePageList(value, { total } = {}) {
  const entries = String(value)
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
  const indexes = [];
  for (const entry of entries) {
    const range = entry.match(/^(\d+)\s*-\s*(\d+)$/);
    if (range) {
      const from = Number.parseInt(range[1], 10);
      const to = Number.parseInt(range[2], 10);
      if (!Number.isInteger(from) || !Number.isInteger(to) || from < 1 || to < from) {
        throw new RangeError(`Invalid page range: ${entry}`);
      }
      for (let page = from; page <= to; page += 1) indexes.push(page - 1);
      continue;
    }
    const page = Number.parseInt(entry, 10);
    if (!Number.isInteger(page) || page < 1 || String(page) !== entry) {
      throw new RangeError(`Invalid page number: ${entry}`);
    }
    indexes.push(page - 1);
  }
  const unique = [...new Set(indexes)].sort((a, b) => a - b);
  if (!unique.length) throw new RangeError("At least one page is required.");
  if (total !== undefined && unique.some((index) => index >= total)) {
    throw new RangeError(`Pages must be between 1 and ${total}.`);
  }
  return unique;
}
