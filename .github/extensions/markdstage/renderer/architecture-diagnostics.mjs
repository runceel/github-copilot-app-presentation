import { architectureContract } from "./architecture-contract.mjs";

const MAX_DIAGNOSTICS = 100;
const MAX_DIAGNOSTIC_WORK = 10_000;
const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const escapePointer = (value) => String(value).replace(/~/g, "~0").replace(/\//g, "~1");

export function architecturePointer(path) {
  const local = path.replace(/^diagram(?:\.|$)/, "");
  if (!local) return "";
  return `/${local.replace(/\[(\d+)\]/g, ".$1").split(".").map(escapePointer).join("/")}`;
}

export function architectureDiagnostic(path, message, remedy, details = {}) {
  return {
    code: details.code ?? "invalid_value",
    category: details.category ?? "structure",
    severity: details.severity ?? "error",
    pointer: details.pointer ?? architecturePointer(path),
    message: `${path}: ${message}${remedy ? `; ${remedy}` : ""}`,
    suggestions: details.suggestions ?? (remedy
      ? [{ action: "review", message: remedy, automatic: false }]
      : []),
  };
}

export class ArchitectureError extends Error {
  constructor(message, diagnostic) {
    super(message);
    this.name = "ArchitectureError";
    if (diagnostic) this.diagnostic = diagnostic;
  }
}

export function throwArchitectureDiagnostic(diagnostic) {
  throw new ArchitectureError(diagnostic.message, diagnostic);
}

export function unknownArchitectureField(value, key, allowed, path, type) {
  const pointer = `${architecturePointer(path)}/${escapePointer(key)}`;
  const replacement = type === "node" && (key === "label" || key === "subtitle")
    ? "text"
    : type === "group" && (key === "label" || key === "text")
      ? "title"
      : type === "connector" && key === "text"
        ? "label"
        : null;
  const suggestions = [];
  if (replacement && allowed.has(replacement)) {
    const conflict = own(value, replacement);
    const merge = key === "subtitle";
    suggestions.push({
      action: conflict || merge ? "review" : "rename",
      from: pointer,
      to: `${architecturePointer(path)}/${escapePointer(replacement)}`,
      conflictsWithExistingValue: conflict,
      message: [
        ...(merge ? ["A multiline text value is not a separately styled subtitle. Review the intended presentation before combining text."] : []),
        conflict
          ? `${replacement} already exists. Decide how to preserve both values; do not overwrite it.`
          : `${type} uses ${replacement} for its displayed text. Change it only after reviewing the intended value.`,
      ].join(" "),
      automatic: false,
    });
  } else {
    suggestions.push({
      action: "review",
      pointer,
      message: type === "connector" && key === "id"
        ? "Connectors have no id. Review why this identifier was supplied before removing it."
        : "This field is not part of the contract. Review its intended meaning before removing or replacing it.",
      automatic: false,
    });
  }
  return architectureDiagnostic(
    `${path}.${key}`,
    "is not supported",
    `remove it or use one of: ${[...allowed].join(", ")}`,
    { code: "unknown_field", pointer, suggestions },
  );
}

export function claimArchitectureId(ids, id, path, report = throwArchitectureDiagnostic) {
  if (ids.has(id)) {
    report(architectureDiagnostic(
      path,
      `duplicates '${id}'`,
      "give every node, group, and image a unique id across the whole diagram",
      { code: "duplicate_id", category: "semantic" },
    ));
  } else {
    ids.add(id);
  }
}

export function checkArchitectureReferences(elements, report = throwArchitectureDiagnostic, { checkIds = true } = {}) {
  const ids = new Set();
  for (const element of elements) {
    if (element.type === "connector") continue;
    if (checkIds) claimArchitectureId(ids, element.id, `${element.sourcePath}.id`, report);
    else ids.add(element.id);
  }
  let connectors = 0;
  for (const element of elements) {
    if (element.type !== "connector") continue;
    connectors += 1;
    for (const endpoint of ["from", "to"]) {
      if (!ids.has(element[endpoint])) {
        report(architectureDiagnostic(
          `${element.sourcePath}.${endpoint}`,
          `references unknown element '${element[endpoint]}'`,
          `add a node or group with id '${element[endpoint]}', or point the connector at an existing id`,
          { code: "undefined_reference", category: "semantic" },
        ));
      }
    }
    if (element.from === element.to) {
      report(architectureDiagnostic(
        element.sourcePath,
        "self-referencing connectors are not supported",
        "point the connector at a different element",
        { code: "self_reference", category: "semantic" },
      ));
    }
  }
  return connectors;
}

export function diagnosticLimit(value = 50) {
  if (!Number.isInteger(value) || value < 1 || value > MAX_DIAGNOSTICS) {
    throw new TypeError(`maxDiagnostics must be an integer between 1 and ${MAX_DIAGNOSTICS}.`);
  }
  return value;
}

function collector(maxDiagnostics) {
  const diagnostics = [];
  const seen = new Set();
  const truncationReasons = new Set();
  let work = 0;
  let truncated = false;
  return {
    diagnostics,
    truncationReasons,
    get truncated() { return truncated; },
    step() {
      work += 1;
      if (work <= MAX_DIAGNOSTIC_WORK) return true;
      truncated = true;
      truncationReasons.add("maxWork");
      return false;
    },
    stop(reason) {
      truncated = true;
      truncationReasons.add(reason);
    },
    add(diagnostic) {
      // The normalizer's primary diagnostic wins over a less specific structural description.
      const key = `${diagnostic.severity}:${diagnostic.category}:${diagnostic.pointer}`;
      if (seen.has(key)) return;
      seen.add(key);
      if (diagnostics.length >= maxDiagnostics) {
        truncated = true;
        truncationReasons.add("maxDiagnostics");
        return;
      }
      diagnostics.push(diagnostic);
    },
  };
}

function valueKindMatches(value, definition) {
  const type = definition.type ?? (own(definition, "const") ? typeof definition.const : undefined);
  if (Array.isArray(type)) return type.some((candidate) => valueKindMatches(value, { type: candidate }));
  if (type === "null") return value === null;
  if (type === "object") return isObject(value);
  if (type === "array") return Array.isArray(value);
  if (type === "integer") return Number.isInteger(value);
  if (type) return typeof value === type;
  if (definition.enum) return definition.enum.some((item) => typeof item === typeof value);
  return true;
}

function conditionMatches(value, condition) {
  if (typeof condition === "boolean") return condition;
  if (!valueKindMatches(value, condition)) return false;
  if (own(condition, "const") && value !== condition.const) return false;
  if (condition.enum && !condition.enum.includes(value)) return false;
  if (condition.not && conditionMatches(value, condition.not)) return false;
  if (condition.allOf && !condition.allOf.every((item) => conditionMatches(value, item))) return false;
  if (condition.anyOf && !condition.anyOf.some((item) => conditionMatches(value, item))) return false;
  if (condition.required && (!isObject(value) || condition.required.some((key) => !own(value, key)))) return false;
  if (condition.properties && isObject(value)) {
    for (const [key, definition] of Object.entries(condition.properties)) {
      if (own(value, key) && !conditionMatches(value[key], definition)) return false;
    }
  }
  return true;
}

// This scan explains rejected input using the same derived structural vocabulary.
// It never decides acceptance or supplies repaired/default values to the normalizer.
function scanStructure(raw, result, { maxElements, maxDepth }) {
  const entries = [];
  let visitedElements = 0;
  const emit = (path, message, remedy, code, details) =>
    result.add(architectureDiagnostic(path, message, remedy, { code, ...details }));

  function inspect(value, definition, path, { overlay = false, skip = new Set() } = {}) {
    if (!result.step()) return;
    if (!definition || typeof definition !== "object") return;
    if (definition.anyOf) {
      const alternatives = definition.anyOf.filter((item) => valueKindMatches(value, item));
      const chosen = alternatives.find((item) =>
        (!item.enum || item.enum.includes(value)) &&
        (!item.pattern || (typeof value === "string" && new RegExp(item.pattern).test(value))),
      ) ?? alternatives[0];
      if (!chosen) {
        emit(path, "has an unsupported value type", "use a value described by the authoring contract", "invalid_type");
        return;
      }
      inspect(value, chosen, path);
      return;
    }
    if (!valueKindMatches(value, definition)) {
      emit(path, `must be ${definition.type === "object" ? "an object" : definition.type === "array" ? "an array" : `a ${definition.type ?? "supported value"}`}`,
        "use the type shown in architecture-schema", "invalid_type");
      return;
    }
    if (own(definition, "const") && value !== definition.const) {
      emit(path, `must be ${JSON.stringify(definition.const)}`, "use the declared contract value", "invalid_value");
    }
    if (definition.enum && !definition.enum.includes(value)) {
      emit(path, `must be one of: ${definition.enum.join(", ")}`, "replace the value with one of them", "invalid_value");
    }
    if (typeof value === "number") {
      if (!Number.isFinite(value)) {
        emit(path, "must be a finite number", "use a finite number in the documented range", "invalid_type");
      } else if ((definition.minimum !== undefined && value < definition.minimum) ||
                 (definition.maximum !== undefined && value > definition.maximum)) {
        emit(path, `must be between ${definition.minimum} and ${definition.maximum}`, "adjust the value into that range", "out_of_range");
      }
    }
    if (typeof value === "string") {
      if (definition.maxLength !== undefined && value.length > definition.maxLength) {
        emit(path, `must be at most ${definition.maxLength} characters`, "shorten the text", "text_limit");
      }
      if (definition.pattern && !new RegExp(definition.pattern).test(value)) {
        emit(path, "does not match the permitted format", "use the format shown in architecture-schema", "invalid_value");
      }
    }
    if (Array.isArray(value)) {
      if (definition.maxItems !== undefined && value.length > definition.maxItems) {
        emit(path, `must contain at most ${definition.maxItems} items`, "reduce the item count", "item_limit");
      }
      if (definition.items && !skip.has("items")) {
        for (let index = 0; index < value.length; index += 1) {
          if (!result.step()) break;
          inspect(value[index], definition.items, `${path}[${index}]`);
        }
      }
    }
    if (isObject(value) && definition.properties) {
      if (!overlay) {
        const allowed = new Set(Object.keys(definition.properties));
        for (const key of Object.keys(value)) {
          if (!result.step()) break;
          if (!allowed.has(key)) result.add(unknownArchitectureField(value, key, allowed, path, value.type));
        }
      }
      for (const key of definition.required ?? []) {
        if (!own(value, key)) emit(`${path}.${key}`, "is required", "supply this field as described in architecture-schema", "missing_required");
      }
      for (const [key, property] of Object.entries(definition.properties)) {
        if (skip.has(key) || !own(value, key)) continue;
        inspect(value[key], property, path === "diagram" ? key : `${path}.${key}`);
      }
    }
    for (const part of definition.allOf ?? []) inspect(value, part, path, { overlay: true, skip });
    if (definition.if) {
      const branch = conditionMatches(value, definition.if) ? definition.then : definition.else;
      if (branch) inspect(value, branch, path, { overlay: true, skip });
    }
    if (definition.not && conditionMatches(value, definition.not)) {
      for (const key of definition.not.required ?? []) {
        emit(`${path}.${key}`, "is not permitted in this context", "remove it or use the matching layout/routing mode", "invalid_condition");
      }
    }
  }

  function elements(items, path, depth, flow) {
    if (!Array.isArray(items)) {
      emit(path, "must be an array", "use a JSON array such as [ ]", items === undefined ? "missing_required" : "invalid_type");
      return;
    }
    if (depth > maxDepth) {
      result.stop("maxDepth");
      emit(path, `nesting must not exceed ${maxDepth} levels`, "flatten the structure", "nesting_limit");
      return;
    }
    for (let index = 0; index < items.length; index += 1) {
      if (!result.step()) break;
      visitedElements += 1;
      if (visitedElements > maxElements) {
        result.stop("maxElements");
        emit("elements", `must contain at most ${maxElements} items`, "split the diagram across multiple slides", "element_limit");
        break;
      }
      const element = items[index];
      const elementPath = `${path}[${index}]`;
      if (!isObject(element)) {
        emit(elementPath, "must be an object", "use a JSON object such as { }", "invalid_type");
        continue;
      }
      const type = element.type;
      if (typeof type !== "string" || !own(architectureContract.elements, type)) {
        emit(`${elementPath}.type`, `must be one of: ${Object.keys(architectureContract.elements).join(", ")}`,
          "supply a supported element type", type === undefined ? "missing_required" : "invalid_value");
        continue;
      }
      const contract = architectureContract.elements[type];
      const skip = new Set(type === "group" ? ["children"] : []);
      if (flow && type !== "connector") {
        skip.add("x");
        skip.add("y");
      }
      inspect(element, {
        ...contract,
        type: "object",
        required: contract.required[flow ? "flow" : "fixed"],
      }, elementPath, { skip });
      entries.push({
        type,
        id: element.id,
        from: element.from,
        to: element.to,
        sourcePath: elementPath,
      });
      if (type === "group") {
        elements(element.children === undefined ? [] : element.children, `${elementPath}.children`, depth + 1, element.layout !== undefined);
      }
    }
  }

  if (!isObject(raw)) {
    emit("diagram", "must be an object", 'use a JSON object with an "elements" array', "invalid_type");
    return entries;
  }
  inspect(raw, { ...architectureContract.root, type: "object" }, "diagram", { skip: new Set(["elements", "$schema"]) });
  elements(raw.elements, "elements", 0, false);
  return entries;
}

export function architectureCompatibilityWarnings(raw) {
  let occurrences = 0;
  const relatedPointers = [];
  const record = (path) => {
    occurrences += 1;
    if (relatedPointers.length < 8) relatedPointers.push(architecturePointer(path));
  };
  const coordinate = architectureContract.definitions.coordinate;
  const visit = (items, path, flow) => {
    for (const [index, element] of items.entries()) {
      const elementPath = `${path}[${index}]`;
      if (flow && element.type !== "connector") {
        for (const key of ["x", "y"]) {
          const value = element[key];
          if (own(element, key) && (typeof value !== "number" || !Number.isFinite(value) ||
              value < coordinate.minimum || value > coordinate.maximum)) {
            record(`${elementPath}.${key}`);
          }
        }
      }
      if (element.type === "group") visit(element.children ?? [], `${elementPath}.children`, element.layout !== undefined);
    }
  };
  if (own(raw, "$schema") && typeof raw.$schema !== "string") {
    record("$schema");
  }
  visit(raw.elements, "elements", false);
  return {
    diagnostics: occurrences ? [{
      ...architectureDiagnostic(
        "diagram",
        "contains values ignored by the v1 runtime but rejected by the authoring schema",
        "omit coordinates managed by a parent layout; use a string for $schema or omit it",
        { code: "schema_compatibility", severity: "warning" },
      ),
      occurrences,
      relatedPointers,
    }] : [],
  };
}

export function architectureFailureReport(raw, primary, options) {
  const result = collector(options.maxDiagnostics);
  result.add(primary);
  if (raw !== undefined && primary.category !== "json") {
    const entries = scanStructure(raw, result, options);
    if (!result.truncated && !result.diagnostics.some((item) => item.category === "structure" && item.severity === "error")) {
      checkArchitectureReferences(entries, (diagnostic) => result.add(diagnostic));
    }
  }
  const failed = (category) => result.diagnostics.some((item) => item.category === category && item.severity === "error");
  return {
    valid: false,
    complete: false,
    truncated: result.truncated,
    truncationReasons: [...result.truncationReasons],
    limits: {
      maxDiagnostics: options.maxDiagnostics,
      maxWork: MAX_DIAGNOSTIC_WORK,
      maxElements: options.maxElements,
      maxDepth: options.maxDepth,
    },
    stages: {
      json: primary.category === "json" ? "failed" : "passed",
      structure: failed("structure") ? "failed" : options.stages.structure === "passed"
        ? "passed" : raw === undefined || result.truncated ? "skipped" : "passed",
      semantic: failed("semantic") ? "failed" : options.stages.semantic,
      layout: failed("layout") ? "failed" : options.stages.layout,
    },
    diagnostics: result.diagnostics,
  };
}
