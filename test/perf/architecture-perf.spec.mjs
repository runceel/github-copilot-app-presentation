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
// バジェットの根拠（実測値。Windows / Chromium / 21 回の平均）:
//
//   | 図の形                              | 要素数 | 1 回あたり |
//   | ----------------------------------- | ------ | ---------- |
//   | ノード 25（接続なし）               |     25 |    3.9 ms  |
//   | ノード 200（接続なし）              |    200 |   10.5 ms  |
//   | ノード 100 + 直列コネクター 100     |    200 |   11.9 ms  |
//   | ノード 100 + 交差コネクター 100     |    200 |   10.8 ms  |
//
// 200 要素は `MAX_ELEMENTS` そのもので、**DSL が受け付ける最大の図**である。
// つまり上の 12 ms 前後が、製品として起こりうる最悪ケースの実測値。
//
// 絶対バジェットを 300 ms に置いたのは、CI（Playwright の Docker イメージ、
// 共有ランナー）が開発機より数倍遅く、かつ他プロセスと競合するため。
// 実測の 25 倍の余裕がある。この値で捕まえたいのは「数 ms が数十 ms になった」
// ではなく「数 ms が数秒になった」——つまりアルゴリズムが壊れた場合である。
// 緩やかな劣化はスケーリング側のテストで見る。

import { expect, test } from "@playwright/test";

import { startHarness } from "../harness/server.mjs";

/** DSL が受け付ける要素数の上限（architecture.mjs の MAX_ELEMENTS と同じ値）。 */
const MAX_ELEMENTS = 200;

/**
 * 最大サイズの図 1 枚あたりの上限。実測 ~12 ms に対して 25 倍の余裕。
 * ここを超えるのは「アルゴリズムが壊れた」ときだけのはず。
 */
const RENDER_BUDGET_MS = 300;

/**
 * 要素数 8 倍（25 → 200）でコストが何倍まで増えてよいか。
 * 線形なら 8 倍、二乗なら 64 倍。実測は 2.7 倍（小さい図では固定コストが
 * 支配的なので線形より良く見える）。24 倍は二乗を確実に落としつつ、
 * 遅いランナーでの計測ノイズには耐える位置。
 */
const SCALING_BUDGET = 24;

/** 平均を取る回数。1 回あたりが数 ms なのでタイマー分解能を十分に超える。 */
const RUNS = 21;

/** ウォームアップ（JIT とアイコンの初回生成をバジェットから外す）。 */
const WARMUP = 3;

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
 * ページ内で `renderArchitectureBlock` を繰り返し呼び、1 回あたりの ms を返す。
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

        const started = performance.now();
        for (let i = 0; i < runs; i += 1) {
          host.textContent = "";
          host.appendChild(module.renderArchitectureBlock(source, document));
        }
        const perRun = (performance.now() - started) / runs;

        return { rendered, elementCount, perRun };
      } finally {
        host.remove();
      }
    },
    { source: JSON.stringify(model), runs: RUNS, warmup: WARMUP },
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
      `ノード ${MAX_ELEMENTS} 個の描画が ${nodes.perRun.toFixed(1)}ms（実測基準 ~10ms）`,
    ).toBeLessThan(RENDER_BUDGET_MS);
    expect(
      routed.perRun,
      `交差コネクター入りの描画が ${routed.perRun.toFixed(1)}ms（実測基準 ~11ms）`,
    ).toBeLessThan(RENDER_BUDGET_MS);
  });

  test("要素数に対して描画コストが二乗に転ばない", async ({ page }) => {
    const small = await measureRender(page, nodesOnly(25));
    const large = await measureRender(page, nodesOnly(MAX_ELEMENTS));

    expect(small.rendered).toBe(true);
    expect(large.rendered).toBe(true);
    // 割り算する前に、分母がタイマー分解能に埋もれていないことを確かめる。
    expect(small.perRun, "小さい図の計測が速すぎて比率を取れない").toBeGreaterThan(0.05);

    const ratio = large.perRun / small.perRun;
    expect(
      ratio,
      `要素数 8 倍でコストが ${ratio.toFixed(1)} 倍（線形なら 8 倍、二乗なら 64 倍）`,
    ).toBeLessThan(SCALING_BUDGET);
  });
});
