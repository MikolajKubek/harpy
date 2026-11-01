// Draws a laid-out diagram as SVG. Every element belongs to a "unit" (node:A, edge:e1, msg:msg-3...)
// so the player can reveal, dim and highlight it. Lines that draw themselves in get a mask whose
// stroke is animated, which works for dashed lines and arrowheads too.

const NS = 'http://www.w3.org/2000/svg';

function el(tag, attrs = {}, parent = null) {
  const node = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v !== null && v !== undefined && v !== false) node.setAttribute(k, v);
  if (parent) parent.append(node);
  return node;
}

/** Multi-line text centred on (cx, cy), or starting at cx when anchor is "start". */
function text(parent, block, cx, cy, className, anchor = 'middle') {
  const t = el('text', { class: className, x: cx, 'text-anchor': anchor }, parent);
  const n = block.lines.length;
  block.lines.forEach((line, i) => {
    const span = el('tspan', { x: cx, y: cy + (i - (n - 1) / 2) * block.font.lineHeight }, t);
    span.textContent = line;
  });
  return t;
}

/** An orthogonal polyline with rounded corners. */
export function roundedPath(points, radius = 8) {
  if (points.length < 2) return '';
  let d = `M${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length - 1; i++) {
    const p = points[i - 1];
    const c = points[i];
    const n = points[i + 1];
    const l1 = Math.hypot(c.x - p.x, c.y - p.y);
    const l2 = Math.hypot(n.x - c.x, n.y - c.y);
    const r = Math.min(radius, l1 / 2, l2 / 2);
    const a = { x: c.x - ((c.x - p.x) / l1) * r, y: c.y - ((c.y - p.y) / l1) * r };
    const b = { x: c.x + ((n.x - c.x) / l2) * r, y: c.y + ((n.y - c.y) / l2) * r };
    d += ` L${round(a.x)} ${round(a.y)} Q${c.x} ${c.y} ${round(b.x)} ${round(b.y)}`;
  }
  const last = points.at(-1);
  return `${d} L${last.x} ${last.y}`;
}

const round = (v) => Math.round(v * 100) / 100;

function defineMarkers(defs, id) {
  const marker = (name, w, refX, body) => {
    const m = el('marker', { id: `${id}-${name}`, viewBox: `0 0 ${w} 10`, refX, refY: 5, markerWidth: w, markerHeight: 10, markerUnits: 'userSpaceOnUse', orient: 'auto-start-reverse' }, defs);
    body(m);
  };
  const stroke = { fill: 'none', stroke: 'context-stroke', 'stroke-width': 1.5, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' };
  marker('arrow', 10, 9, (m) => el('path', { d: 'M1.5 1.5 9 5 1.5 8.5', ...stroke }, m));
  marker('open', 10, 9, (m) => el('path', { d: 'M1.5 1.5 9 5', ...stroke }, m));
  marker('cross', 10, 5, (m) => el('path', { d: 'M1.5 1.5 8.5 8.5 M8.5 1.5 1.5 8.5', ...stroke }, m));
  marker('circle', 10, 9, (m) => el('circle', { cx: 5, cy: 5, r: 3.6, fill: 'var(--hp-stage)', stroke: 'context-stroke', 'stroke-width': 1.4 }, m));
}

function styleAttr(style = {}) {
  const map = { fill: 'fill', stroke: 'stroke', 'stroke-width': 'stroke-width', 'stroke-dasharray': 'stroke-dasharray' };
  const parts = Object.entries(style).filter(([k]) => map[k]).map(([k, v]) => `${map[k]}:${v}`);
  return parts.length ? parts.join(';') : null;
}

const roleClass = (role) => `r-${role ?? 'bronze'}`;

class Builder {
  constructor(layout, id) {
    this.id = id;
    this.svg = el('svg', {
      class: `hd hd-${layout.kind}`, viewBox: `0 0 ${layout.width} ${layout.height}`,
      width: layout.width, height: layout.height, role: 'img', xmlns: NS,
    });
    this.defs = el('defs', {}, this.svg);
    defineMarkers(this.defs, id);
    this.units = new Map();
    this.layout = layout;
    this.masks = 0;
  }
  layer(name) {
    return el('g', { class: `hd-layer hd-${name}` }, this.svg);
  }
  /** A group belonging to `unit`, appended to `parent`. */
  unit(unit, parent, className = '', role = null) {
    const g = el('g', { class: `hd-unit ${className} ${role ? roleClass(role) : ''}`.trim(), 'data-unit': unit }, parent);
    let u = this.units.get(unit);
    if (!u) this.units.set(unit, (u = { els: [], draw: [] }));
    u.els.push(g);
    return g;
  }
  /** Registers a path to be drawn in by the player. */
  drawable(unit, path) {
    const mask = el('mask', { id: `${this.id}-m${++this.masks}`, maskUnits: 'userSpaceOnUse', x: -20, y: -20, width: this.layout.width + 40, height: this.layout.height + 40 }, this.defs);
    const stroke = el('path', { d: path.getAttribute('d'), pathLength: 1, class: 'hd-mask' }, mask);
    path.setAttribute('mask', `url(#${mask.id})`);
    this.units.get(unit).draw.push(stroke);
  }
  marker(name) {
    return name && name !== 'none' ? `url(#${this.id}-${name})` : null;
  }
}

