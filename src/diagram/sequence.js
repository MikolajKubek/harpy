// Parser for Mermaid sequence diagram syntax.
//
// Supported: participant / actor (with `as` aliases and `@{ "type": "database" }` style types),
// create participant, box groups (`box lapis Frontend ... end`), messages with all arrow types
// and +/- activation shorthands, activate / deactivate, notes, loop / alt / else / opt / par /
// and / critical / option / break / rect blocks, autonumber, title.

import { HarpyError, cleanLabel, codeLines, roleFor, AUTO_ROLES } from './common.js';

const ARROWS = [
  ['<<-->>', { dotted: true, head: 'arrow', both: true }],
  ['<<->>', { dotted: false, head: 'arrow', both: true }],
  ['-->>', { dotted: true, head: 'arrow' }],
  ['->>', { dotted: false, head: 'arrow' }],
  ['--x', { dotted: true, head: 'cross' }],
  ['-x', { dotted: false, head: 'cross' }],
  ['--)', { dotted: true, head: 'open' }],
  ['-)', { dotted: false, head: 'open' }],
  ['-->', { dotted: true, head: 'none' }],
  ['->', { dotted: false, head: 'none' }],
];
const MESSAGE = new RegExp(
  `^(.+?)\\s*(${ARROWS.map(([a]) => a.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})\\s*([+-]?)\\s*([^:]+?)\\s*(?::(.*))?$`,
);
const BLOCKS = new Set(['loop', 'alt', 'opt', 'par', 'critical', 'break', 'rect']);
const BRANCHES = { else: 'alt', and: 'par', option: 'critical' };
const PARTICIPANT_TYPES = new Set(['participant', 'actor', 'boundary', 'control', 'entity', 'database', 'collections', 'queue']);
const CSS_COLOR = /^(#[0-9a-f]{3,8}|(rgba?|hsla?)\(.*\)|transparent|[a-z]+)$/i;
const CSS_NAMED = new Set(['aqua', 'black', 'blue', 'fuchsia', 'gray', 'grey', 'green', 'lime', 'maroon', 'navy', 'olive', 'orange', 'purple', 'red', 'silver', 'teal', 'white', 'yellow', 'pink', 'brown', 'gold', 'tan', 'coral', 'salmon', 'khaki', 'beige', 'ivory', 'lavender', 'plum', 'orchid', 'violet', 'indigo', 'crimson', 'cyan', 'magenta', 'transparent']);

/** Splits `box`/`rect` arguments into a colour (palette role or CSS colour) and the rest. */
function splitColor(rest) {
  const s = rest.trim();
  const fn = s.match(/^((?:rgba?|hsla?)\([^)]*\))\s*(.*)$/i);
  if (fn) return { color: fn[1], text: fn[2] };
  const [first, ...more] = s.split(/\s+/);
  if (first && (roleFor(first) || /^#[0-9a-f]{3,8}$/i.test(first) || CSS_NAMED.has(first.toLowerCase()))) {
    return { color: first, text: more.join(' ') };
  }
  return { color: null, text: s };
}

export function parseSequence(diagram) {
  const lines = codeLines(diagram);
  lines.shift();
  const model = {
    kind: 'sequence',
    title: null,
    participants: new Map(),
    boxes: [],
    events: [], // messages, notes, blocks, activations in order
    order: [],
    warnings: [],
  };
  let autonumber = null; // { next, step } while on
  const stack = []; // open boxes and blocks
  let currentBox = null;

  const addParticipant = (id, line, props = {}) => {
    let p = model.participants.get(id);
    if (!p) {
      p = { id, label: id, type: 'participant', box: currentBox?.id ?? null, line, index: model.participants.size };
      model.participants.set(id, p);
      model.order.push(`actor:${id}`);
      if (currentBox) currentBox.members.push(id);
    }
    if (props.label) p.label = props.label;
    if (props.type) p.type = props.type;
    return p;
  };
  const ensure = (id, line) => model.participants.get(id) ?? addParticipant(id, line);

  for (const { text, line } of lines) {
    const word = text.split(/\s+/)[0];
    const lower = word.toLowerCase();

    if (lower === 'title') {
      model.title = cleanLabel(text.slice(5).replace(/^:/, ''));
      continue;
    }
    if (/^acc(Title|Descr)/.test(word) || lower === 'destroy' || lower === 'links' || lower === 'link' || lower === 'properties' || lower === 'details') continue;
    if (lower === 'autonumber') {
      const [, a, b] = text.split(/\s+/);
      if (a === 'off') autonumber = null;
      else autonumber = { next: a ? Number(a) : 1, step: b ? Number(b) : 1 };
      continue;
    }

    const decl = text.match(/^(?:create\s+)?(participant|actor)\s+(.+)$/i);
    if (decl) {
      let rest = decl[2].trim();
      let type = decl[1].toLowerCase();
      let label = null;
      const as = rest.match(/^(.+?)\s+as\s+(.+)$/);
      if (as) {
        rest = as[1].trim();
        label = cleanLabel(as[2]);
      }
      const meta = rest.match(/^(.+?)@\{(.*)\}$/);
      if (meta) {
        rest = meta[1].trim();
        const t = meta[2].match(/"?type"?\s*:\s*"?([a-z]+)"?/i);
        if (t && PARTICIPANT_TYPES.has(t[1].toLowerCase())) type = t[1].toLowerCase();
        const a = meta[2].match(/"?alias"?\s*:\s*"([^"]*)"/i);
        if (a && !label) label = cleanLabel(a[1]);
      }
      const id = rest.replace(/^"|"$/g, '');
      if (model.participants.has(id) && model.participants.get(id).line !== line) {
        const p = model.participants.get(id);
        if (label) p.label = label;
        p.type = type;
      } else {
        addParticipant(id, line, { label: label ?? cleanLabel(id), type });
      }
      continue;
    }

    if (lower === 'box') {
      if (currentBox) throw new HarpyError('Boxes cannot be nested', line);
      const { color, text: label } = splitColor(text.slice(3));
      const box = { id: `box-${model.boxes.length + 1}`, label: cleanLabel(label), color, role: roleFor(color), members: [], line };
      model.boxes.push(box);
      model.order.push(`group:${box.id}`);
      currentBox = box;
      stack.push({ kind: 'box', box, line });
      continue;
    }

    if (lower === 'end' && text === 'end') {
      const top = stack.pop();
      if (!top) throw new HarpyError('"end" without a matching box or block', line);
      if (top.kind === 'box') currentBox = null;
      else model.events.push({ kind: 'block-end', block: top.block.id, line });
      continue;
    }

    if (BLOCKS.has(lower)) {
      const rest = text.slice(word.length).trim();
      const id = `block-${model.events.filter((e) => e.kind === 'block-start').length + 1}`;
      const block = { kind: 'block-start', id, type: lower, text: '', color: null, line };
      if (lower === 'rect') {
        const { color } = splitColor(rest);
        block.color = color ?? rest;
        block.role = roleFor(color);
      } else {
        block.text = cleanLabel(rest);
      }
      model.events.push(block);
      model.order.push(`block:${id}`);
      stack.push({ kind: 'block', block, line });
      continue;
    }
    if (BRANCHES[lower]) {
      const top = stack.at(-1);
      if (!top || top.kind !== 'block' || top.block.type !== BRANCHES[lower]) {
        throw new HarpyError(`"${lower}" is only allowed inside "${BRANCHES[lower]}"`, line);
      }
      model.events.push({ kind: 'block-branch', block: top.block.id, text: cleanLabel(text.slice(word.length)), line });
      continue;
    }

    if (lower === 'activate' || lower === 'deactivate') {
      const id = text.slice(word.length).trim();
      ensure(id, line);
      model.events.push({ kind: lower, actor: id, line });
      continue;
    }

    const note = text.match(/^note\s+(left of|right of|over)\s+([^:]+?)\s*:(.*)$/i);
    if (note) {
      const actors = note[2].split(',').map((s) => s.trim()).filter(Boolean);
      actors.forEach((a) => ensure(a, line));
      const id = `note-${model.events.filter((e) => e.kind === 'note').length + 1}`;
      model.events.push({ kind: 'note', id, placement: note[1].toLowerCase().replace(' of', ''), actors, text: cleanLabel(note[3]), line });
      model.order.push(`note:${id}`);
      continue;
    }

    const msg = text.match(MESSAGE);
    if (msg) {
      const [, fromRaw, arrow, act, toRaw, body] = msg;
      const from = fromRaw.trim();
      const to = toRaw.trim();
      ensure(from, line);
      ensure(to, line);
      const style = ARROWS.find(([a]) => a === arrow)[1];
      const id = `msg-${model.events.filter((e) => e.kind === 'message').length + 1}`;
      const event = { kind: 'message', id, from, to, text: cleanLabel(body ?? ''), ...style, activate: act === '+', deactivate: act === '-', number: null, line };
      if (autonumber) {
        event.number = autonumber.next;
        autonumber.next += autonumber.step;
      }
      model.events.push(event);
      model.order.push(`msg:${id}`);
      continue;
    }

    throw new HarpyError(`Could not understand "${text}"`, line);
  }

  if (stack.length) {
    const top = stack.at(-1);
    throw new HarpyError(`"${top.kind === 'box' ? 'box' : top.block.type}" is never closed with "end"`, top.line);
  }

  // Colours: boxes keep an explicit palette colour, otherwise take the next palette role.
  // A non-palette CSS colour still tints the box, with a neutral role.
  const used = new Set(model.boxes.map((b) => b.role).filter(Boolean));
  let auto = 0;
  for (const box of model.boxes) {
    if (box.role) continue;
    if (box.color && box.color !== 'transparent' && !roleFor(box.color)) {
      box.role = 'bronze';
      box.customColor = box.color; // any CSS colour still tints the box
      continue;
    }
    let role;
    do role = AUTO_ROLES[auto++ % AUTO_ROLES.length];
    while (used.has(role) && used.size < AUTO_ROLES.length && auto < 50);
    box.role = role;
    used.add(role);
  }
  for (const p of model.participants.values()) {
    p.role = p.box ? model.boxes.find((b) => b.id === p.box).role : 'bronze';
  }
  return model;
}
