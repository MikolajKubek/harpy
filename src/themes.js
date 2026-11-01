// Colour themes. Each theme sets the --hp-* tokens: base colours for surfaces and text, and a
// [base, bright] pair for each role colour (bright is used while a unit is the current step).
// Role names are Harpy's own; every theme maps them onto its palette.
//
// A family pairs a dark and a light theme. `auto` follows the system preference within a family,
// and `theme="dark"` / `theme="light"` pick that family's variant.

export const THEMES = {
  night: {
    scheme: 'dark',
    base: {
      bg: '#0f0a17', stage: '#130d1c', surface: '#171021', line: '#2a2030', ink: '#ecd9c0', 'ink-bright': '#fff3e3',
      'ink-soft': '#b7a291', 'ink-faint': '#7c6a62', frame: '#5e4538', note: '#1c1525', glow: '#ffb877', code: '#120c1a',
      error: '#ff9a8a', 'error-bg': '#2a1418',
    },
    roles: {
      bronze: ['#b58a6c', '#ffb877'], verdigris: ['#6fae9c', '#9fe6d0'], lapis: ['#8199d4', '#b7c8ff'],
      terracotta: ['#cf7a5c', '#ffad8c'], porphyry: ['#bd86b1', '#f2b8e6'], laurel: ['#a2ac65', '#d8e494'],
    },
  },
  parchment: {
    scheme: 'light',
    base: {
      bg: '#f4ecdf', stage: '#fbf6ec', surface: '#efe5d4', line: '#dccbb2', ink: '#2b1f1a', 'ink-bright': '#140d0a',
      'ink-soft': '#5d4a3e', 'ink-faint': '#8c7768', frame: '#c0a38a', note: '#f3eadb', glow: '#b9560c', code: '#f0e6d5',
      error: '#b42318', 'error-bg': '#fdeceb',
    },
    roles: {
      bronze: ['#8f5f43', '#b9560c'], verdigris: ['#2e7565', '#14876d'], lapis: ['#3d5a9e', '#2550c8'],
      terracotta: ['#a3452a', '#c93f15'], porphyry: ['#874578', '#a6318f'], laurel: ['#5d6a26', '#617f08'],
    },
  },
  'gruvbox-dark': {
    scheme: 'dark',
    base: {
      bg: '#1d2021', stage: '#282828', surface: '#32302f', line: '#3c3836', ink: '#ebdbb2', 'ink-bright': '#fbf1c7',
      'ink-soft': '#bdae93', 'ink-faint': '#928374', frame: '#665c54', note: '#32302f', glow: '#fe8019', code: '#1d2021',
      error: '#fb4934', 'error-bg': '#3c1f1e',
    },
    roles: {
      bronze: ['#d65d0e', '#fe8019'], verdigris: ['#689d6a', '#8ec07c'], lapis: ['#458588', '#83a598'],
      terracotta: ['#cc241d', '#fb4934'], porphyry: ['#b16286', '#d3869b'], laurel: ['#98971a', '#b8bb26'],
    },
  },
  'gruvbox-light': {
    scheme: 'light',
    base: {
      bg: '#f2e5bc', stage: '#fbf1c7', surface: '#ebdbb2', line: '#d5c4a1', ink: '#3c3836', 'ink-bright': '#282828',
      'ink-soft': '#504945', 'ink-faint': '#7c6f64', frame: '#bdae93', note: '#f2e5bc', glow: '#af3a03', code: '#ebdbb2',
      error: '#9d0006', 'error-bg': '#fbe0d6',
    },
    roles: {
      bronze: ['#af3a03', '#d65d0e'], verdigris: ['#427b58', '#689d6a'], lapis: ['#076678', '#458588'],
      terracotta: ['#9d0006', '#cc241d'], porphyry: ['#8f3f71', '#b16286'], laurel: ['#79740e', '#98971a'],
    },
  },
  'solarized-dark': {
    scheme: 'dark',
    base: {
      bg: '#00212b', stage: '#002b36', surface: '#073642', line: '#0e3f4b', ink: '#93a1a1', 'ink-bright': '#eee8d5',
      'ink-soft': '#839496', 'ink-faint': '#586e75', frame: '#2f525b', note: '#073642', glow: '#b58900', code: '#00212b',
      error: '#dc322f', 'error-bg': '#3a1f22',
    },
    roles: {
      bronze: ['#b58900', '#e0ab1f'], verdigris: ['#2aa198', '#4fd1c5'], lapis: ['#268bd2', '#5fb3f0'],
      terracotta: ['#cb4b16', '#f2733c'], porphyry: ['#d33682', '#f067a6'], laurel: ['#859900', '#b0c42a'],
    },
  },
  'solarized-light': {
    scheme: 'light',
    base: {
      bg: '#eee8d5', stage: '#fdf6e3', surface: '#f5efdc', line: '#e0d9c3', ink: '#586e75', 'ink-bright': '#073642',
      'ink-soft': '#657b83', 'ink-faint': '#93a1a1', frame: '#c9c1a8', note: '#f5efdc', glow: '#cb4b16', code: '#eee8d5',
      error: '#dc322f', 'error-bg': '#fbe3dc',
    },
    roles: {
      bronze: ['#b58900', '#8f6b00'], verdigris: ['#2aa198', '#1a7f77'], lapis: ['#268bd2', '#1a6aa8'],
      terracotta: ['#cb4b16', '#a63a0d'], porphyry: ['#d33682', '#ab1f63'], laurel: ['#859900', '#667600'],
    },
  },
  'nord-dark': {
    scheme: 'dark',
    base: {
      bg: '#242933', stage: '#2e3440', surface: '#3b4252', line: '#434c5e', ink: '#d8dee9', 'ink-bright': '#eceff4',
      'ink-soft': '#aeb7c6', 'ink-faint': '#7b88a1', frame: '#4c566a', note: '#3b4252', glow: '#88c0d0', code: '#272c36',
      error: '#bf616a', 'error-bg': '#3d2b31',
    },
    roles: {
      bronze: ['#d08770', '#f0a58a'], verdigris: ['#8fbcbb', '#b5e0df'], lapis: ['#81a1c1', '#a9c7e8'],
      terracotta: ['#bf616a', '#e0868e'], porphyry: ['#b48ead', '#d4b0cd'], laurel: ['#a3be8c', '#c4dcae'],
    },
  },
  'nord-light': {
    scheme: 'light',
    base: {
      bg: '#e5e9f0', stage: '#eceff4', surface: '#e5e9f0', line: '#d8dee9', ink: '#2e3440', 'ink-bright': '#242933',
      'ink-soft': '#4c566a', 'ink-faint': '#7b88a1', frame: '#b8c2d3', note: '#e5e9f0', glow: '#5e81ac', code: '#e5e9f0',
      error: '#bf616a', 'error-bg': '#f6e2e4',
    },
    roles: {
      bronze: ['#a8613f', '#c0582a'], verdigris: ['#4f8a89', '#2f7f7e'], lapis: ['#5e81ac', '#3b67a3'],
      terracotta: ['#a8474f', '#c03a45'], porphyry: ['#8f6688', '#a54c97'], laurel: ['#6e8a52', '#5a8a2c'],
    },
  },
  darcula: {
    scheme: 'dark',
    base: {
      bg: '#313335', stage: '#2b2b2b', surface: '#3c3f41', line: '#45494a', ink: '#a9b7c6', 'ink-bright': '#dfe1e5',
      'ink-soft': '#8e98a3', 'ink-faint': '#606366', frame: '#5e6366', note: '#32373a', glow: '#cc7832', code: '#232525',
      error: '#ff6b68', 'error-bg': '#4b2b2b',
    },
    roles: {
      bronze: ['#cc7832', '#e8a35a'], verdigris: ['#6a8759', '#9bc48a'], lapis: ['#6897bb', '#9ac4e6'],
      terracotta: ['#bc3f3c', '#ff6b68'], porphyry: ['#9876aa', '#c8a2dc'], laurel: ['#bbb529', '#ffc66d'],
    },
  },
  'intellij-light': {
    scheme: 'light',
    base: {
      bg: '#f2f2f2', stage: '#ffffff', surface: '#f7f8fa', line: '#dfe1e5', ink: '#080808', 'ink-bright': '#000000',
      'ink-soft': '#505050', 'ink-faint': '#8c8c8c', frame: '#c9ccd6', note: '#fafafa', glow: '#1750eb', code: '#f0f0f0',
      error: '#d0201f', 'error-bg': '#fde8e8',
    },
    roles: {
      bronze: ['#8a6a3d', '#b07219'], verdigris: ['#067d17', '#0a9e22'], lapis: ['#0033b3', '#1750eb'],
      terracotta: ['#a33b2a', '#d0301f'], porphyry: ['#871094', '#a62bb3'], laurel: ['#5c7a1e', '#6e9a12'],
    },
  },
};

