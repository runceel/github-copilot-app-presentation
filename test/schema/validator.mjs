// Load the DSL v1 JSON Schema with ajv (draft 2020-12) and expose a structural validator.
//
// ajv is a root devDependency. The Extension itself (.github/extensions/markdstage) imports neither
// the schema nor ajv because it must run without node_modules. Schema validation runs only in tests
// and CI.

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";

export const schemaUrl = new URL(
  "../../.github/extensions/markdstage/schema/architecture-v1.schema.json",
  import.meta.url,
);
export const schemaPath = fileURLToPath(schemaUrl);
export const schema = JSON.parse(await readFile(schemaUrl, "utf8"));

// validateSchema: true (the default) runs meta-schema validation. strict also catches schema errors.
// Disable only strictRequired because compositions such as boxRequired / nodeFixed intentionally
// use allOf to define properties in one $ref and layer only required elsewhere.
const ajv = new Ajv2020({ allErrors: true, strict: true, strictRequired: false });

export const validateArchitecture = ajv.compile(schema);

/** Return whether the schema conforms to its meta-schema. */
export function validateAgainstMetaSchema() {
  const valid = ajv.validateSchema(schema);
  return { valid, errors: ajv.errors ?? [] };
}

/**
 * Validate JSON text against the schema. This accepts the same string input as parseArchitecture
 * and returns the same result shape so the two validators can be compared directly.
 */
export function schemaCheckSource(source) {
  let value;
  try {
    value = JSON.parse(source);
  } catch (error) {
    return { ok: false, message: `invalid JSON: ${error.message}` };
  }
  return schemaCheckValue(value);
}

/** Validate an already parsed value against the schema. */
export function schemaCheckValue(value) {
  if (validateArchitecture(value)) return { ok: true, message: "" };
  const errors = validateArchitecture.errors ?? [];
  const message = errors
    .map((error) => `${error.instancePath || "/"} ${error.message}`)
    .join("; ");
  return { ok: false, message };
}