// ---------------------------------------------------------------- flowchart

function drawShape(g, n) {
  const l = n.x - n.w / 2;
  const t = n.y - n.h / 2;
  const r = l + n.w;
  const b = t + n.h;
  const style = styleAttr(n.style);
  const attrs = { class: 'hd-shape', style };
  const poly = (pts) => el('polygon', { ...attrs, points: pts.map((p) => p.join(',')).join(' ') }, g);
  let textDy = 0;
  switch (n.shape) {
    case 'circle':
      el('circle', { ...attrs, cx: n.x, cy: n.y, r: n.w / 2 }, g);
      break;
    case 'doublecircle':
      el('circle', { ...attrs, cx: n.x, cy: n.y, r: n.w / 2 }, g);
      el('circle', { ...attrs, class: 'hd-shape hd-inner', cx: n.x, cy: n.y, r: n.w / 2 - 5 }, g);
      break;
    case 'diamond':
      poly([[n.x, t], [r, n.y], [n.x, b], [l, n.y]]);
      break;
    case 'hexagon': {
      const s = Math.min(18, n.h / 2);
      poly([[l + s, t], [r - s, t], [r, n.y], [r - s, b], [l + s, b], [l, n.y]]);
      break;
    }
    case 'lean-right':
      poly([[l + 14, t], [r, t], [r - 14, b], [l, b]]);
      break;
    case 'lean-left':
      poly([[l, t], [r - 14, t], [r, b], [l + 14, b]]);
      break;
    case 'trapezoid':
      poly([[l + 14, t], [r - 14, t], [r, b], [l, b]]);
      break;
    case 'trapezoid-alt':
      poly([[l, t], [r, t], [r - 14, b], [l + 14, b]]);
      break;
    case 'asymmetric':
      poly([[l, t], [r, t], [r, b], [l, b], [l + 14, n.y]]);
      break;
    case 'cylinder': {
      const ry = Math.min(9, n.h / 6);
      const rx = n.w / 2;
      el('path', { ...attrs, d: `M${l} ${t + ry} A${rx} ${ry} 0 0 1 ${r} ${t + ry} V${b - ry} A${rx} ${ry} 0 0 1 ${l} ${b - ry} Z` }, g);
      el('path', { class: 'hd-shape hd-inner', style, d: `M${l} ${t + ry} A${rx} ${ry} 0 0 0 ${r} ${t + ry}`, fill: 'none' }, g);
      textDy = ry / 2;
      break;
    }
    case 'subroutine':
      el('rect', { ...attrs, x: l, y: t, width: n.w, height: n.h, rx: 3 }, g);
      el('path', { class: 'hd-shape hd-inner', style, d: `M${l + 8} ${t}V${b}M${r - 8} ${t}V${b}`, fill: 'none' }, g);
      break;
    case 'stadium':
      el('rect', { ...attrs, x: l, y: t, width: n.w, height: n.h, rx: n.h / 2 }, g);
      break;
    case 'rounded':
      el('rect', { ...attrs, x: l, y: t, width: n.w, height: n.h, rx: 12 }, g);
      break;
    default:
      el('rect', { ...attrs, x: l, y: t, width: n.w, height: n.h, rx: 4 }, g);
  }
  const label = text(g, n.text, n.x, n.y + textDy, 'hd-label');
  if (n.style?.color) label.setAttribute('style', `fill:${n.style.color}`);
}

