// <harpy-diagram>: a self-contained player for step-by-step diagrams written in Mermaid syntax.
//
//   <harpy-diagram mode="preview">            preview | split (source editor side by side)
//     <script type="text/harpy"> ...document... </script>
//   </harpy-diagram>
//
// Other attributes: src (load the document from a URL), theme (auto | light | dark),
// no-dim (don't fade earlier steps).
// Events: harpy-step {index, id, summary}, harpy-change {source}.

import { parseDocument, dedent } from './source.js';
import { parseDiagram, assignSteps, aliases, resolveRefs } from './diagram/index.js';
import { createMeasurer } from './layout/text.js';
import { layoutFlowchart } from './layout/flowchart.js';
import { layoutSequence } from './layout/sequence.js';
import { renderDiagram } from './render/svg.js';
import { DIAGRAM_CSS, themeTokens } from './render/styles.js';
import { Player } from './player.js';
import { renderMarkdownAll } from './markdown.js';
import { loadDagre, loadFonts } from './deps.js';

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII', 'XIII', 'XIV', 'XV', 'XVI', 'XVII', 'XVIII', 'XIX', 'XX'];
const roman = (n) => ROMAN[n - 1] ?? String(n);
// Diagrams never shrink below this share of their natural size; narrow screens scroll instead.
const MIN_DIAGRAM_SCALE = 0.8;
const AUTOPLAY_MS = 3600;

