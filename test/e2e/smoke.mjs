// End-to-end smoke test: serves the repo, opens examples/index.html in Chromium and steps
// through both diagrams. Needs network access (Mermaid and marked load from a CDN).
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

  // Visibility of each unit, read from the classes Player puts on bound SVG elements.
  const state = (index) =>
    page.evaluate((i) => {
      const d = document.querySelectorAll('harpy-diagram')[i];
      const els = [...d.shadowRoot.querySelectorAll('.harpy-el')];
      const count = (cls) => els.filter((e) => e.classList.contains(cls)).length;
      return {
        step: d.step,
        hidden: count('harpy-hidden'),
        dim: count('harpy-dim'),
        focus: count('harpy-focus'),
        total: els.length,
        counter: d.shadowRoot.querySelector('.counter').textContent,
        title: d.shadowRoot.querySelector('.step-title').textContent,
        description: d.shadowRoot.querySelector('.description').textContent.trim(),
        warnings: d.shadowRoot.querySelector('.status').textContent,
        error: d.shadowRoot.querySelector('.error').textContent,
      };
    }, index);

  await check('flowchart: steps and summary', async () => {
    const steps = await page.evaluate(() => document.querySelector('#checkout').steps.map((s) => s.id));
    assert.deepEqual(steps, ['cart', 'pay', 'outcome', 'ship', 'summary']);
  });

  await check('flowchart: step 1 shows only the first nodes', async () => {
    const s = await state(0);
    assert.equal(s.error, '');
    assert.equal(s.warnings, '');
    assert.equal(s.counter, 'Step 1 of 4');
    assert.equal(s.title, 'Filling the cart');
    assert.match(s.description, /session storage/);
    // Customer, Cart and the edge (path + no label) are visible; everything else is hidden.
    assert.equal(s.total - s.hidden, 3, JSON.stringify(s));
    assert.equal(s.dim, 0);
  });
  if (shots) {
    await page.waitForTimeout(900);
    await page.locator('#checkout').screenshot({ path: `${shots}/flow-1.png` });
  }

  await check('flowchart: next reveals more, dims earlier elements, highlights focus', async () => {
    await page.locator('#checkout').evaluate((d) => d.next());
    const s = await state(0);
    assert.equal(s.step, 1);
    assert.equal(s.total - s.hidden, 5, JSON.stringify(s));
    assert.equal(s.focus, 1); // focus=P
    assert.ok(s.dim >= 3, JSON.stringify(s));
  });

  await check('flowchart: keyboard navigation reaches the summary, which shows everything', async () => {
    await page.locator('#checkout').focus();
    await page.keyboard.press('End');
    const s = await state(0);
    assert.equal(s.counter, 'Summary');
    assert.equal(s.hidden, 0);
    assert.equal(s.dim, 0);
    assert.match(s.description, /stateless/);
    await page.keyboard.press('ArrowLeft');
    const back = await state(0);
    assert.equal(back.title, 'Fulfilment');
    assert.ok(back.hidden === 0 && back.dim > 0, JSON.stringify(back));
  });
  if (shots) {
    await page.waitForTimeout(800);
    await page.locator('#checkout').screenshot({ path: `${shots}/flow-4.png` });
  }

  await check('sequence: messages appear step by step, block appears with its first line', async () => {
    const d = page.locator('harpy-diagram').nth(1);
    const s0 = await state(1);
    assert.equal(s0.error, '');
    assert.equal(s0.warnings, '');
    const s1 = await (await d.evaluate((el) => el.next()), state(1));
    const s2 = await (await d.evaluate((el) => el.next()), state(1));
    assert.ok(s0.hidden > s1.hidden && s1.hidden > s2.hidden && s2.hidden === 0, JSON.stringify([s0, s1, s2]));
    assert.equal(s1.focus, 3); // focus=D: participant box, lifeline and bottom box
  });
  if (shots) {
    await page.waitForTimeout(800);
    await page.locator('harpy-diagram').nth(1).screenshot({ path: `${shots}/sequence-split.png` });
  }

  await check('mode switch and live editing', async () => {
    const d = page.locator('#checkout');
    await d.locator('.modes button[data-mode="split"]').click();
    assert.equal(await d.getAttribute('mode'), 'split');
    assert.ok(await d.locator('textarea').isVisible());
    await d.evaluate((el) => el.goTo('cart'));
    await d.locator('textarea').evaluate((t) => {
      t.value = t.value.replace('[Cart]', '[Basket]');
      t.dispatchEvent(new Event('input'));
    });
    await page.waitForFunction(() => document.querySelector('#checkout').shadowRoot.querySelector('svg')?.textContent.includes('Basket'));
    assert.equal(await d.evaluate((el) => el.step), 0, 'stays on the same step after editing');
    await d.locator('textarea').evaluate((t) => {
      t.value = t.value.replace('C --> P', 'C --> --> P');
      t.dispatchEvent(new Event('input'));
    });
    await page.waitForFunction(() => document.querySelector('#checkout').shadowRoot.querySelector('.error').textContent);
    assert.ok(await d.evaluate((el) => !!el.shadowRoot.querySelector('svg')), 'keeps the last good render');
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