function renderFlowchart(b) {
  const { layout } = b;
  const groupLayer = b.layer('groups');
  const edgeLayer = b.layer('edges');
  const nodeLayer = b.layer('nodes');
  const chipLayer = b.layer('chips');

  for (const grp of layout.groups) {
    const unit = `group:${grp.id}`;
    const g = b.unit(unit, groupLayer, 'hd-group', grp.role);
    el('rect', { class: 'hd-group-frame', x: grp.x, y: grp.y, width: grp.w, height: grp.h, rx: 8, style: styleAttr(grp.style) }, g);
    if (grp.title.lines.join('')) {
      const chip = b.unit(unit, chipLayer, 'hd-group', grp.role);
      const w = grp.title.width + 22;
      el('rect', { class: 'hd-chip', x: grp.x + 14, y: grp.y - 10, width: w, height: 20, rx: 10 }, chip);
      text(chip, grp.title, grp.x + 14 + w / 2, grp.y, 'hd-caps');
    }
  }
  for (const e of layout.edges) {
    const unit = `edge:${e.id}`;
    const g = b.unit(unit, edgeLayer, 'hd-edge-unit', e.role);
    const path = el('path', {
      class: `hd-edge hd-${e.type}`, d: roundedPath(e.points, 9),
      'marker-end': b.marker(e.endHead === 'arrow' ? 'arrow' : e.endHead),
      'marker-start': b.marker(e.startHead === 'arrow' ? 'arrow' : e.startHead),
    }, g);
    b.drawable(unit, path);
    if (e.label) {
      el('rect', { class: 'hd-label-chip', x: e.label.x - e.label.w / 2, y: e.label.y - e.label.h / 2, width: e.label.w, height: e.label.h, rx: 4 }, g);
      text(g, e.label.text, e.label.x, e.label.y, 'hd-small');
    }
  }
  for (const n of layout.nodes) drawShape(b.unit(`node:${n.id}`, nodeLayer, `hd-node hd-${n.shape}`, n.role), n);
}

// ---------------------------------------------------------------- sequence

function drawActor(g, a) {
  const l = a.x - a.w / 2;
  const t = a.y;
  if (a.type === 'actor') {
    const cx = a.x;
    el('circle', { class: 'hd-shape', cx, cy: t + 7, r: 6 }, g);
    el('path', { class: 'hd-figure', d: `M${cx} ${t + 13}V${t + 25}M${cx - 9} ${t + 17}H${cx + 9}M${cx} ${t + 25}L${cx - 7} ${t + 34}M${cx} ${t + 25}L${cx + 7} ${t + 34}`, fill: 'none' }, g);
    text(g, a.text, a.x, t + 34 + (a.h - 34) / 2, 'hd-label');
    return;
  }
  if (a.type === 'database') {
    const ry = 7;
    const r = l + a.w;
    const b = t + a.h;
    el('path', { class: 'hd-shape', d: `M${l} ${t + ry} A${a.w / 2} ${ry} 0 0 1 ${r} ${t + ry} V${b - ry} A${a.w / 2} ${ry} 0 0 1 ${l} ${b - ry} Z` }, g);
    el('path', { class: 'hd-shape hd-inner', d: `M${l} ${t + ry} A${a.w / 2} ${ry} 0 0 0 ${r} ${t + ry}`, fill: 'none' }, g);
    text(g, a.text, a.x, t + a.h / 2 + ry / 2, 'hd-label');
    return;
  }
  if (a.type === 'collections') {
    el('rect', { class: 'hd-shape', x: l + 5, y: t - 5, width: a.w, height: a.h, rx: 4 }, g);
  }
  el('rect', { class: 'hd-shape', x: l, y: t, width: a.w, height: a.h, rx: 4 }, g);
  text(g, a.text, a.x, t + a.h / 2, 'hd-label');
}

