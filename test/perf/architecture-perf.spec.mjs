// Rendering-cost budget for the Architecture DSL.
//
// Why measure this: layout (layered / row / column) and routing (rip-up and reroute) can easily
// become nonlinear in the number of elements; routing already has a rerouting loop. If this turns
// quadratic or exponential, the browser freezes whenever the slide changes. Nothing looks broken,
// so visual regression tests cannot detect this type of degradation.
//
// What to measure: duration per `renderArchitectureBlock` call (parsing + layout + routing + SVG
// generation). End-to-end time including navigation and font loading varies too much with the
// machine and network to serve as a budget, so call only the pipeline directly **inside the page**.
//
// Budget basis (measured on Windows / Chromium; median of 41 runs):
//
//   | Diagram shape                          | Elements | Per run |
//   | -------------------------------------- | -------- | ------- |
//   | 1 node (nearly empty)                  |        1 |  0.1 ms |
//   | 25 nodes (no connections)              |       25 |  1.2 ms |
//   | 200 nodes (no connections)             |      200 |  8.3 ms |
//   | 100 nodes + 100 crossing connectors    |      200 |  9.0 ms |
//
// 200 elements is `MAX_ELEMENTS`, the **largest diagram accepted by the DSL**. About 9 ms is
// therefore the measured worst case possible in the product.
//
// Use the **median**, not the mean. Measuring each run individually and taking the median keeps one
// GC pause or other process from moving the result. With a mean, one outlier distorts the ratio and
// encourages weakening the budget until it is meaningless.
//
// For scaling, measure the two sizes **alternately**. Measuring separate batches puts any CPU
// frequency or JIT drift directly into the ratio (the same code was observed varying from 25 ms to
// 111 ms). Alternating applies such drift equally to both sizes, removing it from the ratio.
//
// Why use both checks:
//   - The absolute budget (`RENDER_BUDGET_MS`) is a coarse gate that only catches milliseconds
//     becoming seconds. Shared CI runners vary by several times the measured value; tightening this
//     gate would only make it flaky, not catch degradation.
//   - The **scaling check** catches shape degradation by measuring the cost increase for 8x as many
//     elements. As a relative value, it is unaffected by machine speed and can remain strict even
//     on slow runners.

import { expect, test } from "@playwright/test";

import { startHarness } from "../harness/server.mjs";

/** Maximum number of elements accepted by the DSL (same as MAX_ELEMENTS in architecture.mjs). */
const MAX_ELEMENTS = 200;

/**
 * Per-diagram limit at maximum size. This leaves 27x headroom over the measured ~9 ms.
 * Only a broken algorithm should exceed this.
 */
const RENDER_BUDGET_MS = 250;

/**
 * Maximum cost increase allowed for 8x as many elements (25 → 200).
 * Linear is 8x; quadratic is 64x. Measured values are 7.3–8.3x (nearly linear, three measurements).
 *
 * 15x is about 1.8x the measured maximum. Because it is relative, runner speed does not affect it
 * and it can remain strict on slow CI. Alternating the **small and large** diagrams removes speed
 * variation during measurement from the ratio.
 *
 * Verified by mutation testing: adding render cost proportional to the square of the element count
 * raised the ratio to 19–35x, exceeding 15 in all three runs. Unmodified code stayed at or below
 * 8.3 in all three runs.
 */
const SCALING_BUDGET = 15;

/** Number of runs used for the median. Measuring each run individually resists outliers. */
const RUNS = 41;

/** Warmup that excludes JIT and initial icon generation from the budget. */
const WARMUP = 5;

const CANVAS = { width: 1600, height: 1600 };

function makeNode(index) {
  return {
    type: "node",
    id: `n${index}`,
    text: `Node ${index}`,
    icon: "server",
    x: 40 + (index % 10) * 155,
    y: 40 + Math.floor(index / 10) * 140,
    width: 140,
    height: 90,
  };
}

