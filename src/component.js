// <harpy-diagram>: a self-contained player for step-by-step Mermaid diagrams.
//
//   <harpy-diagram mode="preview">            preview | split (source editor side by side)
//     <script type="text/harpy"> ...document... </script>
//   </harpy-diagram>
//
// Other attributes: src (load the document from a URL), theme (auto | light | dark),
// mermaid-theme (any Mermaid theme), no-dim (don't fade earlier steps).
// Events: harpy-step {index, id, summary}, harpy-change {source}.

import { parseDocument, dedent } from './source.js';
import { analyze, render, bind, resolveRefs } from './mermaid-adapter.js';
import { Player } from './player.js';
import { renderMarkdownAll } from './markdown.js';

const STYLES = /* css */ `
:host {
  --hp-bg: #ffffff;
  --hp-surface: #f6f7f9;
  --hp-editor: #fbfbfc;
  --hp-border: #e2e4e9;
  --hp-border-strong: #c9ccd4;
  --hp-text: #1c1f25;
  --hp-muted: #5e6572;
  --hp-accent: var(--harpy-accent, #4f46e5);
  --hp-accent-soft: color-mix(in srgb, var(--hp-accent) 13%, transparent);
  --hp-code: #eff1f4;
  --hp-warn: #9a5b00;
  --hp-error: #b42318;
  --hp-error-bg: #fef3f2;
  display: block;
  container-type: inline-size;
  color: var(--hp-text);
  font: 15px/1.55 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  outline: none;
}
@media (prefers-color-scheme: dark) {
  :host(:not([theme="light"])) {
    --hp-bg: #15171c; --hp-surface: #1c1f26; --hp-editor: #121418; --hp-border: #2b2f38;
    --hp-border-strong: #424855; --hp-text: #e5e7eb; --hp-muted: #9aa1ad;
    --hp-accent: var(--harpy-accent, #8f8aff); --hp-code: #262a33; --hp-warn: #f0b552;
    --hp-error: #ff8a80; --hp-error-bg: #2a1716;
  }
}
:host([theme="dark"]) {
  --hp-bg: #15171c; --hp-surface: #1c1f26; --hp-editor: #121418; --hp-border: #2b2f38;
  --hp-border-strong: #424855; --hp-text: #e5e7eb; --hp-muted: #9aa1ad;
  --hp-accent: var(--harpy-accent, #8f8aff); --hp-code: #262a33; --hp-warn: #f0b552;
  --hp-error: #ff8a80; --hp-error-bg: #2a1716;
}
[hidden] { display: none !important; }
* { box-sizing: border-box; }

.frame {
  background: var(--hp-bg);
  border: 1px solid var(--hp-border);
  border-radius: 12px;
  overflow: hidden;
}
:host(:focus-visible) .frame { outline: 2px solid var(--hp-accent); outline-offset: 2px; }

.bar {
  display: flex; align-items: center; gap: 12px;
  padding: 10px 14px;
  background: var(--hp-surface);
  border-bottom: 1px solid var(--hp-border);
}
.heading { flex: 1; min-width: 0; }
.title { margin: 0; font-size: 1rem; font-weight: 600; line-height: 1.3; }
.intro { margin-top: 2px; color: var(--hp-muted); font-size: .875rem; }
.intro > * { margin: 0; }

.modes {
  display: inline-flex; flex-shrink: 0; padding: 2px; gap: 2px;
  background: var(--hp-bg); border: 1px solid var(--hp-border); border-radius: 8px;
}
.modes button {
  border: 0; border-radius: 6px; padding: 4px 10px;
  background: transparent; color: var(--hp-muted);
  font: inherit; font-size: .8125rem; cursor: pointer;
}
.modes button:hover { color: var(--hp-text); }
.modes button[aria-pressed="true"] { background: var(--hp-accent-soft); color: var(--hp-accent); font-weight: 600; }
.modes button:focus-visible, .nav:focus-visible, .dot:focus-visible { outline: 2px solid var(--hp-accent); outline-offset: 1px; }

.body { display: grid; grid-template-columns: minmax(0, 1fr); }
.frame[data-mode="split"] .body { grid-template-columns: minmax(0, 1fr) minmax(0, 1.25fr); }

.editor { display: none; flex-direction: column; min-width: 0; background: var(--hp-editor); border-right: 1px solid var(--hp-border); }
.frame[data-mode="split"] .editor { display: flex; }
textarea {
  flex: 1; width: 100%; min-height: 380px; margin: 0; padding: 14px 16px;
  border: 0; outline: none; resize: none;
  background: transparent; color: var(--hp-text);
  font: 13px/1.6 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  tab-size: 2; white-space: pre; overflow: auto;
}
.status { padding: 6px 12px; border-top: 1px solid var(--hp-border); font-size: .75rem; color: var(--hp-muted); }
.status ul { margin: 0; padding-left: 1.1em; color: var(--hp-warn); }

@container (max-width: 720px) {
  .frame[data-mode="split"] .body { grid-template-columns: minmax(0, 1fr); }
  .editor { border-right: 0; border-bottom: 1px solid var(--hp-border); }
  textarea { min-height: 240px; }
}

.player { display: flex; flex-direction: column; min-width: 0; }
.stage { position: relative; flex: 1; display: flex; align-items: center; justify-content: safe center; min-height: 220px; padding: 20px 16px; overflow-x: auto; }
.svg-host { width: 100%; min-width: min-content; display: flex; justify-content: safe center; }
.svg-host svg { display: block; max-width: 100%; height: auto; max-height: var(--harpy-max-height, 70vh); }
.placeholder { color: var(--hp-muted); font-size: .875rem; }
.error {
  position: absolute; left: 12px; right: 12px; bottom: 12px; max-height: 45%; overflow: auto; margin: 0;
  padding: 8px 10px; border: 1px solid color-mix(in srgb, var(--hp-error) 35%, transparent); border-radius: 8px;
  background: var(--hp-error-bg); color: var(--hp-error);
  font: 12px/1.5 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; white-space: pre-wrap;
}

.caption { padding: 14px 18px 4px; border-top: 1px solid var(--hp-border); }
.counter { color: var(--hp-accent); font-size: .75rem; font-weight: 600; letter-spacing: .05em; text-transform: uppercase; }
.step-title { margin: 2px 0 6px; font-size: 1.0625rem; font-weight: 600; line-height: 1.35; }
.description { font-size: .9375rem; }
.description > :first-child { margin-top: 0; }
.description > :last-child { margin-bottom: 0; }
.description a { color: var(--hp-accent); }
.description code { padding: .1em .35em; border-radius: 4px; background: var(--hp-code); font-size: .875em; }
.description pre { padding: 10px 12px; border-radius: 8px; background: var(--hp-code); overflow: auto; }
.description pre code { padding: 0; background: none; }
.description blockquote { margin: 0; padding-left: 12px; border-left: 3px solid var(--hp-border-strong); color: var(--hp-muted); }

.controls { display: flex; align-items: center; gap: 10px; padding: 10px 14px 14px; }
.nav {
  display: grid; place-items: center; width: 34px; height: 34px; flex-shrink: 0;
  border: 1px solid var(--hp-border); border-radius: 8px;
  background: var(--hp-bg); color: var(--hp-text); cursor: pointer;
}
.nav:hover:not(:disabled) { border-color: var(--hp-accent); color: var(--hp-accent); }
.nav:disabled { opacity: .4; cursor: default; }
.nav svg { width: 16px; height: 16px; }
.dots { flex: 1; display: flex; flex-wrap: wrap; justify-content: center; gap: 2px; }
.dot { display: grid; place-items: center; width: 24px; height: 24px; padding: 0; border: 0; background: none; cursor: pointer; border-radius: 6px; }
.dot::before { content: ""; width: 8px; height: 8px; border-radius: 50%; background: var(--hp-border-strong); transition: width .2s, background-color .2s; }
.dot.summary::before { border-radius: 2px; transform: rotate(45deg); }
.dot:hover::before { background: var(--hp-muted); }
.dot[aria-current="step"]::before { width: 18px; border-radius: 4px; transform: none; background: var(--hp-accent); }

.svg-host .harpy-el { transition: opacity var(--harpy-duration, 420ms) ease, filter 300ms ease; }
.svg-host .harpy-hidden { opacity: 0 !important; pointer-events: none; }
.svg-host .harpy-dim { opacity: var(--harpy-dim-opacity, .28); }
.svg-host .harpy-focus { filter: drop-shadow(0 0 5px var(--hp-accent)); }
@media (prefers-reduced-motion: reduce) {
  .svg-host .harpy-el, .dot::before { transition: none; }
}
`;