const STYLES = /* css */ `
${themeTokens(':host', { lightSelector: ':host([theme="light"])', darkSelector: ':host([theme="dark"])' })}
:host {
  --hp-accent: var(--harpy-accent, var(--hp-glow));
  display: block;
  container-type: inline-size;
  color: var(--hp-ink);
  font: 400 17px/1.6 "EB Garamond", Garamond, Georgia, serif;
  outline: none;
}
[hidden] { display: none !important; }
* { box-sizing: border-box; }

.frame { background: var(--hp-stage); border: 1px solid var(--hp-line); border-radius: 4px; overflow: hidden; }
:host(:focus-visible) .frame { box-shadow: 0 0 0 2px var(--hp-bg), 0 0 0 3px var(--hp-accent); }

.bar { display: flex; flex-wrap: wrap; align-items: center; gap: 10px 16px; padding: 12px 18px; border-bottom: 1px solid var(--hp-line); background: var(--hp-surface); }
.heading { flex: 1 1 260px; min-width: 0; }
.title { margin: 0; font: 600 22px/1.2 "Cormorant Garamond", Garamond, serif; color: var(--hp-ink-bright); }
.intro { margin-top: 2px; color: var(--hp-ink-soft); font-size: 15.5px; line-height: 1.45; }
.intro > * { margin: 0; }
.modes { display: inline-flex; flex-shrink: 0; margin-left: auto; padding: 3px; gap: 2px; border: 1px solid var(--hp-line); border-radius: 999px; }
.modes button {
  border: 0; border-radius: 999px; padding: 6px 12px; background: transparent; color: var(--hp-ink-faint); cursor: pointer;
  font: 600 10.5px/1 Cinzel, Georgia, serif; letter-spacing: .16em; text-transform: uppercase;
}
.modes button:hover { color: var(--hp-ink); }
.modes button[aria-pressed="true"] { background: color-mix(in srgb, var(--hp-accent) 14%, transparent); color: var(--hp-accent); }

.body { display: grid; grid-template-columns: minmax(0, 1fr); }
.frame[data-mode="split"] .body { grid-template-columns: minmax(0, 1fr) minmax(0, 1.35fr); }
.editor { display: none; flex-direction: column; min-width: 0; background: var(--hp-code); border-right: 1px solid var(--hp-line); }
.frame[data-mode="split"] .editor { display: flex; }
textarea {
  flex: 1; width: 100%; min-height: 420px; margin: 0; padding: 16px 18px; border: 0; outline: none; resize: none;
  background: transparent; color: var(--hp-ink);
  font: 13px/1.7 "JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace; font-variant-ligatures: none;
  tab-size: 2; white-space: pre; overflow: auto; caret-color: var(--hp-accent);
}
textarea::selection { background: color-mix(in srgb, var(--hp-accent) 28%, transparent); }
.status { padding: 8px 14px; border-top: 1px solid var(--hp-line); font-size: 14px; color: var(--hp-ink-soft); }
.status ul { margin: 0; padding-left: 1.1em; }

@container (max-width: 760px) {
  .frame[data-mode="split"] .body { grid-template-columns: minmax(0, 1fr); }
  .editor { border-right: 0; border-bottom: 1px solid var(--hp-line); }
  textarea { min-height: 260px; }
}

.player { display: flex; flex-direction: column; min-width: 0; }
.stage { position: relative; flex: 1; display: flex; align-items: center; justify-content: safe center; min-height: 200px; padding: 28px 22px; overflow-x: auto; }
.svg-host { min-width: min-content; display: flex; justify-content: safe center; width: 100%; }
.svg-host svg { max-width: 100%; height: auto; max-height: var(--harpy-max-height, 80vh); }
.placeholder { color: var(--hp-ink-faint); font-style: italic; }
.error {
  position: absolute; left: 14px; right: 14px; bottom: 14px; max-height: 45%; overflow: auto; margin: 0;
  padding: 10px 12px; border-left: 2px solid var(--hp-error); background: var(--hp-error-bg); color: var(--hp-error);
  font: 12.5px/1.5 "JetBrains Mono", ui-monospace, monospace; white-space: pre-wrap;
}

.narration { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 14px 28px; align-items: end; padding: 20px 22px 22px; border-top: 1px solid var(--hp-line); }
.counter { grid-column: 1 / -1; display: flex; align-items: center; gap: 14px; margin: 0; font: 600 10.5px/1 Cinzel, Georgia, serif; letter-spacing: .24em; text-transform: uppercase; color: var(--hp-ink-faint); }
.counter b { color: var(--hp-accent); font-weight: 600; }
.counter::after { content: ""; flex: 1; height: 1px; background: linear-gradient(90deg, var(--hp-line), transparent); }
.text { min-height: 84px; }
.text.enter { animation: rise .45s ease both; }
.step-title { margin: 0 0 4px; font: 600 25px/1.2 "Cormorant Garamond", Garamond, serif; color: var(--hp-ink-bright); }
.description { color: var(--hp-ink-soft); max-width: 68ch; }
.description > :first-child { margin-top: 0; }
.description > :last-child { margin-bottom: 0; }
.description a { color: var(--hp-accent); }
.description strong { color: var(--hp-ink); font-weight: 500; }
.description code { padding: .05em .35em; border-radius: 3px; background: var(--hp-code); font: 500 .8em "JetBrains Mono", ui-monospace, monospace; color: var(--hp-bronze); }
.description pre { padding: 10px 12px; border-radius: 4px; background: var(--hp-code); overflow: auto; }
.description pre code { padding: 0; background: none; }
.description blockquote { margin: 0; padding-left: 12px; border-left: 2px solid var(--hp-frame); }

.controls { display: flex; align-items: center; gap: 8px; }
.round {
  display: grid; place-items: center; width: 38px; height: 38px; padding: 0; flex-shrink: 0;
  border: 1px solid var(--hp-frame); border-radius: 50%; background: transparent; color: var(--hp-ink); cursor: pointer;
  transition: border-color .25s, color .25s, box-shadow .25s;
}
.round:hover:not(:disabled) { border-color: var(--hp-accent); color: var(--hp-accent); box-shadow: 0 0 16px -6px var(--hp-accent); }
.round:disabled { opacity: .35; cursor: default; }
.round svg { width: 15px; height: 15px; }
.play .i-pause { display: none; }
.play[aria-pressed="true"] { border-color: var(--hp-accent); color: var(--hp-accent); }
.play[aria-pressed="true"] .i-play { display: none; }
.play[aria-pressed="true"] .i-pause { display: block; }
.pips { display: flex; flex-wrap: wrap; align-items: center; justify-content: center; padding: 0 4px; }
.pip { display: grid; place-items: center; width: 20px; height: 26px; padding: 0; border: 0; background: none; cursor: pointer; }
.pip::before { content: ""; width: 7px; height: 7px; transform: rotate(45deg); border: 1px solid var(--hp-bronze); transition: background .3s, box-shadow .3s, border-color .3s; }
.pip.summary::before { transform: none; border-radius: 50%; width: 8px; height: 8px; }
.pip.done::before { background: var(--hp-bronze); }
.pip[aria-current="step"]::before { background: var(--hp-accent); border-color: var(--hp-accent); box-shadow: 0 0 9px var(--hp-accent); }
.modes button:focus-visible, .round:focus-visible, .pip:focus-visible { outline: 1px solid var(--hp-accent); outline-offset: 2px; }

@container (max-width: 560px) {
  .narration { grid-template-columns: minmax(0, 1fr); padding: 18px 16px 18px; }
  .controls { justify-content: space-between; }
  .stage { padding: 20px 14px; justify-content: flex-start; }
}
@keyframes rise { from { opacity: 0; transform: translateY(5px); } to { opacity: 1; transform: none; } }
@media (prefers-reduced-motion: reduce) { .text.enter { animation: none; } .pip::before, .round { transition: none; } }

${DIAGRAM_CSS}
`;

