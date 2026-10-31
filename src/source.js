// Parses a Harpy document into its diagram, step markers and Markdown descriptions.
//
// A document is either a bare Mermaid diagram, or Markdown containing one fenced
// ```harpy / ```mermaid block followed by `## <step-id>` description sections:
//
//   # Checkout flow
//
//   ```harpy
//   flowchart LR
//   %% @step cart "Filling the cart"
//     U[User] --> C[Cart]
//   %% @step pay "Payment" focus=P
//     C --> P{Pay?}
//   ```
//
//   ## cart
//   The user adds items...
//
//   ## summary
//   The whole flow...
//
// Step markers are Mermaid comments, so the diagram stays valid Mermaid.

const FENCE_OPEN = /^(\s*)(`{3,}|~{3,})\s*(harpy|mermaid)\s*$/i;
const STEP_MARKER = /^\s*%%\s*@step\b(.*)$/;
const HEADING2 = /^##\s+(.+?)\s*#*\s*$/;
const HEADING1 = /^#\s+(.+?)\s*#*\s*$/;
const EXPLICIT_ID = /^(.*?)\s*\{#([^}\s]+)\}$/;
const LIST_OPTIONS = new Set(['focus', 'show', 'hide']);

export const SUMMARY_ID = 'summary';

/** Removes the common indentation and surrounding blank lines. */
export function dedent(text) {
  const lines = String(text ?? '').replace(/\r\n?/g, '\n').split('\n');
  while (lines.length && !lines[0].trim()) lines.shift();
  while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
  const indents = lines.filter((l) => l.trim()).map((l) => l.match(/^[ \t]*/)[0].length);
  const cut = indents.length ? Math.min(...indents) : 0;
  return lines.map((l) => l.slice(cut)).join('\n');
}

/** Splits the text after `@step` into tokens: bare words, "quoted strings" and key=value pairs. */
function tokenize(rest) {
  const tokens = [];
  const re = /"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)'|(\S+)/g;
  let m;
  while ((m = re.exec(rest))) {
    if (m[1] !== undefined || m[2] !== undefined) {
      tokens.push({ quoted: (m[1] ?? m[2]).replace(/\\(.)/g, '$1') });
    } else {
      tokens.push({ word: m[3] });
    }
  }
  return tokens;
}

/** Parses the text following `%% @step` into { id, title, focus, show, hide, options }. */
export function parseStepMarker(rest) {
  const step = { id: null, title: null, focus: null, show: [], hide: [], options: {} };
  for (const t of tokenize(rest)) {
    if (t.quoted !== undefined) {
      if (step.title === null) step.title = t.quoted;
      continue;
    }
    const eq = t.word.indexOf('=');
    if (eq > 0) {
      const key = t.word.slice(0, eq).toLowerCase();
      const value = t.word.slice(eq + 1).replace(/^["']|["']$/g, '');
      if (LIST_OPTIONS.has(key)) {
        const list = value.split(',').map((s) => s.trim()).filter(Boolean);
        step[key] = key === 'focus' ? [...(step.focus ?? []), ...list] : [...step[key], ...list];
      } else {
        step.options[key] = value;
      }
    } else if (step.id === null) {
      step.id = t.word;
    }
  }
  return step;
}

/** Extracts step markers from a diagram. `line` is the 0-based line index of each marker. */
export function parseSteps(diagram) {
  const steps = [];
  const used = new Set();
  diagram.split('\n').forEach((text, line) => {
    const m = text.match(STEP_MARKER);
    if (!m) return;
    const step = parseStepMarker(m[1]);
    let id = step.id ?? `step-${steps.length + 1}`;
    if (id.toLowerCase() === SUMMARY_ID) id = `${id}-step`;
    let unique = id;
    for (let n = 2; used.has(unique); n++) unique = `${id}-${n}`;
    used.add(unique);
    steps.push({ ...step, id: unique, line });
  });
  return steps;
}

/** Splits Markdown into `## heading` sections. Text before the first heading is returned as `lead`. */
function splitSections(markdown) {
  const sections = [];
  const lead = [];
  let current = null;
  let fence = null;
  for (const line of markdown.split('\n')) {
    const f = line.match(/^\s*(`{3,}|~{3,})/);
    if (f) {
      if (!fence) fence = f[1];
      else if (line.trim().startsWith(fence)) fence = null;
    }
    const h = !fence && line.match(HEADING2);
    if (h) {
      current = { heading: h[1], body: [] };
      sections.push(current);
    } else {
      (current ? current.body : lead).push(line);
    }
  }
  return {
    lead: lead.join('\n').trim(),
    sections: sections.map((s) => ({ heading: s.heading, body: s.body.join('\n').trim() })),
  };
}

/**
 * Parses a full Harpy document.
 * @returns {{ title: string|null, intro: string, diagram: string, steps: object[],
 *            descriptions: Map<string,string>, summary: {title: string|null, body: string}|null,
 *            warnings: string[] }}
 */
export function parseDocument(text) {
  const source = dedent(text);
  const lines = source.split('\n');
  const warnings = [];

  const open = lines.findIndex((l) => FENCE_OPEN.test(l));
  let diagram;
  let before = '';
  let after = '';
  if (open === -1) {
    diagram = source;
  } else {
    const [, , fence] = lines[open].match(FENCE_OPEN);
    const isClose = (l) => {
      const m = l.match(/^\s*(`{3,}|~{3,})\s*$/);
      return m && m[1][0] === fence[0] && m[1].length >= fence.length;
    };
    let close = lines.findIndex((l, i) => i > open && isClose(l));
    if (close === -1) {
      warnings.push('Diagram code fence is never closed.');
      close = lines.length;
    }
    diagram = dedent(lines.slice(open + 1, close).join('\n'));
    before = lines.slice(0, open).join('\n');
    after = lines.slice(close + 1).join('\n');
  }

  let title = null;
  const introLines = [];
  for (const line of before.split('\n')) {
    const h = title === null && line.match(HEADING1);
    if (h) title = h[1];
    else introLines.push(line);
  }

  const steps = parseSteps(diagram);
  const byId = new Map(steps.map((s) => [s.id.toLowerCase(), s]));
  const byTitle = new Map(steps.filter((s) => s.title).map((s) => [s.title.toLowerCase(), s]));
  const descriptions = new Map();
  let summary = null;

  const { lead, sections } = splitSections(after);
  if (lead) warnings.push('Text between the diagram and the first "## <step>" heading is ignored.');

  for (const { heading, body } of sections) {
    const explicit = heading.match(EXPLICIT_ID);
    const key = (explicit ? explicit[2] : heading).trim();
    const label = explicit ? explicit[1].trim() : null;
    if (key.toLowerCase() === SUMMARY_ID) {
      summary = { title: label, body };
      continue;
    }
    const step = byId.get(key.toLowerCase()) ?? (!explicit && byTitle.get(key.toLowerCase()));
    if (!step) {
      warnings.push(`Section "## ${heading}" does not match any step.`);
      continue;
    }
    if (label && !step.title) step.title = label;
    descriptions.set(step.id, body);
  }

  return { title, intro: introLines.join('\n').trim(), diagram, steps, descriptions, summary, warnings };
}

/**
 * Returns the diagram text up to (not including) the marker of step `index + 1`,
 * i.e. everything that is visible once step `index` has been reached.
 */
export function diagramPrefix(diagram, steps, index) {
  const lines = diagram.split('\n');
  const next = steps[index + 1];
  return lines.slice(0, next ? next.line : lines.length).join('\n');
}
