import assert from "node:assert/strict";
import { stat } from "node:fs/promises";
import test from "node:test";

// README documents a 1 MB installer limit. Decimal MB is the conservative bound.
const INSTALLER_FILE_BUDGET_BYTES = 1_000_000;

test("generated architecture contract stays below the installer single-file limit", async () => {
  const file = new URL("../renderer/architecture-contract.mjs", import.meta.url);
  const { size } = await stat(file);
  assert.ok(size > 0, "the generated contract must not be empty");
  assert.ok(
    size < INSTALLER_FILE_BUDGET_BYTES,
    `architecture-contract.mjs is ${size} bytes; keep it below ${INSTALLER_FILE_BUDGET_BYTES} bytes`,
  );
});
