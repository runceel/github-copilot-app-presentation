import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, rm, stat, utimes, writeFile } from "node:fs/promises";
import { architectureSchemaReference } from "../architecture-reference.mjs";
import { architectureContract } from "../renderer/architecture-contract.mjs";
import { parseArchitecture, validateArchitecture } from "../renderer/architecture.mjs";
import { architectureContractModule, deriveArchitectureContract } from "../schema/architecture-contract.mjs";
import { generateArchitectureContract } from "../scripts/generate-architecture-contract.mjs";

const schema = JSON.parse(await readFile(new URL("../schema/architecture-v1.schema.json", import.meta.url), "utf8"));
const generatedUrl = new URL("../renderer/architecture-contract.mjs", import.meta.url);
const sorted = (value) => [...value].sort();

function reverseKeys(value) {
  if (Array.isArray(value)) return value.map(reverseKeys);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).reverse().map(([key, entry]) => [key, reverseKeys(entry)]));
}

function exampleSource(reference = architectureSchemaReference()) {
  const source = reference.match(/```architecture\n([\s\S]*?)\n```/)?.[1];
  assert.ok(source, "reference contains a complete architecture example");
  return source;
}

test("contract generation is deterministic, preserves schema declaration order, and has no checked-in drift", async () => {
  const source = architectureContractModule(schema);
  assert.equal(source, architectureContractModule(schema));
  assert.deepEqual(deriveArchitectureContract(reverseKeys(schema)), deriveArchitectureContract(schema));
  assert.equal(source, (await readFile(generatedUrl, "utf8")).replace(/\r\n/g, "\n"));
  assert.deepEqual(deriveArchitectureContract(schema), architectureContract);
  assert.deepEqual(Object.keys(architectureContract.elements), schema.$defs.elementFixedL0.properties.type.enum);
  assert.deepEqual(Object.keys(architectureContract.elements.node.properties), Object.keys(schema.$defs.nodeBase.properties));
  assert.deepEqual(await generateArchitectureContract({ check: true }), { changed: false, checked: true });
  assert.doesNotMatch(source, /\bimport\b|\brequire\s*\(|\breadFile\b|\bfetch\s*\(/);
});

test("generator detects missing/stale output without writing and does not rewrite unchanged output", async (t) => {
  const directory = new URL(`./fixtures/contract-${randomUUID()}/`, import.meta.url);
  await mkdir(directory);
  t.after(() => rm(directory, { recursive: true, force: true }));
  const output = new URL("architecture-contract.mjs", directory);
  await assert.rejects(generateArchitectureContract({ check: true, output }), /out of date/);
  await assert.rejects(readFile(output), { code: "ENOENT" });
  await writeFile(output, "// deliberately stale\n");
  await assert.rejects(generateArchitectureContract({ check: true, output }), /out of date/);
  assert.equal(await readFile(output, "utf8"), "// deliberately stale\n");
  assert.deepEqual(await generateArchitectureContract({ output }), { changed: true, checked: false });
  await utimes(output, new Date("2000-01-01T00:00:00Z"), new Date("2000-01-01T00:00:00Z"));
  const before = await stat(output);
  assert.deepEqual(await generateArchitectureContract({ output }), { changed: false, checked: false });
  assert.equal((await stat(output)).mtimeMs, before.mtimeMs);
  const crlf = (await readFile(output, "utf8")).replace(/\n/g, "\r\n");
  await writeFile(output, crlf);
  assert.deepEqual(await generateArchitectureContract({ output, check: true }), { changed: false, checked: true });
  assert.deepEqual(await generateArchitectureContract({ output }), { changed: false, checked: false });
  assert.equal(await readFile(output, "utf8"), crlf, "Git checkout line endings do not cause drift or rewriting");
  const changed = structuredClone(schema);
  changed.properties.caption = { type: "string", maxLength: 90 };
  const source = new URL("changed.schema.json", directory);
  await writeFile(source, JSON.stringify(changed));
  await assert.rejects(generateArchitectureContract({ source, output, check: true }), /out of date/);
});

test("root, all element types including image, fields, and definition names come from schema", () => {
  const types = schema.$defs.elementFixedL0.properties.type.enum;
  assert.deepEqual(sorted(Object.keys(architectureContract.elements)), sorted(types));
  assert.deepEqual(sorted(Object.keys(architectureContract.root.properties)), sorted(Object.keys(schema.properties)));
  assert.deepEqual(architectureContract.root.required, schema.required);
  assert.deepEqual(sorted(Object.keys(architectureContract.definitions)), sorted(Object.keys(schema.$defs)));
  for (const type of types) {
    const base = Object.values(schema.$defs).find((entry) => entry.properties?.type?.const === type);
    assert.ok(base, `schema has a base declaration for ${type}`);
    assert.deepEqual(sorted(Object.keys(architectureContract.elements[type].properties)), sorted(Object.keys(base.properties)));
  }
  assert.equal(architectureContract.elements.image.properties.src.pattern, schema.$defs.assetPath.pattern);
  assert.deepEqual(architectureContract.elements.image.properties.fit.enum, ["contain", "cover", "stretch"]);
  assert.equal(Object.hasOwn(architectureContract.elements.connector.properties, "id"), false);
});

test("requirements depend on the parent layout, not a group's own layout", () => {
  for (const type of ["node", "image", "group"]) {
    const element = architectureContract.elements[type];
    assert.deepEqual(sorted(element.required.fixed), sorted([
      ...element.required.flow, ...schema.$defs.boxRequired.required,
    ]));
  }
  assert.deepEqual(sorted(architectureContract.elements.image.required.flow), ["id", "src", "type"]);
  assert.deepEqual(architectureContract.elements.connector.required.fixed, schema.$defs.connector.required);
  assert.deepEqual(architectureContract.elements.connector.required.flow, schema.$defs.connector.required);
  assert.deepEqual(architectureContract.definitions.groupChildrenL1, schema.$defs.groupChildrenL1);
  for (const field of schema.$defs.boxRequired.required) {
    assert.ok(architectureContract.definitions.groupFixedL0.required.includes(field));
  }
});

test("resolved metadata preserves ranges, patterns, enums, explicit defaults, and JSON Schema conditions", () => {
  const { definitions, elements, root } = architectureContract;
  assert.deepEqual(elements.node.properties.shape.enum, schema.$defs.nodeBase.properties.shape.enum);
  assert.deepEqual(elements.connector.properties.routing.enum, schema.$defs.connector.properties.routing.enum);
  assert.deepEqual(definitions.iconName.enum, schema.$defs.iconName.enum);
  assert.deepEqual(definitions.themeToken.enum, schema.$defs.themeToken.enum);
  for (const name of ["coordinate", "extent", "zIndex", "identifier", "literalColor", "assetPath"]) {
    assert.deepEqual(definitions[name], schema.$defs[name]);
  }
  assert.equal(definitions.style.properties.fontSize.minimum, 8);
  assert.equal(definitions.style.properties.fontSize.maximum, 160);
  assert.deepEqual(definitions.connector.if, schema.$defs.connector.if);
  assert.deepEqual(definitions.connector.else, schema.$defs.connector.else);
  assert.deepEqual(elements.connector.if, schema.$defs.connector.if);
  assert.deepEqual(elements.connector.else, schema.$defs.connector.else);
  assert.deepEqual(elements.group.if, schema.$defs.groupChildrenL1.if);
  assert.deepEqual(elements.group.then, schema.$defs.groupChildrenL1.then);
  assert.deepEqual(elements.group.else, schema.$defs.groupChildrenL1.else);
  assert.deepEqual(definitions.layoutObject.allOf, schema.$defs.layoutObject.allOf);
  const layoutObject = elements.group.properties.layout.anyOf.find((entry) => entry.type === "object");
  assert.deepEqual(layoutObject.allOf, schema.$defs.layoutObject.allOf);
  assert.equal(elements.connector.properties.points.items.properties.x.minimum, -4000);
  assert.equal(elements.connector.properties.labelLayer.default, "front");
  assert.equal(root.properties.version.default, undefined, "do not invent defaults from descriptions");
  assert.equal(root.properties.canvas.properties.width.default, undefined);
});

test("only element array boundaries retain local references; cyclic scalar references fail explicitly", () => {
  function visit(value, path = []) {
    if (!value || typeof value !== "object") return;
    if (value.$ref) {
      assert.equal(path.at(-1), "items");
      assert.match(value.$ref, /^#\/\$defs\//);
      const target = schema.$defs[value.$ref.slice("#/$defs/".length)];
      assert.ok(target.properties.type.enum);
    }
    for (const [key, child] of Object.entries(value)) visit(child, [...path, key]);
  }
  visit(architectureContract);
  const changed = structuredClone(schema);
  changed.$defs.coordinate = { $ref: "#/$defs/coordinate" };
  assert.throws(() => deriveArchitectureContract(changed), /recursive \$ref/);
});

test("schema additions automatically update root, element and shared fields, constraints, and reference", () => {
  const changed = structuredClone(schema);
  changed.properties.locale = { type: "string", maxLength: 12 };
  changed.$defs.nodeBase.properties.badge = { type: "string", minLength: 2, maxLength: 24, pattern: "^[A-Z]+$" };
  changed.$defs.style.properties.outlineOpacity = { type: "number", minimum: 0, maximum: 1 };
  const contract = deriveArchitectureContract(changed);
  assert.deepEqual(contract.root.properties.locale, changed.properties.locale);
  assert.deepEqual(contract.elements.node.properties.badge, changed.$defs.nodeBase.properties.badge);
  assert.ok(!contract.elements.node.required.fixed.includes("badge"));
  assert.deepEqual(contract.definitions.style.properties.outlineOpacity, changed.$defs.style.properties.outlineOpacity);
  const reference = architectureSchemaReference(contract);
  assert.match(reference, /"locale": string maxLength=12/);
  assert.match(reference, /"badge": string minLength=2 maxLength=24 pattern=/);
  assert.match(reference, /"outlineOpacity": number minimum=0 maximum=1/);
  assert.notEqual(architectureContractModule(changed), architectureContractModule(schema));
});

test("new schema element discriminators and branches add types without a maintained type list", () => {
  const changed = structuredClone(schema);
  changed.$defs.widgetBase = {
    ...structuredClone(schema.$defs.nodeBase),
    properties: {
      ...structuredClone(schema.$defs.nodeBase.properties),
      type: { const: "widget" },
      caption: { type: "string", maxLength: 80 },
    },
  };
  changed.$defs.widgetFixed = { allOf: [{ $ref: "#/$defs/widgetBase" }, { $ref: "#/$defs/boxRequired" }] };
  changed.$defs.widgetFlow = { $ref: "#/$defs/widgetBase" };
  for (const definition of Object.values(changed.$defs)) {
    if (!definition.properties?.type?.enum?.includes("node")) continue;
    definition.properties.type.enum.push("widget");
    const branch = structuredClone(definition.allOf.find((entry) => entry.if?.properties?.type?.const === "node"));
    branch.if.properties.type.const = "widget";
    branch.then.$ref = branch.then.$ref.replace("node", "widget");
    definition.allOf.push(branch);
  }
  const contract = deriveArchitectureContract(changed);
  assert.deepEqual(sorted(Object.keys(contract.elements)), sorted([...Object.keys(architectureContract.elements), "widget"]));
  assert.equal(contract.elements.widget.properties.caption.maxLength, 80);
  assert.deepEqual(contract.elements.widget.required.fixed, contract.elements.node.required.fixed);
  assert.deepEqual(contract.elements.widget.required.flow, contract.elements.node.required.flow);
  const reference = architectureSchemaReference(contract);
  assert.match(reference, /### widget\n/);
  assert.match(reference, /"caption": string maxLength=80/);
});

test("allOf combines fields and numeric bounds rather than omitting later assertions", () => {
  const changed = structuredClone(schema);
  changed.$defs.coordinate = {
    allOf: [
      { type: "number", minimum: -5000, maximum: 5000 },
      { minimum: -4000, maximum: 4000 },
    ],
  };
  const contract = deriveArchitectureContract(changed);
  assert.deepEqual(contract.elements.node.properties.x, { type: "number", minimum: -4000, maximum: 4000 });
});

test("element-level allOf conditions survive alongside resolved fields and parent requirements", () => {
  const changed = structuredClone(schema);
  const condition = {
    if: { properties: { arrow: { const: false } }, required: ["arrow"] },
    then: { properties: { label: { maxLength: 30 } } },
  };
  changed.$defs.connector.allOf = [condition];
  const contract = deriveArchitectureContract(changed);
  assert.deepEqual(contract.elements.connector.if, schema.$defs.connector.if);
  assert.deepEqual(contract.elements.connector.else, schema.$defs.connector.else);
  assert.deepEqual(contract.elements.connector.allOf, [condition]);
  assert.equal(contract.elements.connector.properties.label.maxLength, 200);
  assert.deepEqual(contract.elements.connector.required.fixed, schema.$defs.connector.required);
});

test("new conditional requirements are included in the authoring reference automatically", () => {
  const changed = structuredClone(schema);
  changed.$defs.nodeBase.allOf = [{
    if: { properties: { icon: { const: "cloud" } }, required: ["icon"] },
    then: { required: ["ariaLabel"] },
  }];
  changed.$defs.connector.if.properties.routing.const = "orthogonal";
  const reference = architectureSchemaReference(deriveArchitectureContract(changed));
  const nodeSection = reference.split("### node\n")[1].split(/\n##/)[0];
  const connectorSection = reference.split("### connector\n")[1].split(/\n##/)[0];
  assert.match(nodeSection, /Conditional constraints:/);
  assert.match(reference, /"required":\["ariaLabel"\]/);
  assert.match(connectorSection, /"routing":\{"const":"orthogonal"\}/);
  assert.doesNotMatch(reference, /ONLY with routing="polyline"/);
});

test("derivation cannot weaken closed allOf or conditional object boundaries", () => {
  for (const condition of [
    { properties: { invented: { type: "string" } } },
    { if: { required: ["icon"] }, then: { properties: { invented: { type: "string" } } } },
  ]) {
    const changed = structuredClone(schema);
    changed.$defs.nodeBase.allOf = [condition];
    assert.throws(() => deriveArchitectureContract(changed), /closed object's permitted properties/);
  }
});

test("unsupported references, keywords, missing branches and varying parent-context fields fail explicitly", () => {
  for (const [change, pattern] of [
    [(value) => { value.$defs.coordinate = { $ref: "https://invalid.example/coordinate" }; }, /only local JSON Pointer/],
    [(value) => { value.$defs.nodeBase.properties.future = { type: "string", customAssertion: true }; }, /unrecognized JSON Schema keyword/],
    [(value) => { value.$defs.elementFixedL0.properties.type.enum.push("missing"); }, /no conditional element branch/],
    [(value) => { value.$defs.nodeFixed.allOf.push({ properties: { fixedOnly: { type: "string" } } }); }, /closed object's permitted properties/],
    [(value) => { value.$defs.nodeFixed.allOf.push({ if: { required: ["icon"] }, then: { required: ["ariaLabel"] } }); }, /conditional rules vary by parent context/],
    [(value) => { value.$defs.elementFixedL0.allOf[0].if.required.push("id"); }, /discriminator must test only/],
  ]) {
    const changed = structuredClone(schema);
    change(changed);
    assert.throws(() => deriveArchitectureContract(changed), pattern);
  }
});

test("complete reference includes all fields and authoring conditions within the UTF-8 budget", () => {
  const reference = architectureSchemaReference();
  assert.ok(Buffer.byteLength(reference, "utf8") <= 8192);
  for (const name of Object.keys(architectureContract.root.properties)) assert.ok(reference.includes(JSON.stringify(name)));
  for (const [type, element] of Object.entries(architectureContract.elements)) {
    const section = reference.split(`### ${type}\n`)[1]?.split(/\n##/)[0];
    assert.ok(section, `reference includes ${type}`);
    for (const name of Object.keys(element.properties)) assert.ok(section.includes(JSON.stringify(name)), `${type}.${name}`);
  }
  for (const name of ["canvas", "style", "point", "layoutObject"]) {
    for (const field of Object.keys(architectureContract.definitions[name].properties)) {
      assert.ok(reference.includes(JSON.stringify(field)), `${name}.${field}`);
    }
  }
  assert.match(reference, /OWN layout.*does NOT waive/);
  assert.match(reference, /Conditional constraints:/);
  assert.match(reference, /"routing":\{"const":"polyline"\}/);
  assert.match(reference, /"points":\{[^}]*"maxItems":0/);
  assert.match(reference, /"type":\{"const":"layered"\}/);
  assert.match(reference, /"not":\{"required":\["direction"\]\}/);
  assert.match(reference, /node text uses "text".*group headings use "title".*connector annotations use "label"/);
  assert.match(reference, /connector has no "id"/);
  assert.match(reference, /Unknown fields are rejected/);
  assert.match(reference, /schema\/architecture-v1.schema.json/);
  assert.match(reference, /topic=architecture-dsl/);
  assert.match(reference, /## Details[\s\S]*v1 compatibility\.$/);
});

test("reference budget counts UTF-8 bytes and fails rather than truncating schema additions", () => {
  const contract = structuredClone(architectureContract);
  contract.root.properties.unicode = { const: "界".repeat(900) };
  assert.throws(() => architectureSchemaReference(contract), /UTF-8 bytes.*8192/);
});

test("self-contained reference example has two nodes and a connector and is valid at runtime", () => {
  const source = exampleSource();
  const value = JSON.parse(source);
  assert.equal(value.elements.filter((entry) => entry.type === "node").length, 2);
  assert.equal(value.elements.filter((entry) => entry.type === "connector").length, 1);
  assert.doesNotMatch(source, /https?:|assets\/|\$schema/);
  assert.equal(parseArchitecture(source).elements.length, 3);
});

test("rejected-input diagnostics consume connector conditions as well as independent field errors", () => {
  const value = JSON.parse(exampleSource());
  value.elements[0].label = "Use text instead";
  value.elements[2].routing = "straight";
  value.elements[2].points = [{ x: 700, y: 200 }];
  const report = validateArchitecture(JSON.stringify(value));
  assert.equal(report.valid, false);
  const errors = report.diagnostics.filter((entry) => entry.severity === "error");
  assert.ok(errors.some((entry) => entry.pointer === "/elements/0/label"));
  assert.ok(errors.some((entry) => entry.pointer === "/elements/2/points"));
});