function renderSequence(b) {
  const { layout } = b;
  const boxLayer = b.layer('boxes');
  const blockLayer = b.layer('blocks');
  const lifeLayer = b.layer('lifelines');
  const actLayer = b.layer('activations');
  const msgLayer = b.layer('messages');
  const noteLayer = b.layer('notes');
  const headLayer = b.layer('heads');

  for (const box of layout.boxes) {
    const g = b.unit(box.unit, boxLayer, 'hd-box', box.role);
    if (box.color) g.setAttribute('style', `--r:${box.color};--rb:${box.color}`);
    el('rect', { class: 'hd-box-frame', x: box.x, y: box.y, width: box.w, height: box.h, rx: 8 }, g);
    if (box.label.lines.join('')) text(g, box.label, box.x + 14, box.y + 16, 'hd-caps', 'start');
  }
  for (const blk of layout.blocks) {
    const g = b.unit(blk.unit, blockLayer, `hd-block hd-block-${blk.type}`, blk.role);
    if (blk.type === 'rect') {
      const r = el('rect', { class: 'hd-rect-fill', x: blk.x, y: blk.y, width: blk.w, height: blk.h, rx: 6 }, g);
      if (!blk.role && blk.color) r.setAttribute('style', `fill:${blk.color}`);
      continue;
    }
    el('rect', { class: 'hd-frame', x: blk.x, y: blk.y, width: blk.w, height: blk.h, rx: 4 }, g);
    const tag = { lines: [blk.type.toUpperCase()], font: { lineHeight: 14 } };
    const tagW = blk.type.length * 9 + 22;
    el('path', { class: 'hd-tag', d: `M${blk.x} ${blk.y + 4}Q${blk.x} ${blk.y} ${blk.x + 4} ${blk.y}H${blk.x + tagW}V${blk.y + 15}L${blk.x + tagW - 7} ${blk.y + 22}H${blk.x}Z` }, g);
    text(g, tag, blk.x + 9, blk.y + 11, 'hd-caps hd-tag-text', 'start');
    if (blk.label.lines.join('')) text(g, blk.label, blk.x + tagW + 10, blk.y + 11, 'hd-small hd-cond', 'start');
    for (const br of blk.branches) {
      el('path', { class: 'hd-divider', d: `M${blk.x} ${br.y}H${blk.x + blk.w}` }, g);
      if (br.label.lines.join('')) text(g, br.label, blk.x + 12, br.y + 13, 'hd-small hd-cond', 'start');
    }
  }
  for (const a of layout.actors) {
    const g = b.unit(a.unit, lifeLayer, 'hd-actor', a.role);
    el('path', { class: 'hd-lifeline', d: `M${a.x} ${a.y + a.h}V${layout.lifelineEnd}` }, g);
    drawActor(b.unit(a.unit, headLayer, 'hd-actor', a.role), a);
  }
  for (const act of layout.activations) {
    const g = b.unit(act.unit, actLayer, 'hd-activation', act.role);
    el('rect', { class: 'hd-act', x: act.x, y: act.y, width: act.w, height: act.h, rx: 2 }, g);
  }
  for (const m of layout.messages) {
    const g = b.unit(m.unit, msgLayer, 'hd-message', m.role);
    const d = m.self
      ? roundedPath([{ x: m.x1, y: m.y }, { x: m.x1 + m.loopW, y: m.y }, { x: m.x1 + m.loopW, y: m.y + m.h }, { x: m.x1 + 2, y: m.y + m.h }], 7)
      : `M${m.x1} ${m.y}H${m.x2}`;
    const head = m.head === 'arrow' ? 'arrow' : m.head === 'open' ? 'open' : m.head === 'cross' ? 'cross' : null;
    const path = el('path', { class: `hd-edge hd-msg ${m.dotted ? 'hd-dotted' : 'hd-solid'}`, d, 'marker-end': b.marker(head), 'marker-start': m.both ? b.marker('arrow') : null }, g);
    b.drawable(m.unit, path);
    if (m.self) text(g, m.label, m.labelX, m.labelY, 'hd-msg-label', 'start');
    else text(g, m.label, m.labelX, m.labelY + m.label.height / 2, 'hd-msg-label');
    if (m.number !== null && m.number !== undefined) {
      el('circle', { class: 'hd-badge', cx: m.x1, cy: m.y, r: 9 }, g);
      const t = el('text', { class: 'hd-badge-text', x: m.x1, y: m.y }, g);
      t.textContent = String(m.number);
    }
  }
  for (const nt of layout.notes) {
    const g = b.unit(nt.unit, noteLayer, 'hd-note');
    el('rect', { class: 'hd-note-box', x: nt.x, y: nt.y, width: nt.w, height: nt.h, rx: 3 }, g);
    el('path', { class: 'hd-note-accent', d: `M${nt.x + 1.5} ${nt.y + 4}V${nt.y + nt.h - 4}` }, g);
    text(g, nt.label, nt.x + nt.w / 2, nt.y + nt.h / 2, 'hd-small hd-note-text');
  }
}

/**
 * @returns {{ svg: SVGSVGElement, units: Map<string, { els: Element[], draw: SVGPathElement[] }> }}
 */
export function renderDiagram(layout, { id = 'hd' } = {}) {
  const b = new Builder(layout, id);
  if (layout.kind === 'flowchart') renderFlowchart(b);
  else renderSequence(b);
  return { svg: b.svg, units: b.units };
}
