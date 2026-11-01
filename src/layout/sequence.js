// Sequence diagram layout: participant columns sized to fit the messages and notes between them,
// then a single top-to-bottom pass over the events.

import { FONTS, layoutText } from './text.js';

const PAD = 14;
const ACTOR_MIN_W = 112;
const ACTOR_PAD_X = 22;
const COL_GAP = 40;
const BOX_PAD = 14;
const BOX_LABEL_H = 30;
const ACT_W = 10;
const SELF_W = 30;

const MESSAGE_FONT = { ...FONTS.label, size: 14.5, lineHeight: 19 };

export function layoutSequence(model, { measure }) {
  const parts = [...model.participants.values()];
  const index = new Map(parts.map((p, i) => [p.id, i]));
  const boxed = model.boxes.length > 0;

  // ---- Participant boxes
  const actors = parts.map((p) => {
    const text = layoutText(p.label, measure, FONTS.label, 180);
    const tall = p.type === 'database' || p.type === 'actor' || p.type === 'collections' || p.type === 'queue';
    const w = Math.max(ACTOR_MIN_W, text.width + ACTOR_PAD_X * 2);
    const h = p.type === 'actor' ? text.height + 40 : tall ? text.height + 36 : text.height + 24;
    return { id: p.id, type: p.type, role: p.role, box: p.box, text, w, h, x: 0, y: 0 };
  });

  // ---- Measure events once
  const events = model.events.map((e) => {
    if (e.kind === 'message') return { ...e, label: layoutText(e.text, measure, MESSAGE_FONT, 280) };
    if (e.kind === 'note') return { ...e, label: layoutText(e.text, measure, FONTS.small, 240) };
    if (e.kind === 'block-start' || e.kind === 'block-branch') return { ...e, label: layoutText(e.text, measure, FONTS.small) };
    return e;
  });

  // ---- Horizontal: gaps between neighbouring columns, widened by what has to fit between them
  const n = actors.length;
  const gaps = [];
  for (let i = 0; i < n - 1; i++) {
    const a = actors[i];
    const b = actors[i + 1];
    let gap = a.w / 2 + b.w / 2 + COL_GAP;
    if (boxed && a.box !== b.box) gap += (a.box ? BOX_PAD : 0) + (b.box ? BOX_PAD : 0) + 12;
    gaps.push(gap);
  }
  let leftExtra = 0;
  const spans = []; // [i, j, minimum distance]
  for (const e of events) {
    if (e.kind === 'message') {
      const i = index.get(e.from);
      const j = index.get(e.to);
      const need = e.label.width + 36 + (e.number !== null ? 22 : 0);
      if (i === j) {
        if (i < n - 1) spans.push([i, i + 1, SELF_W + 14 + e.label.width + 24]);
      } else spans.push([Math.min(i, j), Math.max(i, j), need]);
    } else if (e.kind === 'note') {
      const w = Math.max(84, e.label.width + 26);
      const ids = e.actors.map((a) => index.get(a)).sort((a, b) => a - b);
      const i = ids[0];
      const j = ids.at(-1);
      if (e.placement === 'over' && i === j) {
        if (i > 0) spans.push([i - 1, i, w / 2 + 20 + actors[i - 1].w / 4]);
        else leftExtra = Math.max(leftExtra, w / 2 - actors[i].w / 2);
        if (i < n - 1) spans.push([i, i + 1, w / 2 + 20 + actors[i + 1].w / 4]);
      } else if (e.placement === 'over') {
        spans.push([i, j, w - 40]);
      } else if (e.placement === 'left') {
        if (i > 0) spans.push([i - 1, i, w + 30]);
        else leftExtra = Math.max(leftExtra, w + 14 - actors[i].w / 2);
      } else if (j < n - 1) {
        spans.push([j, j + 1, w + 30]);
      }
    }
  }
  spans.sort((a, b) => a[1] - a[0] - (b[1] - b[0]));
  for (const [i, j, need] of spans) {
    let have = 0;
    for (let k = i; k < j; k++) have += gaps[k];
    if (have < need) for (let k = i; k < j; k++) gaps[k] += (need - have) / (j - i);
  }
  const firstBox = boxed && actors[0]?.box ? BOX_PAD : 0;
  let x = PAD + Math.max(leftExtra, 0) + firstBox + (actors[0]?.w ?? 0) / 2;
  actors.forEach((a, i) => {
    a.x = x;
    x += gaps[i] ?? 0;
  });

  // ---- Vertical
  const headerTop = PAD + (boxed ? BOX_LABEL_H : 0);
  const headerH = Math.max(0, ...actors.map((a) => a.h));
  for (const a of actors) a.y = headerTop + headerH - a.h;
  let y = headerTop + headerH + 30;

  const active = new Map(parts.map((p) => [p.id, []])); // stacks of open activations
  const activations = [];
  const messages = [];
  const notes = [];
  const blocks = [];
  const open = []; // block layout records being filled
  let lastMsgUnit = null;
  let lastArrowY = null;

  const extend = (x1, x2) => {
    for (const b of open) {
      b.minX = Math.min(b.minX, x1);
      b.maxX = Math.max(b.maxX, x2);
    }
  };
  const level = (id) => active.get(id).length;
  const startActivation = (id, at, unit) => {
    const rec = { actor: id, unit, level: level(id), y1: at, y2: null, role: actors[index.get(id)].role };
    active.get(id).push(rec);
    activations.push(rec);
  };
  const endActivation = (id, at) => {
    const rec = active.get(id).pop();
    if (rec) rec.y2 = at;
  };
  const edgeX = (id, towards) => {
    const a = actors[index.get(id)];
    const lv = level(id);
    if (!lv) return a.x;
    const off = ACT_W / 2 + (lv - 1) * 5;
    return a.x + (towards > a.x ? off : -off);
  };

  for (const e of events) {
    if (e.kind === 'message') {
      const unit = `msg:${e.id}`;
      const from = actors[index.get(e.from)];
      const to = actors[index.get(e.to)];
      const role = from.role;
      if (e.from === e.to) {
        const top = y + 2;
        const h = Math.max(28, e.label.height + 10);
        const x0 = edgeX(e.from, from.x + 1);
        if (e.activate) startActivation(e.to, top + h, unit);
        messages.push({ unit, self: true, x1: x0, x2: x0, y: top, h, loopW: SELF_W, label: e.label, labelX: x0 + SELF_W + 12, labelY: top + h / 2, ...style(e), role, number: e.number });
        extend(x0 - 4, x0 + SELF_W + 12 + e.label.width + 6);
        if (e.deactivate) endActivation(e.from, top + h);
        lastArrowY = top + h;
        y = top + h + 26;
      } else {
        const arrowY = y + (e.text ? e.label.height + 8 : 6);
        const x1 = edgeX(e.from, to.x);
        if (e.activate) startActivation(e.to, arrowY, unit);
        const x2 = edgeX(e.to, from.x);
        const mid = (x1 + x2) / 2;
        messages.push({ unit, self: false, x1, x2, y: arrowY, label: e.label, labelX: mid, labelY: y, ...style(e), role, number: e.number });
        extend(Math.min(x1, x2, mid - e.label.width / 2), Math.max(x1, x2, mid + e.label.width / 2));
        if (e.deactivate) endActivation(e.from, arrowY);
        lastArrowY = arrowY;
        y = arrowY + 24;
      }
      lastMsgUnit = unit;
    } else if (e.kind === 'note') {
      const ids = e.actors.map((a) => index.get(a)).sort((a, b) => a - b);
      const ax = actors[ids[0]].x;
      const bx = actors[ids.at(-1)].x;
      const textW = Math.max(84, e.label.width + 26);
      let w = textW;
      let nx;
      if (e.placement === 'over') {
        w = Math.max(textW, bx - ax + 44);
        nx = (ax + bx) / 2 - w / 2;
      } else if (e.placement === 'left') nx = ax - 14 - w;
      else nx = bx + 14;
      const h = e.label.height + 14;
      notes.push({ unit: `note:${e.id}`, x: nx, y, w, h, label: e.label });
      extend(nx, nx + w);
      y += h + 22;
    } else if (e.kind === 'activate') {
      startActivation(e.actor, lastArrowY ?? y, lastMsgUnit ?? `actor:${e.actor}`);
    } else if (e.kind === 'deactivate') {
      endActivation(e.actor, lastArrowY ?? y);
    } else if (e.kind === 'block-start') {
      const rec = { unit: `block:${e.id}`, type: e.type, label: e.label, color: e.color, role: e.role ?? null, y, branches: [], minX: Infinity, maxX: -Infinity, depth: open.length };
      open.push(rec);
      blocks.push(rec);
      y += e.type === 'rect' ? 14 : 34;
    } else if (e.kind === 'block-branch') {
      const rec = blocks.find((b) => b.unit === `block:${e.block}`);
      rec.branches.push({ y: y - 6, label: e.label });
      y += 26;
    } else if (e.kind === 'block-end') {
      const rec = open.pop();
      rec.h = y - 8 - rec.y;
      const minWidth = (rec.type === 'rect' ? 0 : 60 + rec.label.width) + 24;
      if (!Number.isFinite(rec.minX)) {
        rec.minX = actors[0].x;
        rec.maxX = actors.at(-1).x;
      }
      const inset = 12;
      rec.x = rec.minX - inset;
      rec.w = Math.max(rec.maxX + inset - rec.x, minWidth);
      extend(rec.x - 8, rec.x + rec.w + 8);
      y += 10;
    }
  }
  const bottom = y + 6;
  for (const rec of activations) if (rec.y2 === null) rec.y2 = bottom - 10;

  // ---- Boxes around participant groups
  const boxes = model.boxes.map((b) => {
    const members = actors.filter((a) => a.box === b.id);
    if (!members.length) return null;
    const x1 = Math.min(...members.map((a) => a.x - a.w / 2)) - BOX_PAD;
    const x2 = Math.max(...members.map((a) => a.x + a.w / 2)) + BOX_PAD;
    return { unit: `group:${b.id}`, x: x1, y: PAD, w: x2 - x1, h: bottom - PAD, label: layoutText(b.label, measure, FONTS.caps), role: b.role, color: b.customColor ?? null };
  }).filter(Boolean);

  // ---- Size
  const xs = [
    ...actors.flatMap((a) => [a.x - a.w / 2, a.x + a.w / 2]),
    ...boxes.flatMap((b) => [b.x, b.x + b.w]),
    ...notes.flatMap((nt) => [nt.x, nt.x + nt.w]),
    ...blocks.flatMap((b) => [b.x, b.x + b.w]),
    ...messages.flatMap((m) => (m.self ? [m.x1, m.labelX + m.label.width] : [m.labelX - m.label.width / 2, m.labelX + m.label.width / 2])),
  ];
  const minX = Math.min(...xs);
  const shift = minX < PAD ? PAD - minX : 0;
  if (shift) {
    for (const a of actors) a.x += shift;
    for (const b of boxes) b.x += shift;
    for (const nt of notes) nt.x += shift;
    for (const b of blocks) b.x += shift;
    for (const m of messages) {
      m.x1 += shift;
      m.x2 += shift;
      m.labelX += shift;
    }
  }
  const width = Math.ceil(Math.max(...xs) + shift + PAD);
  const height = Math.ceil(bottom + PAD);

  return {
    kind: 'sequence',
    width,
    height,
    lifelineEnd: bottom - 4,
    actors: actors.map((a) => ({ ...a, unit: `actor:${a.id}` })),
    boxes,
    messages,
    notes,
    blocks,
    activations: activations.map((r) => {
      const a = actors[index.get(r.actor)];
      return { unit: r.unit, x: a.x - ACT_W / 2 + r.level * 5, y: r.y1, w: ACT_W, h: Math.max(8, r.y2 - r.y1), role: r.role };
    }),
  };
}

function style(e) {
  return { dotted: e.dotted, head: e.head, both: !!e.both };
}
