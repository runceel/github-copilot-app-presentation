#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { architectureContractModule } from "../schema/architecture-contract.mjs";

const schemaUrl = new URL("../schema/architecture-v1.schema.json", import.meta.url);
const outputUrl = new URL("../renderer/architecture-contract.mjs", import.meta.url);

export async function generateArchitectureContract({
  check = false,
  source = schemaUrl,
  output = outputUrl,
} = {}) {
  const expected = architectureContractModule(JSON.parse(await readFile(source, "utf8")));
  let current;
  try {
    current = await readFile(output, "utf8");
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  const changed = expected !== current?.replace(/\r\n/g, "\n");
  if (changed && check) {
    throw new Error("Architecture contract is out of date. Run npm run generate:architecture.");
  }
  if (changed) await writeFile(output, expected, "utf8");
  return { changed, checked: check };
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  try {
    const args = process.argv.slice(2);
    if (args.some((arg) => arg !== "--check") || args.length > 1) {
      throw new Error("Usage: node generate-architecture-contract.mjs [--check]");
    }
    const result = await generateArchitectureContract({ check: args.includes("--check") });
    console.log(`Architecture contract ${result.checked ? "is current" : result.changed ? "generated" : "unchanged"}.`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