const CHEVRON = (d) => `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${d}"/></svg>`;

const MARKUP = `
<div class="frame" part="frame">
  <header class="bar" part="bar">
    <div class="heading"><h2 class="title" hidden></h2><div class="intro" hidden></div></div>
    <div class="modes" role="group" aria-label="View mode">
      <button type="button" data-mode="preview">Preview</button>
      <button type="button" data-mode="split">Side by side</button>
    </div>
  </header>
  <div class="body">
    <section class="editor" part="editor">
      <textarea spellcheck="false" autocapitalize="off" autocomplete="off" aria-label="Diagram source"></textarea>
      <div class="status" hidden></div>
    </section>
    <section class="player" part="player">
      <div class="stage">
        <div class="svg-host"></div>
        <div class="placeholder">Rendering…</div>
        <pre class="error" role="alert" hidden></pre>
      </div>
      <div class="caption" aria-live="polite" hidden>
        <div class="counter"></div>
        <h3 class="step-title"></h3>
        <div class="description"></div>
      </div>
      <nav class="controls" aria-label="Steps" hidden>
        <button type="button" class="nav prev" aria-label="Previous step">${CHEVRON('M10 3.5 5.5 8l4.5 4.5')}</button>
        <div class="dots"></div>
        <button type="button" class="nav next" aria-label="Next step">${CHEVRON('M6 3.5 10.5 8 6 12.5')}</button>
      </nav>
    </section>
  </div>
</div>`;