/** Node-only diagram for measuring layout and SVG generation cost. */
function nodesOnly(count) {
  const elements = [];
  for (let i = 0; i < count; i += 1) elements.push(makeNode(i));
  return { version: 1, title: "Perf nodes", description: "Perf fixture.", canvas: CANVAS, elements };
}

/**
 * Diagram with equal numbers of nodes and connectors. Connectors cross over long distances
 * (i -> i+37), which is the most expensive shape for the routing algorithm.
 */
function nodesAndCrossingConnectors(nodeCount) {
  const elements = [];
  for (let i = 0; i < nodeCount; i += 1) elements.push(makeNode(i));
  for (let i = 0; i < nodeCount; i += 1) {
    elements.push({
      type: "connector",
      from: `n${i}`,
      to: `n${(i + 37) % nodeCount}`,
      label: `e${i}`,
    });
  }
  return { version: 1, title: "Perf routing", description: "Perf fixture.", canvas: CANVAS, elements };
}

/**
 * Repeatedly call `renderArchitectureBlock` inside the page and return the **median** milliseconds
 * per run. Individual measurements and the median keep a few GC pauses or other processes from
 * moving the result.
 *
 * Also report whether the diagram actually rendered. An error display dramatically reduces render
 * cost (measured at 0.6 ms), so this guards against misreading fast failure as success.
 */
async function measureRender(page, model) {
  return page.evaluate(
    async ({ source, runs, warmup }) => {
      const module = await import("./renderer/architecture.mjs");
      const host = document.createElement("div");
      document.body.appendChild(host);
      try {
        const probe = module.renderArchitectureBlock(source, document);
        const rendered = !!probe.querySelector("svg.architecture-svg");
        const elementCount = probe.querySelectorAll("[data-architecture-order]").length;

        for (let i = 0; i < warmup; i += 1) {
          host.textContent = "";
          host.appendChild(module.renderArchitectureBlock(source, document));
        }

        const samples = [];
        for (let i = 0; i < runs; i += 1) {
          host.textContent = "";
          const started = performance.now();
          host.appendChild(module.renderArchitectureBlock(source, document));
          samples.push(performance.now() - started);
        }
        samples.sort((a, b) => a - b);

        return { rendered, elementCount, perRun: samples[Math.floor(samples.length / 2)] };
      } finally {
        host.remove();
      }
    },
    { source: JSON.stringify(model), runs: RUNS, warmup: WARMUP },
  );
}

/**
 * Measure two models **alternately**, returning each median and their ratio.
 *
 * Separate measurements let CPU frequency, JIT state, and other-process load drift between the two
 * batches and directly affect the ratio (the same code was observed varying from 24 ms to 111 ms).
 * Alternating applies this drift equally and removes it from the ratio.
 */
async function measureScaling(page, smallModel, largeModel) {
  return page.evaluate(
    async ({ smallSource, largeSource, runs, warmup }) => {
      const module = await import("./renderer/architecture.mjs");
      const host = document.createElement("div");
      document.body.appendChild(host);
      const once = (source) => {
        host.textContent = "";
        const started = performance.now();
        host.appendChild(module.renderArchitectureBlock(source, document));
        return performance.now() - started;
      };
      const median = (values) => {
        const sorted = [...values].sort((a, b) => a - b);
        return sorted[Math.floor(sorted.length / 2)];
      };
      try {
        const describe = (source) => {
          const probe = module.renderArchitectureBlock(source, document);
          return {
            rendered: !!probe.querySelector("svg.architecture-svg"),
            elementCount: probe.querySelectorAll("[data-architecture-order]").length,
          };
        };
        const small = describe(smallSource);
        const large = describe(largeSource);

        for (let i = 0; i < warmup; i += 1) {
          once(smallSource);
          once(largeSource);
        }

        const smallSamples = [];
        const largeSamples = [];
        for (let i = 0; i < runs; i += 1) {
          smallSamples.push(once(smallSource));
          largeSamples.push(once(largeSource));
        }

        small.perRun = median(smallSamples);
        large.perRun = median(largeSamples);
        return { small, large };
      } finally {
        host.remove();
      }
    },
    { smallSource: JSON.stringify(smallModel), largeSource: JSON.stringify(largeModel), runs: RUNS, warmup: WARMUP },
  );
}

