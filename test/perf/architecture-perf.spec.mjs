// Architecture DSL の描画コストのバジェット。
//
// なぜ測るか: レイアウト（layered / row / column）と配線（rip-up and reroute）は
// 要素数に対して素直に線形ではない書き方ができてしまう場所で、実際に
// 配線は再配線ループを持っている。ここが二乗や指数に転ぶと、スライドを
// 1 枚めくるたびにブラウザーが固まる。見た目は壊れないので、ビジュアル回帰
// では絶対に捕まらない種類の劣化である。
//
// 何を測るか: `renderArchitectureBlock`（パース + レイアウト + 配線 + SVG 生成）
// の 1 回あたりの所要時間。ページ遷移やフォント読み込みを含む end-to-end 時間は
// マシンとネットワークの影響が大きすぎてバジェットにならないので、
// パイプラインだけを **ページ内で** 直接呼んで測る。
//
// バジェットの根拠（実測値。Windows / Chromium / 41 回の中央値）:
//
//   | 図の形                              | 要素数 | 1 回あたり |
//   | ----------------------------------- | ------ | ---------- |
//   | ノード 1（ほぼ空）                  |      1 |    0.1 ms  |
//   | ノード 25（接続なし）               |     25 |    1.2 ms  |
//   | ノード 200（接続なし）              |    200 |    8.3 ms  |
//   | ノード 100 + 交差コネクター 100     |    200 |    9.0 ms  |
//
// 200 要素は `MAX_ELEMENTS` そのもので、**DSL が受け付ける最大の図**である。
// つまり上の 9 ms 前後が、製品として起こりうる最悪ケースの実測値。
//
// 平均ではなく **中央値** を取る。1 回ごとに計測して中央値を取ると、GC や
// 他プロセスに 1 回持っていかれても値が動かない。平均だと外れ値 1 個で
// 比率が崩れ、バジェットを無意味に緩める方向へ引っ張られる。
//
// スケーリングでは 2 つのサイズを **交互に** 測る。別々にまとめて測ると、
// 計測中の CPU 周波数や JIT の状態のずれがそのまま比率に乗る（同じコードで
// 25 ms と 111 ms に振れるのを実測した）。交互なら、その手のドリフトは
// 両方に等しく乗るので比率からは消える。
//
// 2 本立てにしている理由:
//   - 絶対バジェット（RENDER_BUDGET_MS）は「数 ms が数秒になった」だけを見る
//     粗い門。CI は共有ランナーで実測の数倍ぶれるので、ここを締めても
//     不安定になるだけで劣化は捕まらない。
//   - 実際に形の劣化を捕まえるのは **スケーリング側**。要素数を 8 倍にして
//     コストが何倍になるかを見る。ここは相対値なのでマシン速度に影響されず、
//     遅いランナーでも締めたままにできる。

import { expect, test } from "@playwright/test";

import { startHarness } from "../harness/server.mjs";

/** DSL が受け付ける要素数の上限（architecture.mjs の MAX_ELEMENTS と同じ値）。 */
const MAX_ELEMENTS = 200;

/**
 * 最大サイズの図 1 枚あたりの上限。実測 ~9 ms に対して 27 倍の余裕。
 * ここを超えるのは「アルゴリズムが壊れた」ときだけのはず。
 */
const RENDER_BUDGET_MS = 250;

/**
 * 要素数 8 倍（25 → 200）でコストが何倍まで増えてよいか。
 * 線形なら 8 倍、二乗なら 64 倍。実測は 7.3〜8.3 倍（ほぼ線形、3 回計測）。
 *
 * 15 倍は実測上限の約 1.8 倍。相対値なのでランナーの速度そのものには影響されず、
 * 遅い CI でも締めたままにできる（小さい図と大きい図を**交互に**測っているので、
 * 計測中の速度変動は比率から消える）。
 *
 * 変異テストで確認済み: 描画に要素数の二乗に比例するコストを足すと比率が
 * 19〜35 倍に上がり、3 回とも 15 を超えてこのテストが落ちる。逆に無改造では
 * 3 回とも 8.3 以下だった。
 */
const SCALING_BUDGET = 15;

