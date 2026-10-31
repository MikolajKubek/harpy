// Bridges Harpy steps and Mermaid.
//
// 1. analyze(): parses the diagram prefix that is visible at each step with Mermaid's own
//    parser and diffs the results, so we know which elements each step introduces.
// 2. render(): renders the *full* diagram once, so the layout never moves between steps.
// 3. bind(): finds the SVG elements that belong to each element ("unit") in the rendered SVG.
//
// Units are strings such as "node:A", "edge:L_A_B_0", "cluster:S1", "actor:Alice", "msg:3".

import { diagramPrefix } from './source.js';

const config = {
  mermaidUrl: 'https://cdn.jsdelivr.net/npm/mermaid@12.2.0/dist/mermaid.esm.min.mjs',
  mermaid: null, // a preloaded mermaid instance, used instead of mermaidUrl when set
  mermaidConfig: {}, // extra options for mermaid.initialize()
};

let mermaidPromise = null;

/** Overrides where/how Mermaid is loaded. Call before the first diagram renders. */
export function configureMermaid(options = {}) {
  for (const key of Object.keys(config)) if (key in options) config[key] = options[key];
  mermaidPromise = null;
}

export function loadMermaid() {
  if (!mermaidPromise) {
    mermaidPromise = (async () => {
      const mermaid = config.mermaid ?? (await import(config.mermaidUrl)).default;
      mermaid.initialize({ startOnLoad: false, suppressErrorRendering: true, ...config.mermaidConfig });
      return mermaid;
    })();
    mermaidPromise.catch(() => (mermaidPromise = null));
  }
  return mermaidPromise;
}

// Mermaid keeps diagram state in module-level singletons, so parse and render calls from
// several components must never interleave.
let queue = Promise.resolve();
function exclusive(fn) {
  const run = queue.then(fn, fn);
  queue = run.catch(() => {});
  return run;
}

// Sequence diagram line types (mermaid's LINETYPE enum).
const SEQ_BLOCK_START = new Set([10, 12, 15, 19, 22, 27, 30, 32]); // loop alt opt par rect critical break par_over
const SEQ_BLOCK_END = new Set([11, 14, 16, 21, 23, 29, 31]);
const SEQ_IGNORED = new Set([13, 17, 18, 20, 26, 28]); // else, activate, deactivate, and, autonumber, option

function keys(mapOrObject) {
  if (!mapOrObject) return [];
  return mapOrObject instanceof Map ? [...mapOrObject.keys()] : Object.keys(mapOrObject);
}

function kindOf(type) {
  if (/^flowchart|^graph/.test(type)) return 'flowchart';
  if (type === 'sequence') return 'sequence';
  return null;
}

/** Ordered units plus alias names from a parsed flowchart db. */
function flowchartInfo(db) {
  const order = new Set();
  const aliases = new Map();
  for (const sg of db.getSubGraphs?.() ?? []) {
    order.add(`cluster:${sg.id}`);
    aliases.set(sg.id, `cluster:${sg.id}`);
  }
  // Edge-driven order (source node, edge, target node) makes a step "flow" when it animates in.
  for (const e of db.getEdges?.() ?? []) {
    order.add(`node:${e.start}`).add(`edge:${e.id}`).add(`node:${e.end}`);
    aliases.set(e.id, `edge:${e.id}`);
    const arrow = `${e.start}-->${e.end}`;
    if (!aliases.has(arrow)) aliases.set(arrow, `edge:${e.id}`);
  }
  for (const v of keys(db.getVertices?.())) {
    order.add(`node:${v}`);
    aliases.set(v, `node:${v}`);
  }
  return { order: [...order], aliases, meta: {} };
}

/** Ordered units plus alias names from a parsed sequence db. */
function sequenceInfo(db) {
  const order = new Set();
  const aliases = new Map();
  const actors = keys(db.getActors?.());
  for (const a of actors) {
    order.add(`actor:${a}`);
    aliases.set(a, `actor:${a}`);
  }
  const blockEnds = new Map(); // start message id -> end message id (the SVG uses the end's id)
  const open = [];
  for (const m of db.getMessages?.() ?? []) {
    if (SEQ_BLOCK_START.has(m.type)) {
      open.push(m.id);
      order.add(`block:${m.id}`);
    } else if (SEQ_BLOCK_END.has(m.type)) {
      const start = open.pop();
      if (start !== undefined) blockEnds.set(start, m.id);
    } else if (!SEQ_IGNORED.has(m.type)) {
      order.add(`msg:${m.id}`);
    }
  }
  return { order: [...order], aliases, meta: { actors, blockEnds } };
}

function extract(kind, db) {
  return kind === 'flowchart' ? flowchartInfo(db) : sequenceInfo(db);
}

function hasContent(text) {
  return text.split('\n').some((l) => l.trim() && !l.trim().startsWith('%%'));
}

/** Parses a diagram prefix, closing any open subgraph / loop blocks so it is valid on its own. */
async function parsePrefix(mermaid, prefix) {
  if (!hasContent(prefix)) return null;
  let text = prefix;
  let lastError;
  for (let i = 0; i <= 8; i++) {
    try {
      return await mermaid.mermaidAPI.getDiagramFromText(text);
    } catch (e) {
      lastError = e;
      text += '\nend';
    }
  }
  throw lastError;
}

/**
 * Works out which units each step introduces.
 * @returns {Promise<{ kind: string|null, type: string, stepUnits: string[][],
 *                     aliases: Map<string,string>, meta: object, warnings: string[] }>}
 */
