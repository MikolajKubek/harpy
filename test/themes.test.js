import { test } from 'node:test';
import assert from 'node:assert/strict';
import { THEMES, FAMILIES, ROLES, resolveTheme, themeCSS } from '../src/themes.js';

test('every theme defines the same tokens and roles', () => {
  const keys = Object.keys(THEMES.night.base).sort();
  for (const [name, t] of Object.entries(THEMES)) {
    assert.deepEqual(Object.keys(t.base).sort(), keys, name);
    assert.deepEqual(Object.keys(t.roles), ROLES, name);
    assert.ok(t.scheme === 'dark' || t.scheme === 'light', name);
  }
});

test('families pair a dark and a light theme', () => {
  for (const [name, f] of Object.entries(FAMILIES)) {
    assert.equal(THEMES[f.dark].scheme, 'dark', name);
    assert.equal(THEMES[f.light].scheme, 'light', name);
  }
});

test('resolveTheme', () => {
  assert.deepEqual(resolveTheme(null), { dark: 'night', light: 'parchment' });
  assert.deepEqual(resolveTheme('auto', 'gruvbox'), { dark: 'gruvbox-dark', light: 'gruvbox-light' });
  assert.deepEqual(resolveTheme('dark'), { fixed: 'night' });
  assert.deepEqual(resolveTheme('light', 'nord'), { fixed: 'nord-light' });
  assert.deepEqual(resolveTheme('light', 'darcula'), { fixed: 'intellij-light' });
  assert.deepEqual(resolveTheme(null, 'darcula'), { fixed: 'darcula' });
  assert.deepEqual(resolveTheme(null, 'light'), { fixed: 'parchment' });
  assert.deepEqual(resolveTheme('solarized', 'darcula'), { dark: 'solarized-dark', light: 'solarized-light' });
  assert.deepEqual(resolveTheme('gruvbox-light', 'nord'), { fixed: 'gruvbox-light' });
  assert.deepEqual(resolveTheme('nonsense', 'nope'), { dark: 'night', light: 'parchment' });
});

test('themeCSS follows the system only for a pair', () => {
  assert.match(themeCSS(':host', { dark: 'night', light: 'parchment' }), /prefers-color-scheme: light/);
  assert.doesNotMatch(themeCSS(':host', { fixed: 'darcula' }), /prefers-color-scheme/);
});
