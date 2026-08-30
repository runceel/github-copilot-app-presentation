import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import Ajv2020 from "ajv/dist/2020.js";

import { parseThemeMetadata } from "../../.github/extensions/markdstage/renderer/theme.mjs";

const schemaUrl = new URL(
  "../../.github/extensions/markdstage/schema/theme-metadata-v1.schema.json",
  import.meta.url,
);
const schema = JSON.parse(await readFile(schemaUrl, "utf8"));
const ajv = new Ajv2020({ allErrors: true, strict: true });
const validate = ajv.compile(schema);

const valid = {
  $schema: "./theme-metadata-v1.schema.json",
  version: 1,
  cover: {
    background: { image: "assets/cover.svg" },
    logo: { image: "assets/logo.svg", alt: "Example" },
  },
  backcover: {
    logo: { image: "assets/logo-light.svg", alt: "Example" },
    copyright: "Copyright Example",
  },
};

test("theme metadata schema is valid and agrees with the runtime parser", () => {
  assert.equal(ajv.validateSchema(schema), true, JSON.stringify(ajv.errors));
  assert.equal(validate(valid), true, JSON.stringify(validate.errors));
  assert.doesNotThrow(() => parseThemeMetadata(valid));
});

test("theme metadata schema and parser reject unsafe assets and unknown fields", () => {
  for (const candidate of [
    { version: 1, cover: { background: { image: "../cover.svg" } } },
    { version: 1, cover: { logo: { image: "assets/logo.svg", alt: "" } } },
    { version: 1, vendor: "Example" },
  ]) {
    assert.equal(validate(candidate), false);
    assert.throws(() => parseThemeMetadata(candidate));
  }
});