const MIN_DIAGRAM_WIDTH = 480;

let template;
let instances = 0;

function errorMessage(e) {
  const text = e?.message ?? e?.str ?? String(e);
  return text.replace(/^Error:\s*/, '');
}

export class HarpyDiagram extends HTMLElement {
  static observedAttributes = ['mode', 'theme', 'mermaid-theme', 'src', 'no-dim'];

  constructor() {
    super();
    if (!template) {
      template = document.createElement('template');
      template.innerHTML = `<style>${STYLES}</style>${MARKUP}`;
    }
    const root = this.attachShadow({ mode: 'open' });
    root.append(template.content.cloneNode(true));
    const $ = (s) => root.querySelector(s);
    this._el = {
      frame: $('.frame'), title: $('.title'), intro: $('.intro'), modes: $('.modes'),
      textarea: $('textarea'), status: $('.status'), svgHost: $('.svg-host'),
      placeholder: $('.placeholder'), error: $('.error'), caption: $('.caption'),
      counter: $('.counter'), stepTitle: $('.step-title'), description: $('.description'),
      controls: $('.controls'), dots: $('.dots'), prev: $('.prev'), next: $('.next'),
    };
    this._uid = ++instances;
    this._source = null;
    this._steps = [];
    this._index = 0;
    this._player = null;
    this._token = 0;
    this._timer = null;
    this._srcToken = 0;

    this._el.modes.addEventListener('click', (e) => {
      const mode = e.target.closest('button')?.dataset.mode;
      if (mode) this.mode = mode;
    });
    this._el.prev.addEventListener('click', () => this.prev());
    this._el.next.addEventListener('click', () => this.next());
    this._el.dots.addEventListener('click', (e) => {
      const dot = e.target.closest('.dot');
      if (dot) this.goTo(Number(dot.dataset.index));
    });
    this._el.textarea.addEventListener('input', () => {
      this._source = this._el.textarea.value;
      this.dispatchEvent(new CustomEvent('harpy-change', { detail: { source: this._source }, bubbles: true }));
      this._scheduleRender(300);
    });
    this._el.textarea.addEventListener('keydown', (e) => {
      if (e.key === 'Tab' && !e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        this._el.textarea.setRangeText('  ', this._el.textarea.selectionStart, this._el.textarea.selectionEnd, 'end');
        this._el.textarea.dispatchEvent(new Event('input'));
      }
    });
    this.addEventListener('keydown', (e) => this._onKey(e));
    this._onScheme = () => {
      if (!this.hasAttribute('mermaid-theme') && !['light', 'dark'].includes(this.getAttribute('theme'))) this._scheduleRender(0);
    };
  }

  connectedCallback() {
    if (!this.hasAttribute('tabindex')) this.tabIndex = 0;
    this._syncMode();
    this._scheme = matchMedia('(prefers-color-scheme: dark)');
    this._scheme.addEventListener('change', this._onScheme);
    if (this._source === null) this._loadSource();
  }

