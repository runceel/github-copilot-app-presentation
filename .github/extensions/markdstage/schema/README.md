# Architecture DSL v1 — JSON Schema

This is the **machine-readable schema** for JSON written in `architecture` code
fences. It supports editor completion and validation as well as automated CI validation.

| File | Purpose |
| --- | --- |
| `architecture-v1.schema.json` | JSON Schema for DSL v1 (draft 2020-12) |
| `examples/*.architecture.json` | Working examples with `$schema` |

This directory is **intentionally included in the distribution ZIP** so users can
reference the schema locally. Browser rendering uses a generated, dependency-free
ES-module contract rather than loading JSON Schema or a validation package.

## Usage

### 1. Author a `.architecture.json` file

Set `$schema` to a **relative path** so VS Code and similar editors can resolve it
from the file location and provide completion and validation in place.

```json
{
  "$schema": "../architecture-v1.schema.json",
  "version": 1,
  "elements": []
}
```

A relative path rather than an absolute URL keeps validation working immediately
after cloning or forking the repository and while offline. The completed JSON can
be pasted directly into an ` ```architecture ` fence with the `$schema` line intact;
the parser accepts and ignores root `$schema`.

### 2. Associate the schema by extension

Add a mapping to `.vscode/settings.json` to validate without a `$schema` line.

```json
{
  "json.schemas": [
    {
      "fileMatch": ["*.architecture.json"],
      "url": "./.github/extensions/markdstage/schema/architecture-v1.schema.json"
    }
  ]
}
```

### 3. Custom images

`node.icon` and standalone `image.src` use the same `assetPath` definition.
References are restricted to workspace-relative paths beginning with `assets/`,
and only SVG / PNG / WebP / JPG / JPEG are accepted. External URLs, data URIs,
absolute paths, `..`, and non-ASCII paths are rejected.

```json
{
  "$schema": "../architecture-v1.schema.json",
  "version": 1,
  "elements": [
    {
      "type": "image",
      "id": "system-map",
      "src": "assets/system-map.svg",
      "fit": "contain",
      "ariaLabel": "Complete system diagram",
      "x": 80,
      "y": 80,
      "width": 720,
      "height": 420
    }
  ]
}
```

`fit` accepts `contain` (default), `cover`, or `stretch`. As with other flow
elements, omit `x` / `y` under layout management. The Architecture Editor asset
API, not JSON Schema, validates asset existence, MIME type, signature, and the
10 MB import limit.

## Responsibilities of the schema and parser

**The schema validates shape; `parseArchitecture` validates semantics.** The
schema does not replace the parser. JSON Schema cannot express the following
constraints, so `renderer/architecture.mjs` is authoritative:

| Constraint | Why it cannot be represented |
| --- | --- |
| A `connector` `from` / `to` refers to an existing non-connector element | Requires document-wide reference resolution |
| Self-referencing connectors are prohibited | Same as above |
| Each `id` is unique across the complete tree | Applies to the flattened set of nested elements |
| 200 elements / 100 connectors / 20,000 text characters | Aggregated **after flattening**, not expressible by `maxItems` on one array |
| 65,536 source code units (UTF-16) | Existing JavaScript string-length limit before parsing; distinct from UTF-8 guide-response budgets |
| Layout fit (`children do not fit`) | Calculated dynamically from child sizes and group interior dimensions |
| Child `width` / `height` maximum under `layout` | Maximum depends on `cellWidth` / `cellHeight` |
| The `assets/` file referenced by `node.icon` / `image.src` exists | The parser does not access the file system; a missing file renders an empty image region |

`parseArchitecture` can fail even after schema validation. **The parser always
makes the final determination of whether a diagram can render.**

### Shared authoring and diagnostic boundary

The bundled JSON Schema is the source of structural vocabulary, not a second
runtime acceptance policy. A reproducible generation step derives browser-safe
metadata for permitted fields, element types, scalar constraints, and conditional
requirements. The compact AI reference and runtime vocabulary consume that same
metadata. No UI or tool maintains its own permitted-field list.

Rendering, editing, saving, CLI validation, and unloaded-input validation share
the existing normalizer and semantic checks. Successfully normalized v1 input
remains accepted even where the authoring schema is intentionally stricter.
Such differences are authoring warnings, not new errors. On rejected input,
the common diagnostic layer explains independently checkable structural issues
from the derived contract and uses the same ID/reference checks as rendering.
It neither repairs the input nor reruns the parser with deleted fields or
invented defaults.

Diagnostics carry stable codes, categories, severity, JSON Pointers, human
messages, and nonautomatic suggestions. A conflicting replacement value is
reported rather than overwritten. JSON parsing, structural, semantic, and
layout stages distinguish passed, failed, and skipped work. Bounded diagnostic
collection reports truncation explicitly; a skipped stage is not evidence that
its constraints passed. Legacy exception messages and block-level error arrays
remain available alongside the detailed report.

Unloaded validation is a read-only boundary: it accepts explicit DSL text or
individual Markdown slide fragments and has no authority to open a canvas,
change its current page, read or write files, or modify editor drafts.
API execution success is separate from content validity and completeness.
Diagnostic budgets are not additional DSL v1 restrictions. Image existence,
slide clipping, and visual clarity still require separate asset/output review.

This preserves the existing schema/runtime responsibility split without a
browser-side schema dependency or a parser replacement. The tradeoff is a
generated artifact that must be kept in sync; a drift check makes that
requirement enforceable.

### Invariant: P ⊆ A, except for documented divergences

As a rule, documents accepted by the parser (P) must also be accepted by the
schema (A). Allowing the reverse divergence, where a permissive schema accepts
content that fails during rendering, defeats the purpose of the schema. An
overly strict schema merely warns on a working diagram. Therefore, **any
divergence must make the schema stricter, and every instance is listed below.**

#### Documented divergences

| # | Case | Behavior | Reason |
| --- | --- | --- | --- |
| 1 | A child of a group with `layout` has nonnumeric `x` / `y` | Parser accepts; schema rejects | Placement is calculated automatically under `layout`, so the parser silently discards `x` / `y` without validating their values. This likely indicates an authoring mistake that the schema should report. Tightening the parser would reject previously accepted input and would be a breaking change. |
| 2 | A layout child has numeric `x` / `y` outside the schema range | Parser accepts; schema rejects | Parent-managed placement ignores these values just as it ignores nonnumeric coordinates. Preflight reports a compatibility warning. |
| 3 | Root `$schema` is not a string | Parser accepts; schema rejects | v1 ignores this metadata without resolving it. Editor completion requires a string; preflight warns without changing runtime acceptance. |

Divergences are recorded as `divergence` entries in `test/schema/corpus.mjs`,
and tests fail when no reason string is present. **CI detects silent divergence.**

### Case handling where representations intentionally differ

The implementation's `LITERAL_COLORS` regular expression uses the `/i` flag and
accepts values such as `#ABC` and `BLACK`. JSON Schema `pattern` has no flag
concept, so the schema manually expands upper- and lowercase character classes.
Only here do the `.source` and `pattern` strings differ. Equivalence is tested by
whether both return the same result for the same input
(`literal colour pattern is behaviourally equivalent to LITERAL_COLORS`).

