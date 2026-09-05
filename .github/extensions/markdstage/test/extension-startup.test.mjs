import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";

test("the real extension starts on a host without an advisory hook processor", () => {
  const extensionUrl = new URL("../extension.mjs", import.meta.url).href;
  const mockSdk = `
    export class CanvasError extends Error {}
    export const createCanvas = (options) => ({ declaration: options });
    export async function joinSession(config) {
      globalThis.joinedConfigurations ??= [];
      globalThis.joinedConfigurations.push(config);
      if (config.hooks && Object.values(config.hooks).some(Boolean)) {
        throw new Error("Request session.resume failed: Hook processor is not configured for session id: test-session");
      }
      return { log: async () => {} };
    }
  `;
  const script = `
    import assert from "node:assert/strict";
    import { registerHooks } from "node:module";
    const sdkUrl = ${JSON.stringify(`data:text/javascript,${encodeURIComponent(mockSdk)}`)};
    registerHooks({
      resolve(specifier, context, nextResolve) {
        return specifier === "@github/copilot-sdk/extension"
          ? { url: sdkUrl, shortCircuit: true }
          : nextResolve(specifier, context);
      },
    });
    await import(${JSON.stringify(extensionUrl)});
    assert.equal(globalThis.joinedConfigurations.length, 1, "do not retry joins on the same stdio transport");
    const [config] = globalThis.joinedConfigurations;
    for (const field of ["hooks", "onPermissionRequest", "enableFileHooks"]) {
      assert.equal(Object.hasOwn(config, field), false, field + " must not override host defaults");
    }
    assert.deepEqual(config.tools.map(tool => tool.name), ["markdstage_guide", "markdstage_validate"]);
    assert.deepEqual(config.canvases.map(canvas => canvas.declaration.id), ["MarkdStage", "architecture-editor"]);
    const presentation = config.canvases[0].declaration;
    assert.match(presentation.description, /markdstage_guide.*architecture-schema.*markdstage_validate/);
    const guide = await config.tools[0].handler({ topic: "architecture-schema" });
    assert.match(guide, /Architecture DSL v1 authoring reference/);
    const result = await config.tools[1].handler({ format: "dsl", source: '{"elements":[]}' });
    const report = JSON.parse(result.textResultForLlm);
    assert.equal(report.valid, true);
    assert.equal(report.complete, true);
  `;
  const result = spawnSync(process.execPath, ["--input-type=module", "--eval", script], {
    encoding: "utf8",
    timeout: 15_000,
  });
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr || result.stdout);
});