  disconnectedCallback() {
    this._scheme?.removeEventListener('change', this._onScheme);
  }

  attributeChangedCallback(name, oldValue, value) {
    if (oldValue === value) return;
    if (name === 'mode') this._syncMode();
    else if (name === 'src') {
      if (this.isConnected) this._loadSource();
    } else if (this._source !== null) this._scheduleRender(0);
  }

  /** "preview" or "split". */
  get mode() {
    return this.getAttribute('mode') === 'split' ? 'split' : 'preview';
  }
  set mode(value) {
    this.setAttribute('mode', value === 'split' ? 'split' : 'preview');
  }

  /** The Harpy document source. */
  get source() {
    return this._source ?? '';
  }
  set source(value) {
    this._source = dedent(value);
    if (this._el.textarea.value !== this._source) this._el.textarea.value = this._source;
    this._scheduleRender(0);
  }

  /** Current step index (the summary is the last index). */
  get step() {
    return this._index;
  }

  /** Steps as [{ id, title, summary }]. */
  get steps() {
    return this._steps.map(({ id, title, summary }) => ({ id, title, summary }));
  }

  next() {
    this.goTo(this._index + 1);
  }
  prev() {
    this.goTo(this._index - 1);
  }
  /** Goes to a step by index or id. */
  goTo(target) {
    const index = typeof target === 'string' ? this._steps.findIndex((s) => s.id === target) : target;
    if (index < 0 || index >= this._steps.length || index === this._index) return;
    this._go(index, { animate: true });
  }

  _onKey(e) {
    if (e.composedPath()[0] === this._el.textarea || e.altKey || e.ctrlKey || e.metaKey) return;
    const actions = {
      ArrowRight: () => this.next(), PageDown: () => this.next(),
      ArrowLeft: () => this.prev(), PageUp: () => this.prev(),
      Home: () => this.goTo(0), End: () => this.goTo(this._steps.length - 1),
    };
    if (actions[e.key] && this._steps.length > 1) {
      e.preventDefault();
      actions[e.key]();
    }
  }

  _syncMode() {
    const mode = this.mode;
    this._el.frame.dataset.mode = mode;
    for (const b of this._el.modes.querySelectorAll('button')) b.setAttribute('aria-pressed', String(b.dataset.mode === mode));
  }

  _loadSource() {
    const src = this.getAttribute('src');
    const token = ++this._srcToken;
    if (src) {
      fetch(src)
        .then((r) => (r.ok ? r.text() : Promise.reject(new Error(`HTTP ${r.status}`))))
        .then((text) => token === this._srcToken && (this.source = text))
        .catch((e) => token === this._srcToken && this._showError(`Could not load ${src}: ${errorMessage(e)}`));
      return;
    }
    const holder = this.querySelector(':scope > script[type="text/harpy"], :scope > script[type="text/markdown"], :scope > template');
    const raw = holder ? (holder instanceof HTMLTemplateElement ? holder.content.textContent : holder.textContent) : this.textContent;
    this.source = raw;
  }

  _scheduleRender(delay) {
    clearTimeout(this._timer);
    this._timer = setTimeout(() => this._render(), delay);
  }

  _mermaidTheme() {
    const explicit = this.getAttribute('mermaid-theme');
    if (explicit) return explicit;
    const theme = this.getAttribute('theme');
    const dark = theme === 'dark' || (theme !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches);
    return dark ? 'dark' : 'default';
  }

