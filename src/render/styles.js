// Visual style of Harpy diagrams. Colours come from --hp-* tokens defined by the host
// (see THEME_TOKENS); each unit carries a role class (r-lapis...) that sets --r (base colour)
// and --rb (bright colour, used while the unit is the current step).

const ROLE_TOKENS = {
  night: {
    bronze: ['#b58a6c', '#ffb877'],
    verdigris: ['#6fae9c', '#9fe6d0'],
    lapis: ['#8199d4', '#b7c8ff'],
    terracotta: ['#cf7a5c', '#ffad8c'],
    porphyry: ['#bd86b1', '#f2b8e6'],
    laurel: ['#a2ac65', '#d8e494'],
  },
  parchment: {
    bronze: ['#8f5f43', '#b9560c'],
    verdigris: ['#2e7565', '#14876d'],
    lapis: ['#3d5a9e', '#2550c8'],
    terracotta: ['#a3452a', '#c93f15'],
    porphyry: ['#874578', '#a6318f'],
    laurel: ['#5d6a26', '#617f08'],
  },
};

const BASE = {
  night: {
    bg: '#0f0a17', stage: '#130d1c', surface: '#171021', line: '#2a2030', ink: '#ecd9c0', 'ink-bright': '#fff3e3',
    'ink-soft': '#b7a291', 'ink-faint': '#7c6a62', frame: '#5e4538', note: '#1c1525', glow: '#ffb877', code: '#120c1a',
    error: '#ff9a8a', 'error-bg': '#2a1418',
  },
  parchment: {
    bg: '#f4ecdf', stage: '#fbf6ec', surface: '#efe5d4', line: '#dccbb2', ink: '#2b1f1a', 'ink-bright': '#140d0a',
    'ink-soft': '#5d4a3e', 'ink-faint': '#8c7768', frame: '#c0a38a', note: '#f3eadb', glow: '#b9560c', code: '#f0e6d5',
    error: '#b42318', 'error-bg': '#fdeceb',
  },
};

function declarations(theme) {
  const lines = Object.entries(BASE[theme]).map(([k, v]) => `--hp-${k}: ${v};`);
  for (const [role, [base, bright]] of Object.entries(ROLE_TOKENS[theme])) lines.push(`--hp-${role}: ${base};`, `--hp-${role}-bright: ${bright};`);
  lines.push(`color-scheme: ${theme === 'night' ? 'dark' : 'light'};`);
  return lines.join(' ');
}

/**
 * Theme tokens for a selector. Night is the default; parchment applies for a light system
 * preference or when `lightSelector` matches, night again when `darkSelector` matches.
 */
export function themeTokens(selector, { lightSelector, darkSelector }) {
  return `
${selector} { ${declarations('night')} }
@media (prefers-color-scheme: light) { ${selector}:not(${darkSelector}) { ${declarations('parchment')} } }
${lightSelector} { ${declarations('parchment')} }
${darkSelector} { ${declarations('night')} }`;
}

const roleRules = Object.keys(ROLE_TOKENS.night).map((r) => `.r-${r} { --r: var(--hp-${r}); --rb: var(--hp-${r}-bright); }`).join('\n');