const icon = (d, cls = '') => `<svg class="${cls}" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${d}"/></svg>`;

const MARKUP = `
<div class="frame" part="frame">
  <header class="bar" part="bar">
    <div class="heading" hidden><h2 class="title" hidden></h2><div class="intro" hidden></div></div>
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
        <div class="placeholder">Drawing…</div>
        <pre class="error" role="alert" hidden></pre>
      </div>
      <div class="narration" hidden>
        <p class="counter" aria-hidden="true"></p>
        <div class="text" aria-live="polite"><h3 class="step-title"></h3><div class="description"></div></div>
        <nav class="controls" aria-label="Steps" hidden>
          <button type="button" class="round prev" aria-label="Previous step">${icon('M10 3.5 5.5 8l4.5 4.5')}</button>
          <div class="pips"></div>
          <button type="button" class="round next" aria-label="Next step">${icon('M6 3.5 10.5 8 6 12.5')}</button>
          <button type="button" class="round play" aria-label="Play steps automatically" aria-pressed="false">${icon('M5 3.5v9l7-4.5z', 'i-play')}${icon('M5.5 4v8M10.5 4v8', 'i-pause')}</button>
        </nav>
      </div>
    </section>
  </div>
</div>`;

let template;
let instances = 0;

const errorMessage = (e) => String(e?.message ?? e).replace(/^Error:\s*/, '');

