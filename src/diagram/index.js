// Entry point for diagram parsing and step assignment.

import { HarpyError, detectKind } from './common.js';
import { parseFlowchart } from './flowchart.js';
import { parseSequence } from './sequence.js';

export { HarpyError, ROLES } from './common.js';

/** Parses a Mermaid-syntax diagram into Harpy's model. Throws HarpyError on bad input. */
export function parseDiagram(diagram) {
  const { kind, header, word } = detectKind(diagram);
  if (!header) throw new HarpyError('The diagram is empty.');
  if (kind === 'flowchart') return parseFlowchart(diagram);
  if (kind === 'sequence') return parseSequence(diagram);
  throw new HarpyError(`Harpy draws "flowchart" and "sequenceDiagram" diagrams so far, not "${word}".`, header.line);
}

/** Every element's unit key mapped to its declaration line. */
function unitLines(model) {
  const lines = new Map();
  if (model.kind === 'flowchart') {
    for (const n of model.nodes.values()) lines.set(`node:${n.id}`, n.line);
    for (const e of model.edges) lines.set(`edge:${e.id}`, e.line);
    for (const g of model.groups.values()) lines.set(`group:${g.id}`, g.line);
  } else {
    for (const p of model.participants.values()) lines.set(`actor:${p.id}`, p.line);
    for (const b of model.boxes) lines.set(`group:${b.id}`, b.line);
    for (const e of model.events) {
      if (e.kind === 'message') lines.set(`msg:${e.id}`, e.line);
      else if (e.kind === 'note') lines.set(`note:${e.id}`, e.line);
      else if (e.kind === 'block-start') lines.set(`block:${e.id}`, e.line);
    }
  }
  return lines;
}

/**
 * Assigns each unit to a step: the last step marker above its declaration line.
 * Elements above the first marker belong to the first step.
 * @returns {string[][]} units per step, in declaration order
 */
export function assignSteps(model, steps) {
  if (!steps.length) return [];
  const lines = unitLines(model);
  const result = steps.map(() => []);
  for (const unit of model.order) {
    const line = lines.get(unit);
    if (line === undefined) continue;
    let index = 0;
    for (let i = 0; i < steps.length; i++) if (steps[i].line < line) index = i;
    result[index].push(unit);
  }
  return result;
}

/** Names a step's focus=/show=/hide= options can use, mapped to units. */
export function aliases(model) {
  const map = new Map();
  const add = (name, unit) => {
    if (name && !map.has(name)) map.set(name, unit);
  };
  if (model.kind === 'flowchart') {
    for (const n of model.nodes.values()) add(n.id, `node:${n.id}`);
    for (const g of model.groups.values()) {
      add(g.id, `group:${g.id}`);
      add(g.title, `group:${g.id}`);
    }
    for (const e of model.edges) {
      add(e.id, `edge:${e.id}`);
      add(`${e.from}-->${e.to}`, `edge:${e.id}`);
    }
  } else {
    for (const p of model.participants.values()) {
      add(p.id, `actor:${p.id}`);
      add(p.label, `actor:${p.id}`);
    }
    for (const b of model.boxes) add(b.label, `group:${b.id}`);
    for (const e of model.events) {
      if (e.kind === 'message' || e.kind === 'note' || e.kind === 'block-start') add(e.id, `${e.kind === 'block-start' ? 'block' : e.kind === 'message' ? 'msg' : 'note'}:${e.id}`);
    }
  }
  return map;
}

/** Resolves focus/show/hide references (ids, labels, "A --> B") to units. */
export function resolveRefs(refs, names, warnings, context) {
  const units = [];
  for (const ref of refs ?? []) {
    const normalised = ref.replace(/\s+/g, '').replace(/(?:-\.+-|-{1,}|={1,})>|-{3,}/, '-->');
    const unit = names.get(ref) ?? names.get(normalised);
    if (unit) units.push(unit);
    else warnings.push(`${context}: "${ref}" does not match any element.`);
  }
  return units;
}