export const DIAGRAM_CSS = `
.hd { display: block; overflow: visible; --r: var(--hp-bronze); --rb: var(--hp-bronze-bright); }
${roleRules}
.hd text { fill: var(--hp-ink); dominant-baseline: central; font-family: "EB Garamond", Garamond, Georgia, serif; transition: fill .45s; }
.hd .hd-label { font-size: 15px; }
.hd .hd-small { font-size: 14px; font-style: italic; fill: var(--hp-ink-soft); }
.hd .hd-msg-label { font-size: 14.5px; }
.hd .hd-caps { font: 600 10.5px Cinzel, "Trajan Pro", Georgia, serif; letter-spacing: 1.9px; fill: var(--r); }
.hd .hd-tag-text { fill: var(--hp-ink); }
.hd .hd-cond { fill: var(--hp-ink-soft); }
.hd .hd-note-text { fill: var(--hp-ink); }
.hd .hd-badge-text { font-size: 11px; font-weight: 600; fill: var(--r); text-anchor: middle; font-variant-numeric: lining-nums; }

.hd-shape { fill: color-mix(in srgb, var(--r) 10%, var(--hp-stage)); stroke: var(--r); stroke-width: 1.3; transition: stroke .45s, fill .45s; }
.hd-inner { fill: none; }
.hd-figure { fill: none; stroke: var(--r); stroke-width: 1.3; stroke-linecap: round; }
.hd-edge { fill: none; stroke: var(--r); stroke-width: 1.4; stroke-linecap: round; stroke-linejoin: round; transition: stroke .45s; }
.hd-dotted { stroke-dasharray: 5 5; }
.hd-thick { stroke-width: 2.6; }
.hd-label-chip { fill: var(--hp-stage); stroke: color-mix(in srgb, var(--r) 35%, transparent); stroke-width: 1; }
.hd-group-frame { fill: color-mix(in srgb, var(--r) 5%, transparent); stroke: color-mix(in srgb, var(--r) 50%, transparent); stroke-width: 1; }
.hd-chip { fill: var(--hp-stage); stroke: color-mix(in srgb, var(--r) 60%, transparent); stroke-width: 1; }
.hd-box-frame { fill: color-mix(in srgb, var(--r) 6%, transparent); stroke: color-mix(in srgb, var(--r) 40%, transparent); stroke-width: 1; }
.hd-lifeline { fill: none; stroke: color-mix(in srgb, var(--r) 55%, transparent); stroke-width: 1.2; stroke-dasharray: 1 5; stroke-linecap: round; }
.hd-act { fill: color-mix(in srgb, var(--r) 24%, var(--hp-stage)); stroke: var(--r); stroke-width: 1; }
.hd-frame { fill: none; stroke: var(--hp-frame); stroke-width: 1; }
.hd-tag { fill: color-mix(in srgb, var(--hp-frame) 35%, var(--hp-stage)); stroke: var(--hp-frame); stroke-width: 1; }
.hd-divider { fill: none; stroke: var(--hp-frame); stroke-width: 1; stroke-dasharray: 4 4; }
.hd-rect-fill { fill: var(--r); fill-opacity: .1; }
.hd-note-box { fill: var(--hp-note); stroke: var(--hp-line); stroke-width: 1; }
.hd-note-accent { stroke: var(--hp-bronze); stroke-width: 2; stroke-linecap: round; }
.hd-badge { fill: var(--hp-stage); stroke: var(--r); stroke-width: 1.2; }
.hd-mask { fill: none; stroke: #fff; stroke-width: 24; }

/* Step states, set by the player */
.hd-unit { transition: opacity .55s ease var(--d, 0ms), filter .55s ease; }
.hd-hidden { opacity: 0; pointer-events: none; }
.hd-past { opacity: var(--harpy-dim-opacity, .42); }
.hd-current { --r: var(--rb); filter: drop-shadow(0 0 5px color-mix(in srgb, var(--rb) 50%, transparent)); }
.hd-current.hd-group, .hd-current.hd-box, .hd-current.hd-block { filter: none; }
.hd-current text { fill: var(--hp-ink-bright); }
.hd-current .hd-caps, .hd-current .hd-badge-text { fill: var(--rb); }
.hd-current .hd-small { fill: var(--hp-ink); }
.hd-mask.hd-drawing { stroke-dasharray: 1 2; animation: hd-draw .75s cubic-bezier(.45, 0, .2, 1) var(--d, 0ms) both; }
@keyframes hd-draw { from { stroke-dashoffset: 1; } to { stroke-dashoffset: 0; } }
@media (prefers-reduced-motion: reduce) {
  .hd-unit, .hd text, .hd-shape, .hd-edge { transition: none; }
  .hd-mask.hd-drawing { animation: none; }
}
`;