Asset paths deliberately avoid this issue. `ASSET_PATH_PATTERN` and its
backward-compatible `ICON_ASSET_PATTERN` alias do **not** use `/i`; they build
allowed extensions with explicit case expansion such as `[Ss][Vv][Gg]`. The
`.source` can therefore be copied directly into `pattern`.
`RegExp.prototype.source` always normalizes `/` to `\/`, so both sides pass
through `new RegExp(...)` before comparison.
`schema pattern matches ICON_ASSET_PATTERN` protects string equality, and
`icon asset pattern is behaviourally equivalent between schema and parser`
protects concrete accepted and rejected cases.

## Versioning, compatibility, and migration policy

### v1 guarantees

`version` is `1`, and omission also means `1`. **DSL v1 is stable.** While v1 is
supported, the following guarantees apply:

- **A document accepted as v1 will continue to be accepted as v1.** Existing
  decks will not suddenly fail.
- The **meaning** of rendered output—where elements are and what connects to
  what—is preserved.

Not guaranteed:

- Pixel-exact rendering. Font metrics, theme tokens, and connector pathfinding
  improvements may alter appearance. **This remains the v1 contract after
  stabilization**; it is not a temporary experimental reservation. Save PDF
  output as the artifact when pixel-exact preservation is required.
- Diagnostic message wording.

