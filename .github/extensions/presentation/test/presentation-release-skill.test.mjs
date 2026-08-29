import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const extensionRoot = fileURLToPath(new URL("..", import.meta.url));
const repositoryRoot = join(extensionRoot, "..", "..", "..");

test("presentation-release skill documents the complete release contract", async () => {
  const skill = await readFile(
    join(repositoryRoot, ".github", "skills", "presentation-release", "SKILL.md"),
    "utf8",
  );
  const packageScript = await readFile(
    join(repositoryRoot, "scripts", "PackageRelease.ps1"),
    "utf8",
  );

  assert.match(skill, /^---\r?\nname: presentation-release\r?\n/);
  assert.match(skill, /必ず使う/);
  assert.match(skill, /## Error Handling/);
  assert.match(skill, /## Post-Run Reflection/);
  assert.ok(skill.split(/\r?\n/).length <= 500);

  for (const asset of [
    "presentation-$Version.zip",
    "Presentation-win-x64.zip",
    "Presentation-win-arm64.zip",
  ]) {
    assert.ok(packageScript.includes(asset), `package script must include ${asset}`);
  }
  assert.match(packageScript, /presentation\\test/);
  assert.match(packageScript, /Get-FileHash .*SHA256/);
});
