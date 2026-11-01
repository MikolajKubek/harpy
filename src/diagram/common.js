// Shared helpers for the diagram parsers.

/** A parse error that points at a diagram line (0-based `line`). */
export class HarpyError extends Error {
  constructor(message, line = null) {
    super(line === null ? message : `Line ${line + 1}: ${message}`);
    this.name = 'HarpyError';
    this.line = line;
  }
}

/**
 * In-theme colours for parts of a diagram (frontend, backend, data...). Each maps to CSS tokens
 * --hp-<name> and --hp-<name>-bright. `bronze` is the neutral default.
 */
export const ROLES = ['bronze', 'verdigris', 'lapis', 'terracotta', 'porphyry', 'laurel'];
export const AUTO_ROLES = ['verdigris', 'lapis', 'terracotta', 'porphyry', 'laurel'];
const ROLE_ALIASES = { teal: 'verdigris', green: 'laurel', blue: 'lapis', red: 'terracotta', purple: 'porphyry', brown: 'bronze', gold: 'bronze' };

/** Returns the palette role for a name ("lapis", "blue"...), or null. */
export function roleFor(name) {
  if (!name) return null;
  const key = String(name).trim().toLowerCase();
  if (ROLES.includes(key)) return key;
  return ROLE_ALIASES[key] ?? null;
}

/** Normalises label text: strips wrapping quotes, turns <br> into newlines, decodes a few entities. */
export function cleanLabel(text) {
  let t = String(text ?? '').trim();
  if (t.length >= 2 && t.startsWith('"') && t.endsWith('"')) t = t.slice(1, -1);
  if (t.length >= 2 && t.startsWith('`') && t.endsWith('`')) t = t.slice(1, -1);
  return t
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/#quot;/g, '"')
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)));
}

/** Splits a diagram into lines with comments (%%) and directives removed. Keeps line numbers. */
export function codeLines(diagram) {
  const lines = diagram.split('\n');
  const out = [];
  let inFrontmatter = false;
  lines.forEach((raw, line) => {
    const trimmed = raw.trim();
    if (line === 0 && trimmed === '---') {
      inFrontmatter = true;
      return;
    }
    if (inFrontmatter) {
      if (trimmed === '---') inFrontmatter = false;
      return;
    }
    if (!trimmed || trimmed.startsWith('%%')) return;
    out.push({ text: trimmed, line });
  });
  return out;
}

/** Detects the diagram kind from its first statement. */
export function detectKind(diagram) {
  const first = codeLines(diagram)[0];
  if (!first) return { kind: null, header: null };
  const word = first.text.split(/\s+/)[0];
  if (/^(flowchart|flowchart-elk|graph)$/i.test(word)) return { kind: 'flowchart', header: first };
  if (/^sequenceDiagram$/i.test(word)) return { kind: 'sequence', header: first };
  return { kind: null, header: first, word };
}

/**
 * Splits a statement line on `;` outside quotes and brackets (Mermaid allows several statements
 * per line).
 */
export function splitStatements(text) {
  const parts = [];
  let depth = 0;
  let quote = false;
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') quote = !quote;
    else if (!quote && '([{'.includes(c)) depth++;
    else if (!quote && ')]}'.includes(c)) depth = Math.max(0, depth - 1);
    else if (!quote && depth === 0 && c === ';') {
      parts.push(text.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(text.slice(start));
  return parts.map((p) => p.trim()).filter(Boolean);
}

/** Parses "fill:#f9f,stroke:#333,stroke-width:2px" into an object. */
export function parseStyle(text) {
  const style = {};
  for (const part of String(text).split(',')) {
    const i = part.indexOf(':');
    if (i > 0) style[part.slice(0, i).trim().toLowerCase()] = part.slice(i + 1).trim().replace(/;$/, '');
  }
  return style;
}