### Compatible changes allowed within v1

| Change | Example |
| --- | --- |
| Add a new optional key | Add an optional style key to `node` |
| Add an enum value | Add a `shape` or built-in `icon` value; this phase expanded icons from 5 to 11 |
| Accept previously rejected input | Accept root `$schema` or an `assets/` path in `icon`, both implemented in this phase |
| Relax a limit | Increase the `points` maximum above 12 |
| Improve diagnostic messages | Add remediation guidance, implemented in this phase |

None of these changes causes previously accepted input to be rejected.

### When a breaking change is required

v1 will not remove or rename keys, remove enum values, reduce limits, or change
defaults. If such a change becomes necessary:

1. Introduce `version: 2` and add `architecture-v2.schema.json`. **Do not delete
   or modify** `architecture-v1.schema.json`.
2. The parser accepts **both v1 and v2**, branching on `version`.
3. Add v1-to-v2 migration instructions to this file.
4. Before retiring v1, emit deprecation warnings for at least one release.

In short, **the meaning of an existing `version` never changes later.** Increase
the number and support the old version in parallel when semantics must change.

## Repository-wide constraints

CI (`npm run test:schema`) dynamically scans repository Markdown and requires
**every discovered ` ```architecture ` block to pass both schema and parser
validation.** Because the list is not hardcoded, new examples are validated
automatically.

Consequently, **an intentionally invalid `architecture` block cannot appear
anywhere in the repository.** To document an error example, use one of these
approaches:

- Change the language identifier, for example to ` ```jsonc ` or ` ```text `.
  Only ` ```architecture ` is scanned.
- Write the invalid example as inline code or in a table instead of a code fence.
- Put the invalid example in `test/schema/corpus.mjs`, where rejection is expected.

## Keeping schema and implementation synchronized

`test/schema/architecture-schema.test.mjs` protects these properties:

1. The schema is valid draft 2020-12 and compiles with ajv.
2. Every repository `architecture` block and `examples/*.architecture.json`
   passes **both schema and parser** validation.
3. Both validators agree over the conformance corpus in `corpus.mjs`.
4. Constants embedded in the schema match exports from `architecture.mjs`.

For item 4, every uppercase constant exported by `architecture.mjs` must be
classified as embedded in the schema, semantic-validation-only, or rendering-only
(layout / routing). Forgetting to classify a new export fails the tests. The
third bucket, `rendererOnly`, is also verified to **not** appear in the schema.
This prevents rendering-tuning values such as routing weights or reroute counts
from accidentally becoming fixed parts of the DSL.

### Conditional property: `direction` for `layered`

`layout.direction` is allowed only when `type` is `"layered"`. The schema
expresses this with `allOf` / `if` / `not` / `then`, matching parser behavior.
Both reject `direction` on any other layout.

Because `layered` calculates hierarchy from connector direction, **do not specify
child `x` / `y`**. This matches existing `grid` / `row` / `column` behavior.

The validation library (`ajv`) is a **root devDependency**. The extension ships
as a ZIP and must run without `node_modules`, so do not import JSON Schema or
ajv from the renderer. Regenerate the browser-safe metadata after a schema
change with:

```powershell
node .github\extensions\markdstage\scripts\generate-architecture-contract.mjs
```

The same command with `--check` fails on drift. The authoring reference, including
its self-contained example, must remain within 8 KiB UTF-8. Public valid examples
are checked against both Schema and runtime; intentionally invalid examples
remain explicitly marked as described above.

The generated module has a separate distribution budget: it must stay below
1,000,000 bytes, the conservative interpretation of the installer's 1 MB
single-file limit. An automated size check measures the actual generated file.
This is independent of both the 8 KiB guide-response budget and the existing
DSL source-length limit.
