const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
const object = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const annotations = new Set(["$schema", "$id", "$anchor", "$comment", "title", "description", "examples"]);
const schemaMaps = new Set(["properties", "patternProperties", "dependentSchemas", "$defs"]);
const schemaArrays = new Set(["allOf", "anyOf", "oneOf", "prefixItems"]);
const schemaValues = new Set([
  "items", "contains", "additionalProperties", "unevaluatedProperties", "unevaluatedItems",
  "propertyNames", "not", "if", "then", "else", "contentSchema",
]);
const scalarKeywords = new Set([
  ...annotations, "type", "enum", "const", "required", "default", "deprecated", "readOnly",
  "writeOnly", "minimum", "maximum", "exclusiveMinimum", "exclusiveMaximum", "multipleOf",
  "minLength", "maxLength", "pattern", "format", "minItems", "maxItems", "uniqueItems",
  "minContains", "maxContains", "minProperties", "maxProperties", "dependentRequired",
  "contentEncoding", "contentMediaType",
]);

function unsupported(path, message) {
  throw new Error(`Unsupported Architecture contract derivation at ${path}: ${message}`);
}

function ordered(value) {
  if (Array.isArray(value)) return value.map(ordered);
  if (!object(value)) return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, ordered(value[key])]));
}

function signature(value) {
  return JSON.stringify(ordered(value));
}

function assertions(value) {
  if (!object(value)) return value;
  return Object.fromEntries(Object.entries(value)
    .filter(([key]) => !annotations.has(key))
    .map(([key, entry]) => [
      key,
      schemaMaps.has(key)
        ? Object.fromEntries(Object.entries(entry).map(([name, child]) => [name, assertions(child)]))
        : schemaArrays.has(key) ? entry.map(assertions)
          : schemaValues.has(key) ? assertions(entry) : entry,
    ]));
}

function conjoin(left, right, path) {
  if (left === true) return right;
  if (right === true) return left;
  if (left === false || right === false) return false;
  for (const [closed, other] of [[left, right], [right, left]]) {
    if (closed.additionalProperties === false &&
        Object.keys(other.properties ?? {}).some((key) => !own(closed.properties ?? {}, key))) {
      unsupported(path, "allOf cannot widen a closed object's permitted properties");
    }
  }
  const result = { ...left };
  // Keep complete conditional clauses together; independently merging their if/then/else
  // keywords would change which assertion a branch applies to.
  if (own(left, "if") && own(right, "if")) {
    const condition = Object.fromEntries(["if", "then", "else"]
      .filter((key) => own(right, key)).map((key) => [key, right[key]]));
    right = Object.fromEntries(Object.entries(right)
      .filter(([key]) => !["if", "then", "else"].includes(key)));
    result.allOf = [...(result.allOf ?? []), condition];
  }
  for (const [key, value] of Object.entries(right)) {
    if (!own(result, key) || annotations.has(key)) {
      result[key] = value;
    } else if (key === "properties") {
      result.properties = { ...result.properties };
      for (const [name, property] of Object.entries(value)) {
        result.properties[name] = own(result.properties, name)
          ? conjoin(result.properties[name], property, `${path}/properties/${name}`)
          : property;
      }
    } else if (key === "required") {
      result.required = [...new Set([...result.required, ...value])];
    } else if (key === "allOf") {
      result.allOf = [...result.allOf, ...value];
    } else if (key === "enum") {
      result.enum = result.enum.filter((entry) => value.some((other) => signature(entry) === signature(other)));
      if (!result.enum.length) unsupported(path, "allOf has disjoint enums");
    } else if (key === "type") {
      const types = [result.type].flat().filter((entry) => [value].flat().includes(entry));
      if (!types.length) unsupported(path, "allOf has disjoint types");
      result.type = types.length === 1 ? types[0] : types;
    } else if (/^(minimum|exclusiveMinimum|minLength|minItems|minContains|minProperties)$/.test(key)) {
      result[key] = Math.max(result[key], value);
    } else if (/^(maximum|exclusiveMaximum|maxLength|maxItems|maxContains|maxProperties)$/.test(key)) {
      result[key] = Math.min(result[key], value);
    } else if (signature(result[key]) !== signature(value)) {
      unsupported(path, `cannot flatten conflicting ${key} assertions without losing information`);
    }
  }
  if (own(result, "const") && result.enum) {
    if (!result.enum.some((entry) => signature(entry) === signature(result.const))) {
      unsupported(path, "const is excluded by enum");
    }
    delete result.enum;
  }
  return result;
}

