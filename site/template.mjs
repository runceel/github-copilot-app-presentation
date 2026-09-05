export function escapeHtml(value) {
  if (typeof value !== "string" && typeof value !== "number") {
    throw new TypeError("Site template values must be strings or numbers.");
  }
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character]);
}

const arrow = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M4 12h15m-6-6 6 6-6 6"/></svg>';
const external = '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M6 18 18 6M6 6h12v12"/></svg>';
const github = '<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true"><path d="M12 2a10 10 0 0 0-3.16 19.49c.5.09.68-.22.68-.48v-1.86c-2.78.6-3.37-1.18-3.37-1.18-.45-1.15-1.11-1.46-1.11-1.46-.91-.62.07-.61.07-.61 1 .07 1.53 1.03 1.53 1.03.89 1.53 2.34 1.09 2.91.83.09-.64.35-1.09.64-1.34-2.22-.25-4.56-1.11-4.56-4.94 0-1.09.39-1.99 1.03-2.69-.1-.25-.45-1.27.1-2.65 0 0 .84-.27 2.75 1.03A9.58 9.58 0 0 1 12 6.83c.85 0 1.7.11 2.5.34 1.91-1.3 2.75-1.03 2.75-1.03.55 1.38.2 2.4.1 2.65.64.7 1.03 1.6 1.03 2.69 0 3.84-2.34 4.68-4.57 4.93.36.31.68.92.68 1.86v2.74c0 .27.18.58.69.48A10 10 0 0 0 12 2Z"/></svg>';