export function analyze(diagram, steps) {
  return exclusive(async () => {
    const mermaid = await loadMermaid();
    const full = await mermaid.mermaidAPI.getDiagramFromText(diagram);
    const kind = kindOf(full.type);
    const warnings = [];
    if (!kind) {
      if (steps.length) warnings.push(`Step animation is not supported for "${full.type}" diagrams yet; the whole diagram is shown at every step.`);
      return { kind, type: full.type, stepUnits: steps.map(() => []), aliases: new Map(), meta: {}, warnings };
    }
    const fullInfo = extract(kind, full.db);
    const known = new Set(fullInfo.order);
    const seen = new Set();
    const stepUnits = [];
    for (let i = 0; i < steps.length; i++) {
      let order;
      if (i === steps.length - 1) {
        order = fullInfo.order;
      } else {
        try {
          const parsed = await parsePrefix(mermaid, diagramPrefix(diagram, steps, i));
          order = parsed ? extract(kind, parsed.db).order : [];
        } catch {
          warnings.push(`Could not parse the diagram up to step "${steps[i].id}"; its elements appear with the next step.`);
          order = [];
        }
      }
      const fresh = order.filter((u) => known.has(u) && !seen.has(u));
      fresh.forEach((u) => seen.add(u));
      stepUnits.push(fresh);
    }
    return { kind, type: full.type, stepUnits, aliases: fullInfo.aliases, meta: fullInfo.meta, warnings };
  });
}

/** Normalises a user reference like "A --> B" or "A->B" to the "A-->B" alias form. */
function normaliseRef(ref) {
  const compact = ref.replace(/\s+/g, '');
  return compact.replace(/(?:-\.+-|-{1,}|={1,})>|-{3,}/, '-->');
}

/** Resolves user references (node ids, edge ids, "A-->B", participant ids) to units. */
export function resolveRefs(refs, analysis, warnings, context) {
  const units = [];
  for (const ref of refs ?? []) {
    const unit = analysis.aliases.get(ref) ?? analysis.aliases.get(normaliseRef(ref));
    if (unit) units.push(unit);
    else warnings.push(`${context}: "${ref}" does not match any element.`);
  }
  return units;
}

/** Renders the full diagram. Resolves to the SVG markup. */
export function render(id, diagram, theme) {
  return exclusive(async () => {
    const mermaid = await loadMermaid();
    mermaid.initialize({ startOnLoad: false, suppressErrorRendering: true, theme, ...config.mermaidConfig });
    try {
      const { svg } = await mermaid.render(id, diagram);
      return svg;
    } finally {
      document.getElementById(`d${id}`)?.remove();
    }
  });
}

function cssString(value) {
  return `"${String(value).replace(/["\\]/g, '\\$&')}"`;
}

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Finds the SVG elements of every unit.
 * @returns {Map<string, { els: Element[], draw: SVGGeometryElement[] }>}
 *   `draw` lists the strokes (edges, message lines) that get a draw-in animation.
 */
export function bind(svg, analysis, renderId) {
  const bindings = new Map();
  const add = (unit, el, drawable = false) => {
    if (!el) return;
    let b = bindings.get(unit);
    if (!b) bindings.set(unit, (b = { els: [], draw: [] }));
    if (!b.els.includes(el)) b.els.push(el);
    if (drawable && !b.draw.includes(el)) b.draw.push(el);
  };

  if (analysis.kind === 'flowchart') {
    const nodeId = new RegExp(`^${escapeRegExp(renderId)}-flowchart-(.+)-\\d+$`);
    for (const g of svg.querySelectorAll('g.node')) {
      const m = g.id.match(nodeId);
      if (m) add(`node:${m[1]}`, g);
    }
    for (const path of svg.querySelectorAll('[data-edge="true"][data-id]')) {
      add(`edge:${path.dataset.id}`, path, true);
    }
    for (const label of svg.querySelectorAll('.edgeLabel > .label[data-id]')) {
      add(`edge:${label.dataset.id}`, label.parentElement);
    }
    const clusterPrefix = `${renderId}-`;
    for (const g of svg.querySelectorAll('g.cluster')) {
      if (g.id.startsWith(clusterPrefix)) add(`cluster:${g.id.slice(clusterPrefix.length)}`, g);
    }
  } else if (analysis.kind === 'sequence') {
    for (const actor of analysis.meta.actors) {
      for (const el of svg.querySelectorAll(`[name=${cssString(actor)}]`)) {
        const owner = el.closest('[data-et]') ?? (el.parentElement !== svg ? el.parentElement : el);
        add(`actor:${actor}`, owner);
      }
      for (const el of svg.querySelectorAll(`[data-et][data-id=${cssString(actor)}]`)) add(`actor:${actor}`, el);
    }
    for (const unit of analysis.stepUnits.flat()) {
      if (unit.startsWith('msg:')) {
        const id = unit.slice(4);
        const el = svg.querySelector(`[data-id=${cssString(`i${id}`)}]`);
        if (!el) continue;
        const isLine = el.dataset.et === 'message';
        add(unit, el, isLine);
        if (!isLine) continue;
        // The label texts precede the line; autonumber badges follow it.
        for (let s = el.previousElementSibling; s?.matches('text.messageText'); s = s.previousElementSibling) add(unit, s);
        for (let s = el.nextElementSibling; s?.matches('.sequenceNumber'); s = s.nextElementSibling) add(unit, s);
      } else if (unit.startsWith('block:')) {
        const end = analysis.meta.blockEnds.get(unit.slice(6));
        if (end !== undefined) add(unit, svg.querySelector(`[data-et="control-structure"][data-id=${cssString(`i${end}`)}]`));
      }
    }
  }
  return bindings;
}
