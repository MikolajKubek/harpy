// End-to-end smoke test: serves the repo, opens examples/index.html in Chromium and steps
// through both diagrams. Needs network access (dagre, fonts and marked load from CDNs).
//
//   npm run test:e2e                       # uses Playwright's bundled browser
//   CHROMIUM_PATH=/path/to/chrome npm run test:e2e
//   SCREENSHOTS=/some/dir npm run test:e2e # also save screenshots

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const root = fileURLToPath(new URL('../..', import.meta.url));
const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.md': 'text/markdown' };

const server = createServer(async (req, res) => {
  const path = normalize(join(root, decodeURIComponent(new URL(req.url, 'http://x').pathname)));
  if (!path.startsWith(root)) return res.writeHead(403).end();
  try {
    const body = await readFile(path);
    res.writeHead(200, { 'content-type': types[extname(path)] ?? 'application/octet-stream' }).end(body);
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const shots = process.env.SCREENSHOTS;
let failed = false;

async function check(name, fn) {
  try {
    await fn();
    console.log(`ok - ${name}`);
  } catch (e) {
    failed = true;
    console.log(`not ok - ${name}\n  ${e.stack?.split('\n').slice(0, 3).join('\n  ')}`);
  }
}

try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto(`${base}/examples/index.html`);
  await page.waitForFunction(() => [...document.querySelectorAll('harpy-diagram')].every((d) => d.shadowRoot.querySelector('.svg-host svg') && d.steps.length));

  // Unit states, read from the classes the player puts on each unit's elements.
  const state = (index) =>
    page.evaluate((i) => {
      const d = document.querySelectorAll('harpy-diagram')[i];
      const units = new Map();
      for (const el of d.shadowRoot.querySelectorAll('[data-unit]')) {
        const s = el.classList.contains('hd-hidden') ? 'hidden' : el.classList.contains('hd-past') ? 'past' : el.classList.contains('hd-current') ? 'current' : 'shown';
        units.set(el.dataset.unit, s);
      }
      const count = (s) => [...units.values()].filter((v) => v === s).length;
      return {
        step: d.step,
        hidden: count('hidden'), past: count('past'), current: count('current'), shown: count('shown'), total: units.size,
        currentUnits: [...units].filter(([, v]) => v === 'current').map(([k]) => k),
        counter: d.shadowRoot.querySelector('.counter').textContent,
        title: d.shadowRoot.querySelector('.step-title').textContent,
        description: d.shadowRoot.querySelector('.description').textContent.trim(),
        warnings: d.shadowRoot.querySelector('.status').textContent,
        error: d.shadowRoot.querySelector('.error').textContent,
      };
    }, index);

  await check('flowchart: steps and summary', async () => {
    const steps = await page.evaluate(() => document.querySelector('#checkout').steps.map((s) => s.id));
    assert.deepEqual(steps, ['browse', 'pay', 'persist', 'ship', 'summary']);
  });

  await check('flowchart: step 1 shows only its own units', async () => {
    await page.locator('#checkout').scrollIntoViewIfNeeded();
    await page.waitForFunction(() => document.querySelector('#checkout').shadowRoot.querySelector('[data-unit="node:U"]:not(.hd-hidden)'));
    const s = await state(0);
    assert.equal(s.error, '');
    assert.equal(s.warnings, '');
    assert.equal(s.counter, 'Step I of IV');
    assert.equal(s.title, 'In the browser');
    assert.match(s.description, /storefront/);
    assert.equal(s.total - s.hidden, 4, JSON.stringify(s)); // Storefront group, Customer, edge, Cart
    assert.equal(s.past, 0);
  });
  if (shots) {
    await page.waitForTimeout(1200);
    await page.locator('#checkout').screenshot({ path: `${shots}/flow-1.png` });
  }

  await check('flowchart: focus glows, new units stay bright, earlier ones dim', async () => {
    await page.locator('#checkout').evaluate((d) => d.next());
    const s = await state(0);
    assert.equal(s.step, 1);
    assert.deepEqual(s.currentUnits, ['node:P']);
    assert.equal(s.past, 4, JSON.stringify(s));
    assert.ok(s.shown >= 6, JSON.stringify(s)); // the rest of the order service step
  });

  await check('flowchart: keyboard navigation reaches the summary, which shows everything', async () => {
    await page.locator('#checkout').focus();
    await page.keyboard.press('End');
    const s = await state(0);
    assert.equal(s.counter, 'Summary');
    assert.equal(s.shown, s.total);
    assert.match(s.description, /Three teams/);
    await page.keyboard.press('ArrowLeft');
    const back = await state(0);
    assert.equal(back.title, 'Fulfilment');
    assert.ok(back.hidden === 0 && back.past > 0 && back.current > 0, JSON.stringify(back));
  });

  await check('sequence: boxes, participants and messages appear step by step', async () => {
    const d = page.locator('harpy-diagram').nth(1);
    await d.scrollIntoViewIfNeeded();
    await page.waitForFunction(() => document.querySelectorAll('harpy-diagram')[1].shadowRoot.querySelector('[data-unit="actor:U"]:not(.hd-hidden)'));
    const s0 = await state(1);
    assert.equal(s0.error, '');
    assert.equal(s0.warnings, '');
    assert.ok(['group:box-1', 'group:box-2', 'actor:U', 'actor:A', 'actor:D'].every((u) => s0.currentUnits.includes(u)), JSON.stringify(s0));
    await d.evaluate((el) => el.next());
    const s1 = await state(1);
    assert.deepEqual(s1.currentUnits.sort(), ['actor:A', 'actor:D']);
    await d.evaluate((el) => el.next());
    const s2 = await state(1);
    assert.ok(s0.hidden > s1.hidden && s1.hidden > s2.hidden && s2.hidden === 0, JSON.stringify([s0, s1, s2]));
  });
  if (shots) {
    await page.waitForTimeout(1200);
    await page.locator('harpy-diagram').nth(1).screenshot({ path: `${shots}/sequence-split.png` });
  }

  await check('mode switch, live editing and errors with line numbers', async () => {
    const d = page.locator('#checkout');
    await d.locator('.modes button[data-mode="split"]').click();
    assert.equal(await d.getAttribute('mode'), 'split');
    assert.ok(await d.locator('textarea').isVisible());
    await d.evaluate((el) => el.goTo('browse'));
    await d.locator('textarea').evaluate((t) => {
      t.value = t.value.replace('[Cart]', '[Basket]');
      t.dispatchEvent(new Event('input'));
    });
    await page.waitForFunction(() => document.querySelector('#checkout').shadowRoot.querySelector('svg.hd')?.textContent.includes('Basket'));
    assert.equal(await d.evaluate((el) => el.step), 0, 'stays on the same step after editing');
    await d.locator('textarea').evaluate((t) => {
      t.value = t.value.replace('C --> P', 'C --> ');
      t.dispatchEvent(new Event('input'));
    });
    await page.waitForFunction(() => document.querySelector('#checkout').shadowRoot.querySelector('.error').textContent);
    assert.match(await d.evaluate((el) => el.shadowRoot.querySelector('.error').textContent), /^Line 8: Expected a node after the edge/);
    assert.ok(await d.evaluate((el) => !!el.shadowRoot.querySelector('svg.hd')), 'keeps the last good render');
    await d.locator('.modes button[data-mode="preview"]').click();
    assert.ok(!(await d.locator('textarea').isVisible()));
  });

  await check('no page errors', async () => {
    assert.deepEqual(errors, [], errors.join("\n"));
  });

  if (shots) {
    const mobile = await browser.newPage({ viewport: { width: 390, height: 900 }, colorScheme: 'dark' });
    await mobile.goto(`${base}/examples/index.html`);
    await mobile.waitForFunction(() => document.querySelectorAll('harpy-diagram')[1]?.shadowRoot.querySelector('svg'));
    await mobile.waitForTimeout(2500);
    await mobile.screenshot({ path: `${shots}/mobile-dark.png`, fullPage: true });
  }
} finally {
  await browser.close();
  server.close();
}
process.exit(failed ? 1 : 0);