export function renderPage({ copy: c, product, sources, siteUrl }) {
  const e = escapeHtml;
  const prefix = c.lang === "en" ? "../" : "./";
  const asset = (name) => `${prefix}assets/${name}`;
  const pageUrl = new URL(c.lang === "en" ? "en/" : "./", siteUrl).href;
  const docs = `${product.repository}/blob/main/docs/user-guide/${c.lang === "ja" ? "ja/" : ""}`;
  const installUrl = `${product.repository}/tree/${product.releaseTag}/.github/extensions/markdstage`;
  const prompt = `${c.canvasPrompt}\n\n${installUrl}`;
  const heading = (text) => e(text).replaceAll("\n", "<br>");
  const link = (url, text, className = "text-link") =>
    `<a class="${className}" href="${e(url)}">${e(text)}${external}</a>`;
  const copyButton = (id) =>
    `<button class="copy-button" type="button" data-copy="${id}" hidden>${e(c.copy)}</button>`;
  const example = (id, alt, description) => `
    <section class="example" id="example-${id}" aria-labelledby="example-title-${id}">
      <div class="example-output">
        <div class="output-bar"><h3 id="example-title-${id}">${e(id === "markdown" ? c.markdownLabel : c.architectureLabel)}</h3><span>1280 × 720</span></div>
        <img src="${asset(`examples/${id}.png`)}" alt="${e(alt)}" width="1280" height="720" loading="lazy" decoding="async">
      </div>
      <div class="example-detail">
        <p>${e(description)}</p>
        <details class="source-disclosure">
          <summary>${e(c.sourceLabel)} <span aria-hidden="true">+</span></summary>
          <pre tabindex="0" aria-label="${e(id + ".md")}"><code>${e(sources[id])}</code></pre>
        </details>
        <a class="text-link" href="${prefix}examples/${id}.md" download>${e(c.downloadSource)}${arrow}</a>
      </div>
    </section>`;
  return `<!doctype html>
<!--
THESIS: An opening-night poster for a real Markdown presentation tool, not a grid of feature cards.
OWN-WORLD: Midnight Ink, Paper, one Spotlight Amber focus; the existing hash-and-spotlight mark and Segoe system typography.
STORY: See actual output, inspect its source, choose an entry point, keep the Markdown.
FIRST VIEWPORT: Oversized two-line promise and an immediate start action above a wide, real architecture slide on a lit stage.
FORM: Opening-poster composition, grounded candidate 4, seed 44ef8c4b; static stage reveal, no scroll hijacking. User-confirmed.
-->
<html lang="${e(c.lang)}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="dark">
  <title>${e(c.title)}</title>
  <meta name="description" content="${e(c.description)}">
  <link rel="canonical" href="${e(pageUrl)}">
  <link rel="alternate" hreflang="ja" href="${e(siteUrl)}">
  <link rel="alternate" hreflang="en" href="${e(new URL("en/", siteUrl).href)}">
  <link rel="alternate" hreflang="x-default" href="${e(siteUrl)}">
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="MarkdStage">
  <meta property="og:title" content="${e(c.title)}">
  <meta property="og:description" content="${e(c.description)}">
  <meta property="og:url" content="${e(pageUrl)}">
  <meta property="og:locale" content="${e(c.locale)}">
  <meta property="og:image" content="${e(new URL("assets/examples/architecture.png", siteUrl).href)}">
  <meta property="og:image:width" content="1280">
  <meta property="og:image:height" content="720">
  <meta property="og:image:alt" content="${e(c.heroAlt)}">
  <meta name="twitter:card" content="summary_large_image">
  <link rel="icon" href="${asset("mark.svg")}" type="image/svg+xml">
  <link rel="preload" href="${asset("examples/architecture.png")}" as="image">
  <link rel="stylesheet" href="${asset("site.css")}">
  <script src="${asset("site.js")}" defer></script>
</head>
<body>
  <a class="skip-link" href="#main">${e(c.skip)}</a>
  <header class="header wrap">
    <a class="wordmark" href="${prefix}" aria-label="MarkdStage">
      <img src="${asset("mark.svg")}" alt="" width="38" height="38">
      <span>Markd<span class="wordmark-accent">Stage</span></span>
    </a>
    <nav class="main-nav" aria-label="${e(c.navLabel)}">
      <a href="#examples">${e(c.examplesNav)}</a>
      <a href="#get-started">${e(c.startNav)}</a>
      <div class="languages" role="group" aria-label="${e(c.languageLabel)}">
        <a href="${prefix}" lang="ja" hreflang="ja"${c.lang === "ja" ? ' aria-current="page"' : ""}>日本語</a>
        <span aria-hidden="true">/</span>
        <a href="${prefix}en/" lang="en" hreflang="en"${c.lang === "en" ? ' aria-current="page"' : ""}>EN</a>
      </div>
      <a class="github-icon" href="${e(product.repository)}" aria-label="GitHub">${github}</a>
    </nav>
  </header>
  <main id="main">
    <section class="hero wrap" aria-labelledby="hero-title">
      <div class="hero-copy">
        <h1 id="hero-title" lang="${e(c.heroLang)}">${e(c.heroLine1)}<br><span>${e(c.heroLine2)}</span></h1>
        <div class="hero-intro">
          <p>${e(c.heroDescription)}</p>
          <div class="hero-actions">
            <a class="button" href="#get-started">${e(c.start)}${arrow}</a>
            <a class="quiet-link" href="${e(product.repository)}">${e(c.viewGithub)}${external}</a>
          </div>
        </div>
      </div>
      <div class="stage">
        <div class="stage-beam" aria-hidden="true"></div>
        <span class="stage-hash" aria-hidden="true">#</span>
        <figure class="hero-slide">
          <img src="${asset("examples/architecture.png")}" width="1280" height="720" alt="${e(c.heroAlt)}" fetchpriority="high">
          <figcaption><span class="live-dot" aria-hidden="true"></span>${e(c.heroCaption)}<span class="slide-file">architecture.md</span></figcaption>
        </figure>
        <p class="stage-note">${e(c.heroNote)}</p>
      </div>
      <ul class="surfaces" aria-label="${e(c.surfacesLabel)}">
        <li>GitHub Copilot Canvas</li><li>Windows Desktop</li><li>CLI</li><li>PDF & PowerPoint</li>
      </ul>
    </section>

    <section class="examples-section wrap section" id="examples" aria-labelledby="examples-title">
      <div class="section-intro">
        <h2 id="examples-title">${heading(c.examplesTitle)}</h2>
        <p>${e(c.examplesDescription)}</p>
      </div>
      <div class="gallery-controls" role="group" aria-label="${e(c.galleryLabel)}" hidden>
        <button type="button" data-example="markdown" aria-controls="example-markdown" aria-pressed="true">${e(c.markdownLabel)}</button>
        <button type="button" data-example="architecture" aria-controls="example-architecture" aria-pressed="false">${e(c.architectureLabel)}</button>
      </div>
      <div class="gallery">
        ${example("markdown", c.markdownAlt, c.markdownDescription)}
        ${example("architecture", c.architectureAlt, c.architectureDescription)}
      </div>
    </section>

    <section class="editor-section section" aria-labelledby="editor-title">
      <div class="wrap editor-layout">
        <div class="editor-copy">
          <h2 id="editor-title">${e(c.editorTitle)}</h2>
          <p>${e(c.editorDescription)}</p>
          ${link(`${docs}diagrams-and-media.md`, c.editorLink)}
        </div>
        <figure class="editor-image">
          <img src="${asset("architecture-editor.png")}" width="1440" height="900" loading="lazy" decoding="async" alt="${e(c.editorAlt)}">
        </figure>
      </div>
    </section>

    <section class="workflow wrap section" aria-labelledby="workflow-title">
      <h2 id="workflow-title">${heading(c.workflowTitle)}</h2>
      <ol class="workflow-steps">
        ${c.steps.map((step, index) => `<li>
          <span class="step-number" aria-hidden="true">${index + 1}</span>
          <div><h3>${e(step.title)}</h3><p>${e(step.body)}</p><p class="step-detail">${e(step.detail)}</p></div>
        </li>`).join("")}
      </ol>
    </section>

    <section class="start-section section" id="get-started" aria-labelledby="start-title">
      <div class="wrap">
        <div class="section-intro">
          <h2 id="start-title">${heading(c.startTitle)}</h2>
          <p>${e(c.startDescription)}</p>
        </div>
        <div class="install-cli">
          <div><h3>${e(c.cliTitle)}</h3><p>${e(c.cliDescription)}</p>${link(`${docs}cli.md`, c.cliLink)}</div>
          <div>
            <div class="terminal">
              <div class="terminal-bar"><span>Terminal</span>${copyButton("cli-command")}</div>
              <pre tabindex="0" aria-label="CLI"><code id="cli-command">${e(product.cliCommand)}</code></pre>
            </div>
            <p class="install-next">${e(c.cliNext)}</p>
            <p class="requirements">${e(c.cliRequirements)}</p>
          </div>
        </div>
        <div class="install-options">
          <article>
            <h3>${e(c.desktopTitle)}</h3>
            <p>${e(c.desktopDescription)}</p>
            ${link(`${product.repository}/releases/latest`, c.desktopLink)}
            <p class="requirements">${e(c.desktopDetail)}</p>
          </article>
          <article>
            <h3>${e(c.canvasTitle)}</h3>
            <p>${e(c.canvasDescription)}</p>
            <details class="canvas-install">
              <summary>${e(c.canvasInstructions)}</summary>
              <div class="prompt-box">
                <pre tabindex="0" aria-label="Copilot"><code id="canvas-prompt">${e(prompt)}</code></pre>
                ${copyButton("canvas-prompt")}
              </div>
              <p class="requirements">${e(c.canvasWarning)}</p>
            </details>
            ${link(`${docs}installation.md`, c.canvasLink)}
          </article>
        </div>
        <p class="mac-note">${e(c.macDescription)} ${link(product.macUrl, c.macLink)} <span>${e(c.macNote)}</span></p>
      </div>
    </section>
  </main>
  <footer class="footer wrap">
    <div class="footer-promise"><img src="${asset("mark.svg")}" alt="" width="54" height="54"><div><h2>${e(c.footerTitle)}</h2><p>${e(c.footerDescription)}</p></div></div>
    <nav aria-label="${e(c.footerNavLabel)}">
      <a href="${e(product.repository)}">GitHub</a>
      <a href="${e(`${docs}README.md`)}">${e(c.docs)}</a>
      <a href="${e(`${product.repository}/releases`)}">${e(c.releases)}</a>
      <a href="${e(`${product.repository}/blob/main/LICENSE`)}">MIT License</a>
    </nav>
    <p class="footer-note">${e(c.footerNote)}</p>
  </footer>
  <p class="copy-status" role="status" aria-live="polite" data-copied="${e(c.copied)}" data-failed="${e(c.copyFailed)}" data-unavailable="${e(c.copyUnavailable)}"></p>
</body>
</html>
`;
}