/** 中央値を取る回数。1 回ごとに計測するので外れ値に強い。 */
const RUNS = 41;

/** ウォームアップ（JIT とアイコンの初回生成をバジェットから外す）。 */
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

/** ノードだけの図。レイアウトと SVG 生成のコストを見る。 */
function nodesOnly(count) {
  const elements = [];
  for (let i = 0; i < count; i += 1) elements.push(makeNode(i));
  return { version: 1, title: "Perf nodes", description: "Perf fixture.", canvas: CANVAS, elements };
}

/**
 * ノードとコネクターが半々の図。コネクターは大きく飛び越して交差させる
 * （i -> i+37）。これが配線アルゴリズムにとって最も重い形。
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
 * ページ内で `renderArchitectureBlock` を繰り返し呼び、1 回あたりの ms の
 * **中央値** を返す。1 回ずつ計測して中央値を取るので、GC や他プロセスに
 * 数回持っていかれても値が動かない。
 *
 * 併せて「本当に図が描けたか」も返す。図がエラー表示に落ちていると描画コストは
 * 劇的に下がる（実測 0.6 ms）ので、速いことを成功と誤読しないためのガード。
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
 * 2 つのモデルを **交互に** 測って、それぞれの中央値と比率を返す。
 *
 * 別々に測ると、測っている間の CPU 周波数・JIT の状態・他プロセスの負荷が
 * 2 つの計測でずれ、比率にそのまま乗る（実測で同じコードが 24 ms と 111 ms に
 * 振れた）。交互に測れば、その手のドリフトは両方に等しく乗るので比率から消える。
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
  // このデッキの中身は測定に使わない（測定対象はページ内で組み立てる）。
  // renderer を読み込んでモジュールを解決できる状態にするためだけのもの。
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

test.describe("Architecture の描画コスト", () => {
  test("DSL が受け付ける最大サイズの図が描画バジェット内に収まる", async ({ page }) => {
    const nodes = await measureRender(page, nodesOnly(MAX_ELEMENTS));
    const routed = await measureRender(page, nodesAndCrossingConnectors(MAX_ELEMENTS / 2));

    // まず「本当に最大サイズの図が描けている」ことを確認する。
    // MAX_ELEMENTS を 1 でも超えるとパーサーがエラー表示に落ち、描画コストが
    // ほぼゼロになる。速さを成功と読み違えないための門。
    expect(nodes.rendered, "ノードだけの図が描画されていない").toBe(true);
    expect(routed.rendered, "コネクター入りの図が描画されていない").toBe(true);
    expect(nodes.elementCount).toBe(MAX_ELEMENTS);
    expect(routed.elementCount).toBe(MAX_ELEMENTS);

    expect(
      nodes.perRun,
      `ノード ${MAX_ELEMENTS} 個の描画が ${nodes.perRun.toFixed(1)}ms（実測基準 ~8ms）`,
    ).toBeLessThan(RENDER_BUDGET_MS);
    expect(
      routed.perRun,
      `交差コネクター入りの描画が ${routed.perRun.toFixed(1)}ms（実測基準 ~9ms）`,
    ).toBeLessThan(RENDER_BUDGET_MS);
  });

  test("要素数に対して描画コストが二乗に転ばない", async ({ page }) => {
    const { small, large } = await measureScaling(page, nodesOnly(25), nodesOnly(MAX_ELEMENTS));

    expect(small.rendered).toBe(true);
    expect(large.rendered).toBe(true);
    expect(small.elementCount).toBe(25);
    expect(large.elementCount).toBe(MAX_ELEMENTS);
    // 割り算する前に、分母がタイマー分解能に埋もれていないことを確かめる。
    // ここが 0 に近いと比率がいくらでも大きく／小さく振れて意味を失う。
    expect(small.perRun, "小さい図の計測が速すぎて比率を取れない").toBeGreaterThan(0.05);

    const ratio = large.perRun / small.perRun;
    expect(
      ratio,
      `要素数 8 倍でコストが ${ratio.toFixed(1)} 倍（線形なら 8 倍、二乗なら 64 倍、実測 7〜8 倍）`,
    ).toBeLessThan(SCALING_BUDGET);
  });
});