function createResolver(schema) {
  function dereference(ref) {
    if (typeof ref !== "string" || !ref.startsWith("#/")) {
      unsupported(String(ref), "only local JSON Pointer $ref values are supported");
    }
    let target = schema;
    for (const part of ref.slice(2).split("/")) {
      const key = part.replace(/~1/g, "/").replace(/~0/g, "~");
      if (!object(target) || !own(target, key)) unsupported(ref, "unresolved $ref");
      target = target[key];
    }
    return target;
  }

  function discriminator(input, seen = new Set()) {
    if (!object(input)) return null;
    if (input.$ref) {
      if (seen.has(input.$ref)) unsupported(input.$ref, "recursive discriminator");
      return discriminator(dereference(input.$ref), new Set([...seen, input.$ref]));
    }
    return input.properties?.type?.enum ?? null;
  }

  function resolve(input, path = "#", stack = []) {
    if (typeof input === "boolean") return input;
    if (!object(input)) unsupported(path, "expected a JSON Schema object or boolean");
    let result = {};
    if (input.$ref) {
      if (stack.includes(input.$ref)) unsupported(path, "recursive $ref outside an element array");
      result = resolve(dereference(input.$ref), input.$ref, [...stack, input.$ref]);
    }
    const local = {};
    for (const [key, value] of Object.entries(input)) {
      if (key === "$ref" || key === "allOf") continue;
      if (schemaMaps.has(key)) {
        local[key] = Object.fromEntries(Object.entries(value)
          .map(([name, child]) => [name, resolve(child, `${path}/${key}/${name}`, stack)]));
      } else if (schemaArrays.has(key)) {
        local[key] = value.map((child, index) => resolve(child, `${path}/${key}/${index}`, stack));
      } else if (schemaValues.has(key)) {
        // Element arrays are the tree boundary. Keep their standard local references rather
        // than unrolling every nesting level (or a future recursive element definition).
        if (key === "items" && object(value) && value.$ref && discriminator(value)) {
          dereference(value.$ref);
          if (Object.keys(value).some((name) => name !== "$ref")) {
            unsupported(`${path}/items`, "element-array $ref siblings need explicit derivation support");
          }
          local[key] = { $ref: value.$ref };
        } else {
          local[key] = resolve(value, `${path}/${key}`, stack);
        }
      } else if (scalarKeywords.has(key)) {
        local[key] = structuredClone(value);
      } else {
        unsupported(`${path}/${key}`, "unrecognized JSON Schema keyword");
      }
    }
    result = conjoin(result, local, path);
    for (const [index, branch] of (input.allOf ?? []).entries()) {
      const resolved = resolve(branch, `${path}/allOf/${index}`, stack);
      if (object(resolved) && ["if", "anyOf", "oneOf", "not"].some((key) => own(resolved, key))) {
        result = conjoin(result, { allOf: [resolved] }, path);
      } else {
        result = conjoin(result, resolved, path);
      }
    }
    return result;
  }
  return { resolve, discriminator };
}

function typeGuard(condition, path) {
  if (!condition?.properties?.type) return null;
  const allowed = new Set(["type", "properties", "required"]);
  if (Object.keys(condition).some((key) => !allowed.has(key))
      || Object.keys(condition.properties).some((key) => key !== "type")
      || condition.required?.length !== 1 || condition.required[0] !== "type"
      || (condition.type !== undefined && condition.type !== "object")) {
    unsupported(path, "element discriminator must test only the required type field");
  }
  const value = condition.properties.type;
  if (Object.keys(value).length !== 1 || (!own(value, "const") && !own(value, "enum"))) {
    unsupported(path, "element discriminator must use const or enum");
  }
  return own(value, "const") ? [value.const] : value.enum;
}

function elementVariants(table, path) {
  const types = table.properties?.type?.enum;
  if (!Array.isArray(types) || !types.length || types.some((type) => typeof type !== "string")) {
    unsupported(path, "element items must declare a nonempty string type enum");
  }
  const selected = {};
  for (const type of types) {
    let matched = false;
    function select(input) {
      if (!object(input)) unsupported(path, "boolean element branches are not supported");
      if (input.anyOf || input.oneOf || input.not) unsupported(path, "ambiguous element object composition");
      let result = Object.fromEntries(Object.entries(input).filter(([key]) => key !== "allOf"));
      if (input.if) {
        const guard = typeGuard(input.if, path);
        if (guard) {
          result = Object.fromEntries(Object.entries(result)
            .filter(([key]) => !["if", "then", "else"].includes(key)));
          const applies = guard.includes(type);
          matched ||= applies && own(input, "then");
          const branch = applies ? input.then : input.else;
          if (branch !== undefined) result = conjoin(result, select(branch), path);
        }
      }
      for (const branch of input.allOf ?? []) result = conjoin(result, select(branch), path);
      return result;
    }
    selected[type] = select(table);
    if (!matched) unsupported(path, `no conditional element branch for ${JSON.stringify(type)}`);
    if (selected[type].additionalProperties !== false) {
      unsupported(path, `${type} must explicitly bound its permitted properties`);
    }
  }
  return selected;
}

function fields(descriptor, path) {
  const result = { ...(descriptor.properties ?? {}) };
  function conditional(input) {
    if (!object(input)) return;
    if (input.anyOf || input.oneOf) unsupported(path, "conditional object unions need explicit field derivation");
    for (const [name, value] of Object.entries(input.properties ?? {})) {
      // A conditional assertion may narrow an existing field (connector.points, for example).
      // The complete condition stays on the element and in definitions; it is not an
      // unconditional restriction on the property descriptor.
      if (!own(result, name)) {
        if (descriptor.additionalProperties === false) {
          unsupported(path, `conditional field ${name} is outside the closed object's permitted properties`);
        }
        result[name] = value;
      }
    }
    for (const branch of input.allOf ?? []) conditional(branch);
    if (input.then) conditional(input.then);
    if (input.else) conditional(input.else);
  }
  conditional(descriptor);
  return result;
}

