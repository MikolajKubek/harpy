// Parser for Mermaid flowchart syntax.
//
// Supported: directions, node shapes (incl. the @{ shape: ... } form), chained edges, `&`,
// edge ids (`e1@-->`), edge labels (|text| and inline), solid / dotted / thick / invisible
// edges with arrow, circle and cross heads, edge length, subgraphs (nested), classDef, class,
// :::class, style. Ignored: click, linkStyle, accTitle, accDescr, direction inside subgraphs.
//
// Every element records the 0-based diagram `line` where it first appears, which is how
// elements are assigned to steps.

import { HarpyError, cleanLabel, codeLines, splitStatements, parseStyle, roleFor, AUTO_ROLES } from './common.js';

const DIRECTIONS = { TB: 'TB', TD: 'TB', BT: 'BT', LR: 'LR', RL: 'RL' };

// Shape delimiters, longest openers first.
const SHAPES = [
  ['(((', [')))'], 'doublecircle'],
  ['((', ['))'], 'circle'],
  ['([', ['])'], 'stadium'],
  ['[[', [']]'], 'subroutine'],
  ['[(', [')]'], 'cylinder'],
  ['{{', ['}}'], 'hexagon'],
  ['[/', ['/]', '\\]'], 'lean-right'],
  ['[\\', ['\\]', '/]'], 'lean-left'],
  ['[', [']'], 'rect'],
  ['(', [')'], 'rounded'],
  ['{', ['}'], 'diamond'],
  ['>', [']'], 'asymmetric'],
];
// `[/text\]` is a trapezoid, `[\text/]` an inverted one.
const MIXED = { 'lean-right:\\]': 'trapezoid', 'lean-left:/]': 'trapezoid-alt' };

// Shape names accepted in `A@{ shape: ... }`, mapped to ours.
const NAMED_SHAPES = {
  rect: 'rect', rectangle: 'rect', proc: 'rect', process: 'rect',
  rounded: 'rounded', event: 'rounded',
  stadium: 'stadium', pill: 'stadium', terminal: 'stadium',
  subroutine: 'subroutine', subproc: 'subroutine', 'fr-rect': 'subroutine',
  cyl: 'cylinder', cylinder: 'cylinder', database: 'cylinder', db: 'cylinder',
  circle: 'circle', circ: 'circle', 'dbl-circ': 'doublecircle', 'double-circle': 'doublecircle',
  diam: 'diamond', diamond: 'diamond', decision: 'diamond', question: 'diamond',
  hex: 'hexagon', hexagon: 'hexagon', prepare: 'hexagon',
  'lean-r': 'lean-right', 'lean-right': 'lean-right', 'in-out': 'lean-right',
  'lean-l': 'lean-left', 'lean-left': 'lean-left', 'out-in': 'lean-left',
  trap: 'trapezoid', 'trap-b': 'trapezoid', trapezoid: 'trapezoid', priority: 'trapezoid',
  'trap-t': 'trapezoid-alt', 'inv-trapezoid': 'trapezoid-alt', manual: 'trapezoid-alt',
  odd: 'asymmetric', asymmetric: 'asymmetric', doc: 'document', document: 'document',
};

const ID_CHAR = /[\p{L}\p{N}_]/u;

class Scanner {
  constructor(text, line) {
    this.s = text;
    this.i = 0;
    this.line = line;
  }
  ws() {
    while (this.i < this.s.length && /\s/.test(this.s[this.i])) this.i++;
  }
  done() {
    this.ws();
    return this.i >= this.s.length;
  }
  startsWith(t) {
    return this.s.startsWith(t, this.i);
  }
  rest() {
    return this.s.slice(this.i);
  }
  fail(message) {
    throw new HarpyError(`${message} near "${this.s.slice(this.i, this.i + 24)}"`, this.line);
  }
}

/** Reads a node id. Dashes are allowed inside ids unless they start an edge. */
function readId(sc) {
  const start = sc.i;
  while (sc.i < sc.s.length) {
    const c = sc.s[sc.i];
    if (ID_CHAR.test(c)) sc.i++;
    else if ((c === '-' || c === '.') && ID_CHAR.test(sc.s[sc.i + 1] ?? '') && sc.i > start) sc.i++;
    else break;
  }
  return sc.s.slice(start, sc.i);
}

