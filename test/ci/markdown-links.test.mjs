import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import {
  extractLocalLinks,
  findBrokenMarkdownLinks,
} from "../../scripts/check-markdown-links.mjs";

test("link extraction ignores external, anchor, image, code, and root-relative targets", () => {
  const links = extractLocalLinks(`
[Guide](guide.md)
[Reference]: reference.md
[External](https://example.com)
[Anchor](#section)
![Image](missing.png)
[Runtime asset](/assets/logo.svg)
\`[Inline code](ignored.md)\`

\`\`\`markdown
[Fenced code](ignored.md)
\`\`\`
`);

  assert.deepEqual(links, [
    { destination: "guide.md", line: 2 },
    { destination: "reference.md", line: 3 },
  ]);
});

test("broken-link validation reports only missing relative files", async () => {
  const root = await mkdtemp(join(tmpdir(), "markdstage-doc-links-"));
  const docs = join(root, "docs");
  const readme = join(root, "README.md");
  try {
    await mkdir(docs);
    await writeFile(join(docs, "guide.md"), "# Guide\n", "utf8");
    await writeFile(
      readme,
      [
        "[Guide](docs/guide.md#start)",
        "[Missing](docs/missing.md)",
        "[Outside](../outside.md)",
      ].join("\n"),
      "utf8",
    );

    assert.deepEqual(await findBrokenMarkdownLinks(root, [readme]), [
      { file: "README.md", line: 2, destination: "docs/missing.md" },
      { file: "README.md", line: 3, destination: "../outside.md" },
    ]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