function elementConditions(descriptor) {
  return Object.fromEntries(["if", "then", "else", "allOf"]
    .filter((key) => own(descriptor, key)).map((key) => [key, descriptor[key]]));
}

function conditionSignature(conditions, resolver) {
  // Child selectors vary by nesting depth; their exact rules remain in definitions.
  // All other element-level conditions must agree across fixed/flow contexts.
  return JSON.stringify(ordered(assertions(conditions)), (key, value) =>
    key === "items" && resolver.discriminator(value) ? {} : value);
}

function childTables(descriptor, resolver, path) {
  const result = [];
  function visit(input, mode) {
    if (!object(input)) return;
    for (const property of Object.values(input.properties ?? {})) {
      if (property.items && resolver.discriminator(property.items)) {
        result.push({ items: property.items, mode });
      }
    }
    for (const branch of input.allOf ?? []) visit(branch, mode);
    if (input.if) {
      const before = result.length;
      visit(input.then, "flow");
      visit(input.else, "fixed");
      if (result.length !== before && (
        input.if.type !== "object" || input.if.required?.length !== 1
        || input.if.required[0] !== "layout"
        || Object.keys(input.if).some((key) => !["type", "required"].includes(key))
      )) {
        unsupported(path, "child layout context must be selected by presence of the parent's layout");
      }
    }
  }
  visit(descriptor, "fixed");
  return result;
}

/**
 * Derive vocabulary from JSON Schema, not an independent validator. The fixed/flow projection
 * follows the schema's parent-layout branches. Element conditions and resolved definitions
 * retain JSON Schema keywords; depth-specific child selectors remain in definitions.
 * Unsupported projections fail rather than silently publishing partial metadata.
 */
export function deriveArchitectureContract(schema) {
  if (!object(schema) || !object(schema.$defs)) unsupported("#", "expected a schema with $defs");
  const resolver = createResolver(schema);
  const { $defs, ...rootSchema } = schema;
  const root = resolver.resolve(rootSchema);
  if (root.type !== "object" || root.additionalProperties !== false || !root.properties?.elements?.items) {
    unsupported("#", "expected a closed root object with elements.items");
  }
  if (root.if || root.allOf || root.anyOf || root.oneOf) {
    unsupported("#", "conditional root fields need explicit derivation support");
  }
  const elements = {};
  const queue = [{ items: root.properties.elements.items, mode: "fixed" }];
  const visited = new Set();
  while (queue.length) {
    const { items, mode } = queue.shift();
    const key = `${mode}:${signature(items)}`;
    if (visited.has(key)) continue;
    visited.add(key);
    const variants = elementVariants(resolver.resolve(items), key);
    for (const [type, descriptor] of Object.entries(variants)) {
      const properties = fields(descriptor, `${key}/${type}`);
      const required = descriptor.required ?? [];
      const conditions = elementConditions(descriptor);
      if (required.some((name) => !own(properties, name))) unsupported(key, `${type} requires an undeclared field`);
      const existing = elements[type] ??= { properties, required: {}, ...conditions };
      if (signature(assertions({ properties: existing.properties })) !== signature(assertions({ properties }))) {
        unsupported(key, `${type} properties vary by parent context; cannot publish one field record`);
      }
      if (conditionSignature(elementConditions(existing), resolver) !== conditionSignature(conditions, resolver)) {
        unsupported(key, `${type} conditional rules vary by parent context beyond child element arrays`);
      }
      if (existing.required[mode] && signature([...existing.required[mode]].sort()) !== signature([...required].sort())) {
        unsupported(key, `${type} requirements vary within ${mode} context`);
      }
      existing.required[mode] = required;
      queue.push(...childTables(descriptor, resolver, `${key}/${type}`));
    }
  }
  for (const [type, element] of Object.entries(elements)) {
    if (!element.required.fixed || !element.required.flow) {
      unsupported("#/properties/elements", `${type} has no reachable fixed and flow variants`);
    }
  }
  return {
    root: { properties: root.properties, required: root.required ?? [] },
    elements,
    definitions: Object.fromEntries(Object.entries($defs)
      .map(([name, definition]) => [name, resolver.resolve(definition, `#/$defs/${name}`)])),
  };
}

export function architectureContractModule(schema) {
  // Declaration order is also the runtime's diagnostic field/type order.
  return [
    "// Generated from schema/architecture-v1.schema.json. Do not edit.",
    "// Regenerate: node .github/extensions/markdstage/scripts/generate-architecture-contract.mjs",
    "// Structural metadata only; renderer/architecture.mjs remains the semantic authority.",
    `export const architectureContract = ${JSON.stringify(deriveArchitectureContract(schema), null, 2)};`,
    "",
  ].join("\n");
}