export class HarpyDiagram extends HTMLElement {
  static observedAttributes = ['mode', 'theme', 'src', 'no-dim'];

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
      frame: $('.frame'), heading: $('.heading'), title: $('.title'), intro: $('.intro'), modes: $('.modes'),
      textarea: $('textarea'), status: $('.status'), stage: $('.stage'), svgHost: $('.svg-host'),
      placeholder: $('.placeholder'), error: $('.error'), narration: $('.narration'), counter: $('.counter'),
      text: $('.text'), stepTitle: $('.step-title'), description: $('.description'),
      controls: $('.controls'), pips: $('.pips'), prev: $('.prev'), next: $('.next'), play: $('.play'),
    };
    this._uid = ++instances;
    this._source = null;
    this._steps = [];
    this._index = 0;
    this._player = null;
    this._token = 0;
    this._timer = null;
    this._autoplay = null;
    this._srcToken = 0;

    this._el.modes.addEventListener('click', (e) => {
      const mode = e.target.closest('button')?.dataset.mode;
      if (mode) this.mode = mode;
    });
    this._el.prev.addEventListener('click', () => this.prev());
    this._el.next.addEventListener('click', () => this.next());
    this._el.play.addEventListener('click', () => (this._autoplay ? this._stopAutoplay() : this._startAutoplay()));
    this._el.pips.addEventListener('click', (e) => {
      const pip = e.target.closest('.pip');
      if (pip) this.goTo(Number(pip.dataset.index));
    });
    this._el.textarea.addEventListener('input', () => {
      this._source = this._el.textarea.value;
      this.dispatchEvent(new CustomEvent('harpy-change', { detail: { source: this._source }, bubbles: true }));
      this._scheduleRender(250);
    });
    this._el.textarea.addEventListener('keydown', (e) => {
      if (e.key === 'Tab' && !e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        this._el.textarea.setRangeText('  ', this._el.textarea.selectionStart, this._el.textarea.selectionEnd, 'end');
        this._el.textarea.dispatchEvent(new Event('input'));
      }
    });
    this.addEventListener('keydown', (e) => this._onKey(e));
  }

  connectedCallback() {
    if (!this.hasAttribute('tabindex')) this.tabIndex = 0;
    this._syncMode();
    if (this._source === null) this._loadSource();
  }

  disconnectedCallback() {
    this._stopAutoplay();
  }

  attributeChangedCallback(name, oldValue, value) {
    if (oldValue === value) return;
    if (name === 'mode') this._syncMode();
    else if (name === 'src') {
      if (this.isConnected) this._loadSource();
    } else if (name === 'no-dim' && this._source !== null) this._scheduleRender(0);
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
  goTo(target, { fromAutoplay = false } = {}) {
    if (!fromAutoplay) this._stopAutoplay();
    const index = typeof target === 'string' ? this._steps.findIndex((s) => s.id === target) : target;
    if (index < 0 || index >= this._steps.length) return;
    if (index === this._index && this._player?.index === index) return;
    this._go(index, { animate: true });
  }

  _startAutoplay() {
    if (this._steps.length < 2) return;
    if (this._index >= this._steps.length - 1) this.goTo(0, { fromAutoplay: true });
    this._el.play.setAttribute('aria-pressed', 'true');
    this._autoplay = setInterval(() => {
      if (this._index >= this._steps.length - 1) this._stopAutoplay();
      else this.goTo(this._index + 1, { fromAutoplay: true });
    }, AUTOPLAY_MS);
  }

  _stopAutoplay() {
    clearInterval(this._autoplay);
    this._autoplay = null;
    this._el.play.setAttribute('aria-pressed', 'false');
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
      const model = parseDiagram(doc.diagram);
      const warnings = [...doc.warnings, ...model.warnings];
      const stepUnits = assignSteps(model, doc.steps);
      const names = aliases(model);
      const plan = doc.steps.map((s, i) => ({
        units: stepUnits[i],
        focus: s.focus ? resolveRefs(s.focus, names, warnings, `Step "${s.id}" focus`) : null,
        show: resolveRefs(s.show, names, warnings, `Step "${s.id}" show`),
        hide: resolveRefs(s.hide, names, warnings, `Step "${s.id}" hide`),
      }));
      const texts = [doc.intro, ...doc.steps.map((s) => doc.descriptions.get(s.id) ?? ''), doc.summary?.body ?? ''];
      const [dagre, html] = await Promise.all([
        model.kind === 'flowchart' ? loadDagre() : null,
        renderMarkdownAll(texts),
        loadFonts(),
      ]);
      if (token !== this._token) return;

      const measure = createMeasurer();
      const layout = model.kind === 'flowchart' ? layoutFlowchart(model, { dagre, measure }) : layoutSequence(model, { measure });
      const { svg, units } = renderDiagram(layout, { id: `hd${this._uid}-${token}` });
      svg.setAttribute('aria-label', doc.title ?? (model.kind === 'flowchart' ? 'Flowchart' : 'Sequence diagram'));
      svg.style.minWidth = `${Math.round(layout.width * MIN_DIAGRAM_SCALE)}px`;

      const [introHtml, ...stepHtml] = html;
      const summaryHtml = stepHtml.pop();
      this._el.title.textContent = doc.title ?? '';
      this._el.title.hidden = !doc.title;
      this._el.intro.innerHTML = introHtml;
      this._el.intro.hidden = !introHtml;
      this._el.heading.hidden = !doc.title && !introHtml;

      this._el.svgHost.replaceChildren(svg);
      this._el.placeholder.hidden = true;
      const firstRender = !this._player;
      this._player = new Player(units, plan, { dim: !this.hasAttribute('no-dim') });

      const previousId = this._steps[this._index]?.id;
      this._steps = doc.steps.map((s, i) => ({ id: s.id, title: s.title ?? s.id, heading: s.title ?? s.id, html: stepHtml[i], summary: false }));
      if (doc.steps.length || doc.summary) {
        this._steps.push({ id: 'summary', title: doc.summary?.title ?? 'Summary', heading: doc.summary?.title ?? (doc.steps.length ? 'The whole picture' : ''), html: summaryHtml, summary: true });
      }
      let index = this._steps.findIndex((s) => s.id === previousId);
      if (index < 0) index = Math.min(this._index, Math.max(this._steps.length - 1, 0));

      this._renderPips();
      this._setWarnings(warnings);
      this._showError(null);
      if (firstRender && doc.steps.length) this._revealWhenVisible(index);
      else this._go(index, { animate: false });
    } catch (e) {
      if (token === this._token) this._showError(errorMessage(e));
    }
  }

  /** Shows the narration right away and plays the first step in once the diagram is on screen. */
  _revealWhenVisible(index) {
    this._go(index, { animate: false, silent: true });
    const play = () => {
      if (this._player.index === -1) this._go(index, { animate: true });
    };
    if (!('IntersectionObserver' in window)) return play();
    const io = new IntersectionObserver((entries) => {
      if (!entries.some((e) => e.isIntersecting)) return;
      io.disconnect();
      play();
    }, { threshold: 0.3 });
    io.observe(this._el.stage);
  }

  _renderPips() {
    const pips = this._steps.map((s, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = s.summary ? 'pip summary' : 'pip';
      b.dataset.index = String(i);
      b.title = s.summary ? s.title : `${roman(i + 1)}. ${s.title}`;
      b.setAttribute('aria-label', s.summary ? 'Summary' : `Step ${i + 1}: ${s.title}`);
      return b;
    });
    this._el.pips.replaceChildren(...pips);
  }

  /** Updates the narration and controls; `silent` skips the diagram and the event. */
  _go(index, { animate, silent = false }) {
    const hasSteps = this._steps.length > 0;
    this._el.narration.hidden = !hasSteps;
    this._el.controls.hidden = this._steps.length < 2;
    if (!this._player) return;
    if (!hasSteps) {
      this._player.go(0, { animate: false });
      this._index = 0;
      return;
    }
    if (!silent) this._player.go(index, { animate });
    this._index = index;
    const step = this._steps[index];
    const count = this._steps.length - (this._steps.at(-1).summary ? 1 : 0);
    this._el.counter.innerHTML = step.summary ? '<b>Summary</b>' : `Step <b>${roman(index + 1)}</b> of ${roman(count)}`;
    this._el.stepTitle.textContent = step.heading;
    this._el.stepTitle.hidden = !step.heading;
    this._el.description.innerHTML = step.html;
    this._el.description.hidden = !step.html;
    if (animate) {
      this._el.text.classList.remove('enter');
      void this._el.text.offsetWidth;
      this._el.text.classList.add('enter');
    }
    this._el.prev.disabled = index === 0;
    this._el.next.disabled = index === this._steps.length - 1;
    for (const pip of this._el.pips.children) {
      const i = Number(pip.dataset.index);
      pip.classList.toggle('done', i < index);
      if (i === index) pip.setAttribute('aria-current', 'step');
      else pip.removeAttribute('aria-current');
    }
    if (!silent) this.dispatchEvent(new CustomEvent('harpy-step', { detail: { index, id: step.id, summary: step.summary }, bubbles: true }));
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
    if (message && !this._el.svgHost.firstChild) this._el.placeholder.hidden = true;
  }
}