  async _render() {
    const token = ++this._token;
    const doc = parseDocument(this._source ?? '');
    if (!doc.diagram.trim()) {
      this._el.svgHost.replaceChildren();
      this._el.placeholder.textContent = 'No diagram yet.';
      this._el.placeholder.hidden = false;
      return;
    }
    try {
      const analysis = await analyze(doc.diagram, doc.steps);
      if (token !== this._token) return;
      const warnings = [...doc.warnings, ...analysis.warnings];
      const plan = doc.steps.map((s, i) => ({
        units: analysis.stepUnits[i],
        focus: s.focus ? resolveRefs(s.focus, analysis, warnings, `Step "${s.id}" focus`) : null,
        show: resolveRefs(s.show, analysis, warnings, `Step "${s.id}" show`),
        hide: resolveRefs(s.hide, analysis, warnings, `Step "${s.id}" hide`),
      }));
      const renderId = `harpy-${this._uid}-${token}`;
      const texts = [doc.intro, ...doc.steps.map((s) => doc.descriptions.get(s.id) ?? ''), doc.summary?.body ?? ''];
      const [svgMarkup, html] = await Promise.all([render(renderId, doc.diagram, this._mermaidTheme()), renderMarkdownAll(texts)]);
      if (token !== this._token) return;

      const [introHtml, ...stepHtml] = html;
      const summaryHtml = stepHtml.pop();
      this._el.title.textContent = doc.title ?? '';
      this._el.title.hidden = !doc.title;
      this._el.intro.innerHTML = introHtml;
      this._el.intro.hidden = !introHtml;

      this._el.svgHost.innerHTML = svgMarkup;
      this._el.placeholder.hidden = true;
      const svg = this._el.svgHost.querySelector('svg');
      // Don't let wide diagrams shrink into illegibility on narrow screens; scroll instead.
      const natural = parseFloat(svg.style.maxWidth);
      if (natural) svg.style.minWidth = `${Math.min(natural, MIN_DIAGRAM_WIDTH)}px`;
      const firstRender = !this._player;
      this._player = new Player(bind(svg, analysis, renderId), plan, { dim: !this.hasAttribute('no-dim') });

      const previousId = this._steps[this._index]?.id;
      this._steps = doc.steps.map((s, i) => ({ id: s.id, title: s.title ?? s.id, heading: s.title ?? s.id, html: stepHtml[i], summary: false }));
      if (doc.steps.length || doc.summary) {
        this._steps.push({ id: 'summary', title: doc.summary?.title ?? 'Summary', heading: doc.summary?.title ?? '', html: summaryHtml, summary: true });
      }
      let index = this._steps.findIndex((s) => s.id === previousId);
      if (index < 0) index = Math.min(this._index, Math.max(this._steps.length - 1, 0));

      this._renderDots();
      this._setWarnings(warnings);
      this._showError(null);
      this._go(index, { animate: firstRender });
    } catch (e) {
      if (token === this._token) this._showError(errorMessage(e));
    }
  }

  _renderDots() {
    const dots = this._steps.map((s, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = s.summary ? 'dot summary' : 'dot';
      b.dataset.index = String(i);
      b.title = s.summary ? s.title : `${i + 1}. ${s.title}`;
      b.setAttribute('aria-label', b.title);
      return b;
    });
    this._el.dots.replaceChildren(...dots);
  }

  _go(index, { animate }) {
    const hasSteps = this._steps.length > 0;
    this._el.caption.hidden = !hasSteps;
    this._el.controls.hidden = this._steps.length < 2;
    if (!this._player) return;
    if (!hasSteps) {
      this._player.go(0, { animate: false });
      this._index = 0;
      return;
    }
    this._player.go(index, { animate });
    this._index = index;
    const step = this._steps[index];
    const count = this._steps.length - (this._steps.at(-1).summary ? 1 : 0);
    this._el.counter.textContent = step.summary ? 'Summary' : `Step ${index + 1} of ${count}`;
    this._el.stepTitle.textContent = step.heading;
    this._el.stepTitle.hidden = !step.heading;
    this._el.description.innerHTML = step.html;
    this._el.description.hidden = !step.html;
    this._el.prev.disabled = index === 0;
    this._el.next.disabled = index === this._steps.length - 1;
    for (const dot of this._el.dots.children) {
      if (Number(dot.dataset.index) === index) dot.setAttribute('aria-current', 'step');
      else dot.removeAttribute('aria-current');
    }
    this.dispatchEvent(new CustomEvent('harpy-step', { detail: { index, id: step.id, summary: step.summary }, bubbles: true }));
  }

  _setWarnings(warnings) {
    const { status } = this._el;
    status.hidden = warnings.length === 0;
    if (!warnings.length) return;
    const list = document.createElement('ul');
    for (const w of warnings) list.append(Object.assign(document.createElement('li'), { textContent: w }));
    status.replaceChildren(list);
  }

  _showError(message) {
    this._el.error.textContent = message ?? '';
    this._el.error.hidden = !message;
    if (message && !this._el.svgHost.firstChild) {
      this._el.placeholder.hidden = true;
    }
  }
}
