// Flowchart layout: dagre places nodes and subgraphs; edges are re-routed orthogonally so they
// read like a circuit (right angles, bends in the gaps between ranks).

import { FONTS, layoutText } from './text.js';

const NODE_MAX_TEXT = 220;
const PAD = 12; // outer margin around the drawing

/** Node box size for a shape around a text block of tw x th. */
function nodeSize(shape, tw, th) {
  switch (shape) {
    case 'circle': {
      const d = Math.max(tw, th) + 34;
      return [d, d];
    }
    case 'doublecircle': {
      const d = Math.max(tw, th) + 46;
      return [d, d];
    }
    case 'diamond':
      return [Math.max(96, tw * 0.78 * 2 + 28), Math.max(64, th * 3 + 12)];
    case 'hexagon':
      return [tw + 64, Math.max(44, th + 24)];
    case 'cylinder':
      return [Math.max(84, tw + 40), Math.max(56, th + 40)];
    case 'stadium':
      return [Math.max(84, tw + 50), Math.max(44, th + 22)];
    case 'subroutine':
      return [Math.max(84, tw + 56), Math.max(44, th + 22)];
    case 'lean-right':
    case 'lean-left':
    case 'trapezoid':
    case 'trapezoid-alt':
      return [Math.max(96, tw + 64), Math.max(44, th + 22)];
    case 'asymmetric':
      return [Math.max(84, tw + 52), Math.max(44, th + 22)];
    default:
      return [Math.max(84, tw + 40), Math.max(44, th + 22)];
  }
}

/**
 * @param model parsed flowchart
 * @param {{ dagre: object, measure: Function }} deps
 */
export function layoutFlowchart(model, { dagre, measure }) {
  const main = model.direction === 'LR' || model.direction === 'RL' ? 'x' : 'y';
  const g = new dagre.graphlib.Graph({ compound: true, multigraph: true });
  g.setGraph({ rankdir: model.direction, nodesep: 44, ranksep: 54, edgesep: 22, marginx: 0, marginy: 0 });
  g.setDefaultEdgeLabel(() => ({}));

  const nodes = new Map();
  for (const n of model.nodes.values()) {
    const text = layoutText(n.label, measure, FONTS.label, NODE_MAX_TEXT);
    const [w, h] = nodeSize(n.shape, text.width, text.height);
    nodes.set(n.id, { id: n.id, shape: n.shape, role: n.role, style: n.style, text, w, h, x: 0, y: 0 });
    g.setNode(`n:${n.id}`, { width: w, height: h });
  }
  for (const grp of model.groups.values()) g.setNode(`g:${grp.id}`, {});
  for (const grp of model.groups.values()) if (grp.parent) g.setParent(`g:${grp.id}`, `g:${grp.parent}`);
  for (const n of model.nodes.values()) if (n.group) g.setParent(`n:${n.id}`, `g:${n.group}`);

  const labels = new Map();
  for (const e of model.edges) {
    const opts = { minlen: e.length };
    if (e.label) {
      const text = layoutText(e.label, measure, FONTS.small, 180);
      labels.set(e.id, text);
      Object.assign(opts, { width: text.width + 18, height: text.height + 8, labelpos: 'c' });
    }
    g.setEdge(`n:${e.from}`, `n:${e.to}`, opts, e.id);
  }

  dagre.layout(g);

  for (const n of nodes.values()) Object.assign(n, { x: g.node(`n:${n.id}`).x, y: g.node(`n:${n.id}`).y });

  // Rank bands: the main-axis extent of each rank, so edge bends can sit in the gaps between them.
  const bands = [];
  for (const n of nodes.values()) {
    const c = n[main];
    const half = (main === 'y' ? n.h : n.w) / 2;
    const band = bands.find((b) => Math.abs(b.c - c) < 1);
    if (band) {
      band.lo = Math.min(band.lo, c - half);
      band.hi = Math.max(band.hi, c + half);
    } else bands.push({ c, lo: c - half, hi: c + half });
  }
  const bandAt = (c) => bands.find((b) => Math.abs(b.c - c) < 1) ?? { c, lo: c, hi: c };

  const groups = [...model.groups.values()].map((grp) => {
    const d = g.node(`g:${grp.id}`);
    const title = layoutText(grp.title, measure, FONTS.caps);
    let depth = 0;
    for (let p = grp.parent; p; p = model.groups.get(p).parent) depth++;
    return { id: grp.id, title, role: grp.role, style: grp.style, depth, x: d.x - d.width / 2, y: d.y - d.height / 2, w: d.width, h: d.height };
  });
  groups.sort((a, b) => a.depth - b.depth);

  const edges = [];
  for (const e of model.edges) {
    if (e.type === 'invisible') continue;
    const d = g.edge({ v: `n:${e.from}`, w: `n:${e.to}`, name: e.id });
    const src = nodes.get(e.from);
    const tgt = nodes.get(e.to);
    const points = e.from === e.to ? selfLoop(src, main) : route(src, tgt, d.points, main, bandAt);
    const text = labels.get(e.id);
    const role = src.role === tgt.role ? src.role : 'bronze';
    edges.push({
      id: e.id, from: e.from, to: e.to, type: e.type, startHead: e.startHead, endHead: e.endHead, role, points,
      label: text ? { text, x: d.x, y: d.y, w: text.width + 14, h: text.height + 6 } : null,
    });
  }

  // Normalise coordinates: everything inside [PAD, size - PAD], group title chips included.
  const boxes = [
    ...[...nodes.values()].map((n) => [n.x - n.w / 2, n.y - n.h / 2, n.x + n.w / 2, n.y + n.h / 2]),
    ...groups.map((gr) => [gr.x, gr.y - 9, Math.max(gr.x + gr.w, gr.x + 14 + gr.title.width + 20), gr.y + gr.h]),
    ...edges.flatMap((e) => [
      ...e.points.map((p) => [p.x - 6, p.y - 6, p.x + 6, p.y + 6]),
      ...(e.label ? [[e.label.x - e.label.w / 2, e.label.y - e.label.h / 2, e.label.x + e.label.w / 2, e.label.y + e.label.h / 2]] : []),
    ]),
  ];
  const minX = Math.min(...boxes.map((b) => b[0]));
  const minY = Math.min(...boxes.map((b) => b[1]));
  const maxX = Math.max(...boxes.map((b) => b[2]));
  const maxY = Math.max(...boxes.map((b) => b[3]));
  const dx = PAD - minX;
  const dy = PAD - minY;
  for (const n of nodes.values()) {
    n.x += dx;
    n.y += dy;
  }
  for (const gr of groups) {
    gr.x += dx;
    gr.y += dy;
  }
  for (const e of edges) {
    e.points = e.points.map((p) => ({ x: p.x + dx, y: p.y + dy }));
    if (e.label) {
      e.label.x += dx;
      e.label.y += dy;
    }
  }
  return {
    kind: 'flowchart',
    direction: model.direction,
    width: Math.ceil(maxX - minX + PAD * 2),
    height: Math.ceil(maxY - minY + PAD * 2),
    nodes: [...nodes.values()],
    edges,
    groups,
  };
}