export const FAMILIES = {
  harpy: { dark: 'night', light: 'parchment' },
  gruvbox: { dark: 'gruvbox-dark', light: 'gruvbox-light' },
  solarized: { dark: 'solarized-dark', light: 'solarized-light' },
  nord: { dark: 'nord-dark', light: 'nord-light' },
  jetbrains: { dark: 'darcula', light: 'intellij-light' },
};

const familyOf = (theme) => Object.keys(FAMILIES).find((f) => Object.values(FAMILIES[f]).includes(theme));

/**
 * Resolves a theme setting into the themes to use: `{ dark, light }` (follow the system) or
 * `{ fixed }`. `value` is the element's theme attribute; `fallback` the configured default.
 * Both accept a theme name, a family name, `dark`, `light` or `auto`.
 */
export function resolveTheme(value, fallback = 'harpy') {
  const base = fallback in THEMES ? { family: familyOf(fallback), fixed: fallback } : { family: fallback in FAMILIES ? fallback : 'harpy' };
  if (fallback === 'dark' || fallback === 'light') base.fixed = FAMILIES.harpy[fallback];
  if (value in THEMES) return { fixed: value };
  if (value in FAMILIES) return { ...FAMILIES[value] };
  if (value === 'dark' || value === 'light') return { fixed: FAMILIES[base.family][value] };
  return base.fixed ? { fixed: base.fixed } : { ...FAMILIES[base.family] };
}

function declarations(name) {
  const { scheme, base, roles } = THEMES[name];
  const lines = Object.entries(base).map(([k, v]) => `--hp-${k}: ${v};`);
  for (const [role, [color, bright]] of Object.entries(roles)) lines.push(`--hp-${role}: ${color};`, `--hp-${role}-bright: ${bright};`);
  lines.push(`color-scheme: ${scheme};`);
  return lines.join(' ');
}

/** CSS defining the theme tokens on `selector` for a resolved theme. */
export function themeCSS(selector, resolved) {
  if (resolved.fixed) return `${selector} { ${declarations(resolved.fixed)} }`;
  return `${selector} { ${declarations(resolved.dark)} }
@media (prefers-color-scheme: light) { ${selector} { ${declarations(resolved.light)} } }`;
}

export const ROLES = Object.keys(THEMES.night.roles);
