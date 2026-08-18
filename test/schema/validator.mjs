// DSL v1 の JSON Schema を ajv (draft 2020-12) で読み込み、形状検証器として公開する。
//
// ajv はルートの devDependency であり、拡張機能本体 (.github/extensions/presentation) は
// スキーマも ajv も一切 import しない。拡張は node_modules なしで動く必要があるため、
// スキーマ検証はテストと CI からのみ実行する。

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";

export const schemaUrl = new URL(
  "../../.github/extensions/presentation/schema/architecture-v1.schema.json",
  import.meta.url,
);
export const schemaPath = fileURLToPath(schemaUrl);
export const schema = JSON.parse(await readFile(schemaUrl, "utf8"));

// validateSchema: true (既定) でメタスキーマ検証が走る。strict でスキーマの書き損じも拾う。
// strictRequired だけは無効化する: boxRequired / nodeFixed のように allOf で
// 「プロパティ定義は別の $ref、required だけを重ねる」合成を意図的に使っているため。
const ajv = new Ajv2020({ allErrors: true, strict: true, strictRequired: false });

export const validateArchitecture = ajv.compile(schema);

/** スキーマがメタスキーマに適合するか。 */
export function validateAgainstMetaSchema() {
  const valid = ajv.validateSchema(schema);
  return { valid, errors: ajv.errors ?? [] };
}

/**
 * JSON テキストをスキーマで検証する。parseArchitecture と同じ入力（文字列）を受け取り、
 * 同じ形の結果を返すので、両検証器の判定を素直に突き合わせられる。
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

/** すでにパース済みの値をスキーマで検証する。 */
export function schemaCheckValue(value) {
  if (validateArchitecture(value)) return { ok: true, message: "" };
  const errors = validateArchitecture.errors ?? [];
  const message = errors
    .map((error) => `${error.instancePath || "/"} ${error.message}`)
    .join("; ");
  return { ok: false, message };
}