let harness;

test.beforeAll(async () => {
  // This deck is not measured; measurement targets are built inside the page. It exists only to
  // load the renderer and make the module resolvable.
  harness = await startHarness({
    slides: [`## Perf\n\n\`\`\`architecture\n${JSON.stringify(nodesOnly(2))}\n\`\`\`\n`],
  });
});

test.afterAll(async () => {
  await harness?.close();
});

test.beforeEach(async ({ page }) => {
  await page.goto(`${harness.url}/`, { waitUntil: "load" });
  await page.waitForFunction(() => !document.body.classList.contains("mermaid-loading"));
});

test.describe("Architecture rendering cost", () => {
  test("the largest diagram accepted by the DSL stays within the rendering budget", async ({ page }) => {
    const nodes = await measureRender(page, nodesOnly(MAX_ELEMENTS));
    const routed = await measureRender(page, nodesAndCrossingConnectors(MAX_ELEMENTS / 2));

    // Log measurements. The budget is based on development-machine measurements, so recording each
    // environment's values is necessary to tell whether a future adjustment is correcting an overly
    // strict budget or masking a real slowdown.
    console.log(
      `[perf] ${MAX_ELEMENTS} nodes = ${nodes.perRun.toFixed(2)}ms / ` +
        `with crossing connectors = ${routed.perRun.toFixed(2)}ms (limit ${RENDER_BUDGET_MS}ms)`,
    );

    // First verify that the maximum-size diagrams actually rendered. Exceeding MAX_ELEMENTS by even
    // one produces a parser error display and near-zero render cost. This gate prevents treating
    // fast failure as success.
    expect(nodes.rendered, "the node-only diagram was not rendered").toBe(true);
    expect(routed.rendered, "the diagram with connectors was not rendered").toBe(true);
    expect(nodes.elementCount).toBe(MAX_ELEMENTS);
    expect(routed.elementCount).toBe(MAX_ELEMENTS);

    expect(
      nodes.perRun,
      `rendering ${MAX_ELEMENTS} nodes took ${nodes.perRun.toFixed(1)}ms (measured baseline ~8ms)`,
    ).toBeLessThan(RENDER_BUDGET_MS);
    expect(
      routed.perRun,
      `rendering with crossing connectors took ${routed.perRun.toFixed(1)}ms (measured baseline ~9ms)`,
    ).toBeLessThan(RENDER_BUDGET_MS);
  });

  test("rendering cost does not become quadratic with element count", async ({ page }) => {
    const { small, large } = await measureScaling(page, nodesOnly(25), nodesOnly(MAX_ELEMENTS));

    expect(small.rendered).toBe(true);
    expect(large.rendered).toBe(true);
    expect(small.elementCount).toBe(25);
    expect(large.elementCount).toBe(MAX_ELEMENTS);
    // Before dividing, verify that the denominator is above timer resolution. A value near zero
    // would make the ratio fluctuate arbitrarily and become meaningless.
    expect(small.perRun, "the small diagram rendered too quickly to calculate a ratio").toBeGreaterThan(0.05);

    const ratio = large.perRun / small.perRun;
    console.log(
      `[perf] 25 elements = ${small.perRun.toFixed(2)}ms / ${MAX_ELEMENTS} elements = ${large.perRun.toFixed(2)}ms / ` +
        `ratio ${ratio.toFixed(2)} (limit ${SCALING_BUDGET})`,
    );
    expect(
      ratio,
      `8x as many elements cost ${ratio.toFixed(1)}x (linear: 8x; quadratic: 64x; measured: 7–8x)`,
    ).toBeLessThan(SCALING_BUDGET);
  });
});