function pt(main, m, c) {
  return main === 'y' ? { x: c, y: m } : { x: m, y: c };
}

/**
 * Turns dagre's polyline into right angles: leave the source from the side facing the next
 * waypoint, pass through every waypoint, bend in the gap between rank bands, enter the target
 * from the side facing the previous waypoint.
 */
export function route(src, tgt, dagrePoints, main, bandAt) {
  const cross = main === 'y' ? 'x' : 'y';
  const half = (n) => (main === 'y' ? n.h : n.w) / 2;
  const way = dagrePoints.slice(1, -1).map((p) => ({ x: p.x, y: p.y }));
  const next = way[0] ?? tgt;
  const dirS = Math.sign(next[main] - src[main]) || 1;
  const prev = way.at(-1) ?? src;
  const dirT = Math.sign(tgt[main] - prev[main]) || 1;
  const S = pt(main, src[main] + dirS * half(src), src[cross]);
  const T = pt(main, tgt[main] - dirT * half(tgt), tgt[cross]);

  const seq = [{ p: S, center: src[main] }, ...way.map((p) => ({ p, center: p[main] })), { p: T, center: tgt[main] }];
  const out = [S];
  for (let k = 1; k < seq.length; k++) {
    const a = out.at(-1);
    const b = seq[k].p;
    if (Math.abs(a[cross] - b[cross]) < 1) {
      out.push(pt(main, b[main], a[cross]));
      continue;
    }
    const d = Math.sign(b[main] - a[main]) || 1;
    const bandA = bandAt(seq[k - 1].center);
    const bandB = bandAt(seq[k].center);
    let lo = d > 0 ? Math.max(a[main], bandA.hi) : Math.min(a[main], bandA.lo);
    let hi = d > 0 ? Math.min(b[main], bandB.lo) : Math.max(b[main], bandB.hi);
    if ((hi - lo) * d <= 0) {
      lo = a[main];
      hi = b[main];
    }
    const mid = (lo + hi) / 2;
    out.push(pt(main, mid, a[cross]), pt(main, mid, b[cross]), b);
  }
  // Snap the last point onto the target's centre line and drop redundant points.
  out[out.length - 1] = T;
  return simplify(out);
}

function selfLoop(n, main) {
  if (main === 'y') {
    const x = n.x + n.w / 2;
    return [{ x, y: n.y - 8 }, { x: x + 26, y: n.y - 8 }, { x: x + 26, y: n.y + 8 }, { x, y: n.y + 8 }];
  }
  const y = n.y + n.h / 2;
  return [{ x: n.x - 8, y }, { x: n.x - 8, y: y + 26 }, { x: n.x + 8, y: y + 26 }, { x: n.x + 8, y }];
}

export function simplify(points) {
  const out = [];
  for (const p of points) {
    const last = out.at(-1);
    if (last && Math.abs(last.x - p.x) < 0.5 && Math.abs(last.y - p.y) < 0.5) continue;
    out.push(p);
    while (out.length >= 3) {
      const [a, b, c] = out.slice(-3);
      const collinear = (Math.abs(a.x - b.x) < 0.5 && Math.abs(b.x - c.x) < 0.5) || (Math.abs(a.y - b.y) < 0.5 && Math.abs(b.y - c.y) < 0.5);
      if (!collinear) break;
      out.splice(out.length - 2, 1);
    }
  }
  return out;
}