/** Reads text up to one of `closers`; handles "quoted" text. Returns [text, closer]. */
function readUntil(sc, closers) {
  sc.ws();
  if (sc.s[sc.i] === '"') {
    const end = sc.s.indexOf('"', sc.i + 1);
    if (end === -1) sc.fail('Unclosed quote');
    const text = sc.s.slice(sc.i, end + 1);
    sc.i = end + 1;
    sc.ws();
    const closer = closers.find((c) => sc.startsWith(c));
    if (!closer) sc.fail(`Expected "${closers[0]}"`);
    sc.i += closer.length;
    return [text, closer];
  }
  let best = -1;
  let closer = null;
  for (const c of closers) {
    const at = sc.s.indexOf(c, sc.i);
    if (at !== -1 && (best === -1 || at < best)) {
      best = at;
      closer = c;
    }
  }
  if (best === -1) sc.fail(`Expected "${closers[0]}"`);
  const text = sc.s.slice(sc.i, best);
  sc.i = best + closer.length;
  return [text, closer];
}

/** Parses `{ shape: rect, label: "Text" }` (the text between the braces). */
function parseShapeObject(body) {
  const out = {};
  const re = /([A-Za-z]+)\s*:\s*("(?:[^"\\]|\\.)*"|[^,]+)/g;
  let m;
  while ((m = re.exec(body))) out[m[1].toLowerCase()] = m[2].trim();
  return out;
}

/** Reads `id`, an optional shape with text, and an optional `:::class`. */
function readNode(sc) {
  sc.ws();
  const id = readId(sc);
  if (!id) return null;
  const node = { id, label: null, shape: null, classes: [] };
  if (sc.startsWith('@{')) {
    sc.i += 2;
    const end = sc.s.indexOf('}', sc.i);
    if (end === -1) sc.fail('Unclosed "@{"');
    const obj = parseShapeObject(sc.s.slice(sc.i, end));
    sc.i = end + 1;
    if (obj.shape) node.shape = NAMED_SHAPES[obj.shape.toLowerCase()] ?? 'rect';
    if (obj.label) node.label = cleanLabel(obj.label);
  } else {
    for (const [open, closers, shape] of SHAPES) {
      if (!sc.startsWith(open)) continue;
      sc.i += open.length;
      const [text, closer] = readUntil(sc, closers);
      node.shape = MIXED[`${shape}:${closer}`] ?? shape;
      node.label = cleanLabel(text);
      break;
    }
  }
  if (sc.startsWith(':::')) {
    sc.i += 3;
    const m = sc.rest().match(/^[\w-]+/);
    if (m) {
      node.classes.push(m[0]);
      sc.i += m[0].length;
    }
  }
  return node;
}

/** Reads `A & B & C`. */
function readNodeGroup(sc) {
  const nodes = [];
  for (;;) {
    const n = readNode(sc);
    if (!n) break;
    nodes.push(n);
    sc.ws();
    if (sc.s[sc.i] === '&') {
      sc.i++;
      continue;
    }
    break;
  }
  return nodes;
}

const LINK = /^(<|o(?=[-=.])|x(?=[-=.]))?(-{2,}|={2,}|-\.+-|~{3,})(>|[ox](?=[\s|&]|$))?/;
const INLINE_START = /^(<)?(--|==|-\.)(?![->=.ox])\s*/;

/** Reads an edge with an optional `id@` prefix and label. Returns null if none follows. */
function readEdge(sc) {
  sc.ws();
  let id = null;
  const idMatch = sc.rest().match(/^([A-Za-z0-9_]+)@(?=[-=.~<ox])/);
  if (idMatch) {
    id = idMatch[1];
    sc.i += idMatch[0].length;
  }
  let label = null;
  let m = sc.rest().match(LINK);
  // A bare `--` or `==` (no head) opens the inline label form.
  if (!m || ((m[2] === '--' || m[2] === '==') && !m[3])) {
    // Inline label form: `-- text -->`, `-. text .->`, `== text ==>`
    const start = sc.rest().match(INLINE_START);
    if (!start) {
      if (idMatch) sc.fail('Expected an edge after the edge id');
      return null;
    }
    const kind = start[2];
    const close = kind === '--' ? /\s(-{2,}[>ox]|-{3,})/ : kind === '==' ? /\s(={2,}[>ox]|={3,})/ : /\s(\.-+[>ox]?|\.-)/;
    const after = sc.rest().slice(start[0].length);
    const c = after.match(close);
    if (!c) sc.fail('Unclosed edge label');
    label = cleanLabel(after.slice(0, c.index));
    const closing = c[1];
    sc.i += start[0].length + c.index + c[0].length;
    const type = kind === '==' ? 'thick' : kind === '-.' ? 'dotted' : 'solid';
    const endHead = /[>ox]$/.test(closing) ? closing.slice(-1) : null;
    const length = Math.max(1, closing.replace(/[^-=]/g, '').length - (endHead ? 1 : 2));
    return finishEdge(sc, { id, label, type, start: start[1] ? '<' : null, end: endHead, length });
  }
  sc.i += m[0].length;
  const body = m[2];
  const type = body.startsWith('~') ? 'invisible' : body.startsWith('=') ? 'thick' : body.includes('.') ? 'dotted' : 'solid';
  const endHead = m[3] ? m[3][0] : null;
  const run = type === 'dotted' ? body.replace(/[^.]/g, '').length : body.length - (endHead ? 1 : 2);
  const length = Math.max(1, run);
  return finishEdge(sc, { id, label, type, start: m[1] ?? null, end: endHead, length });
}

function finishEdge(sc, edge) {
  sc.ws();
  if (sc.s[sc.i] === '|') {
    const end = sc.s.indexOf('|', sc.i + 1);
    if (end === -1) sc.fail('Unclosed "|" edge label');
    edge.label = cleanLabel(sc.s.slice(sc.i + 1, end));
    sc.i = end + 1;
  }
  const heads = { '>': 'arrow', o: 'circle', x: 'cross', '<': 'arrow' };
  return {
    id: edge.id,
    label: edge.label || null,
    type: edge.type,
    startHead: edge.start ? heads[edge.start] : null,
    endHead: edge.end ? heads[edge.end] : null,
    length: edge.length,
  };
}

export function parseFlowchart(diagram) {
  const lines = codeLines(diagram);
  const header = lines.shift();
  const dir = header.text.split(/\s+/)[1]?.toUpperCase();
  const model = {
    kind: 'flowchart',
    direction: DIRECTIONS[dir] ?? 'TB',
    nodes: new Map(),
    edges: [],
    groups: new Map(),
    classDefs: new Map(),
    order: [], // units in order of first appearance
    warnings: [],
  };
  if (dir && !DIRECTIONS[dir] && !dir.endsWith(';')) model.warnings.push(`Unknown direction "${dir}", using TB.`);

  const groupStack = [];
  const pairCount = new Map();
  const edgeIds = new Set();

  const touchNode = (n, line) => {
    let node = model.nodes.get(n.id);
    if (!node) {
      node = { id: n.id, label: n.id, shape: 'rect', classes: [], style: {}, group: null, line };
      model.nodes.set(n.id, node);
      model.order.push(`node:${n.id}`);
    }
    if (n.label !== null && n.label !== undefined) node.label = n.label;
    if (n.shape) node.shape = n.shape;
    node.classes.push(...n.classes);
    const group = groupStack.at(-1);
    if (group && !node.groupLocked) {
      node.group = group.id;
      node.groupLocked = true;
      if (!group.members.includes(node.id)) group.members.push(node.id);
    }
    return node;
  };

  for (const { text, line } of lines) {
    for (const stmt of splitStatements(text)) {
      const word = stmt.split(/\s+/)[0];
      if (word === 'subgraph') {
        const rest = stmt.slice(8).trim();
        let id;
        let title;
        const m = rest.match(/^([^\s[]+)\s*\[(.*)\]\s*$/);
        if (m) {
          id = m[1];
          title = cleanLabel(m[2]);
        } else {
          title = cleanLabel(rest);
          id = rest.replace(/^"|"$/g, '').trim() || `subgraph-${model.groups.size + 1}`;
        }
        if (model.groups.has(id)) id = `${id}-${model.groups.size + 1}`;
        const group = { id, title, parent: groupStack.at(-1)?.id ?? null, members: [], classes: [], style: {}, line };
        model.groups.set(id, group);
        model.order.push(`group:${id}`);
        groupStack.push(group);
        continue;
      }
      if (word === 'end' && stmt === 'end') {
        if (!groupStack.length) throw new HarpyError('"end" without a matching subgraph', line);
        groupStack.pop();
        continue;
      }
      if (word === 'direction' || word === 'click' || word === 'linkStyle' || /^acc(Title|Descr)/.test(word)) continue;
      if (word === 'classDef') {
        const m = stmt.match(/^classDef\s+(\S+)\s+(.*)$/);
        if (!m) throw new HarpyError('Expected "classDef name styles"', line);
        for (const name of m[1].split(',')) model.classDefs.set(name.trim(), parseStyle(m[2]));
        continue;
      }
      if (word === 'class') {
        const m = stmt.match(/^class\s+(\S+)\s+(\S+)\s*$/);
        if (!m) throw new HarpyError('Expected "class id1,id2 className"', line);
        for (const id of m[1].split(',')) {
          const target = model.groups.get(id) ?? model.nodes.get(id) ?? touchNode({ id, label: null, shape: null, classes: [] }, line);
          target.classes.push(m[2]);
        }
        continue;
      }
      if (word === 'style') {
        const m = stmt.match(/^style\s+(\S+)\s+(.*)$/);
        if (!m) throw new HarpyError('Expected "style id styles"', line);
        const target = model.groups.get(m[1]) ?? model.nodes.get(m[1]) ?? touchNode({ id: m[1], label: null, shape: null, classes: [] }, line);
        Object.assign(target.style, parseStyle(m[2]));
        continue;
      }

      // A chain: group (edge group)*
      const sc = new Scanner(stmt, line);
      let left = readNodeGroup(sc);
      if (!left.length) sc.fail('Expected a node');
      const leftNodes = left.map((n) => touchNode(n, line));
      let prev = leftNodes;
      while (!sc.done()) {
        const edge = readEdge(sc);
        if (!edge) sc.fail('Expected an edge');
        const right = readNodeGroup(sc);
        if (!right.length) sc.fail('Expected a node after the edge');
        // Keep flow order (source, edge, target) so steps animate along the edges.
        const mark = model.order.length;
        const rightNodes = [];
        for (const r of right) rightNodes.push(touchNode(r, line));
        const newNodes = model.order.splice(mark);
        for (const a of prev) {
          for (const b of rightNodes) {
            let id = edge.id;
            if (!id || edgeIds.has(id)) {
              const key = `${a.id}\u0000${b.id}`;
              const n = pairCount.get(key) ?? 0;
              pairCount.set(key, n + 1);
              id = `L_${a.id}_${b.id}_${n}`;
            }
            edgeIds.add(id);
            model.edges.push({ ...edge, id, from: a.id, to: b.id, line });
            model.order.push(`edge:${id}`);
          }
        }
        model.order.push(...newNodes);
        prev = rightNodes;
      }
    }
  }
  if (groupStack.length) throw new HarpyError(`Subgraph "${groupStack.at(-1).id}" is never closed with "end"`, groupStack.at(-1).line);

  resolveRoles(model);
  for (const id of model.groups.keys()) {
    const n = model.nodes.get(id);
    if (n && !model.edges.some((e) => e.from === id || e.to === id) && n.label === id) {
      // A bare `class G name` on a group id created a stray node; drop it.
      model.nodes.delete(id);
      model.order = model.order.filter((u) => u !== `node:${id}`);
    }
  }
  for (const n of model.nodes.values()) delete n.groupLocked;
  return model;
}

/**
 * Colour roles: an explicit palette class (`class A lapis`, `A:::verdigris`) wins; otherwise nodes
 * inherit their group's role, and top-level groups get palette colours in order.
 */
function resolveRoles(model) {
  const styleFrom = (item) => {
    let role = null;
    const style = {};
    for (const c of item.classes) {
      const r = roleFor(c);
      if (r) role = r;
      const def = model.classDefs.get(c);
      if (def) Object.assign(style, def);
    }
    item.style = { ...style, ...item.style };
    return role;
  };
  let auto = 0;
  const used = new Set();
  const groupRole = (g) => {
    if (g.role !== undefined) return g.role;
    const explicit = styleFrom(g);
    if (explicit) g.role = explicit;
    else if (g.parent) g.role = groupRole(model.groups.get(g.parent));
    else {
      let role;
      do role = AUTO_ROLES[auto++ % AUTO_ROLES.length];
      while (used.has(role) && used.size < AUTO_ROLES.length && auto < 50);
      g.role = role;
    }
    used.add(g.role);
    return g.role;
  };
  // Explicit group roles first so auto colours avoid them.
  for (const g of model.groups.values()) {
    const r = g.classes.map(roleFor).find(Boolean);
    if (r) used.add(r);
  }
  for (const g of model.groups.values()) groupRole(g);
  for (const n of model.nodes.values()) {
    const explicit = styleFrom(n);
    n.role = explicit ?? (n.group ? model.groups.get(n.group).role : 'bronze');
  }
}
