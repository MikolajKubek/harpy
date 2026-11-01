// Records the checkout example stepping through into docs/assets/demo.gif for the README.
// Needs network access (CDN deps and fonts) and ImageMagick's `convert`.
//
//   node scripts/readme-gif.mjs
//   CHROMIUM_PATH=/path/to/chrome THEME=light node scripts/readme-gif.mjs

import { createServer } from 'node:http';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { extname, join, normalize } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = fileURLToPath(new URL('..', import.meta.url));
const out = join(root, 'docs/assets/demo.gif');
const theme = process.env.THEME || 'dark';
const types = { '.html': 'text/html', '.js': 'text/javascript', '.md': 'text/markdown' };

const server = createServer(async (req, res) => {
  const path = normalize(join(root, decodeURIComponent(new URL(req.url, 'http://x').pathname)));
  if (!path.startsWith(root)) return res.writeHead(403).end();
  try {
    res.writeHead(200, { 'content-type': types[extname(path)] ?? 'application/octet-stream' }).end(await readFile(path));
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const dir = await mkdtemp(join(tmpdir(), 'harpy-gif-'));
try {
  const page = await browser.newPage({ viewport: { width: 1000, height: 900 }, deviceScaleFactor: 1 });
  await page.goto(`http://127.0.0.1:${server.address().port}/examples/index.html`);
  await page.waitForFunction(() => document.querySelector('#checkout')?.shadowRoot?.querySelector('.svg-host svg'));
  const el = page.locator('#checkout');
  await el.evaluate((d, t) => d.setAttribute('theme', t), theme);
  await page.evaluate(() => document.fonts.ready);

  const count = await el.evaluate((d) => d.steps.length);
  const frames = [];
  for (let i = 0; i < count; i++) {
    await el.evaluate((d, i) => d.goTo(i), i);
    await page.waitForTimeout(1200); // let draw-in transitions finish
    const file = join(dir, `${String(i).padStart(2, '0')}.png`);
    await el.screenshot({ path: file });
    frames.push(file);
  }

  // 2.5 s per step, 4 s on the summary, looping forever.
  const args = ['-loop', '0'];
  frames.forEach((f, i) => args.push('-delay', i === frames.length - 1 ? '400' : '250', f));
  execFileSync('convert', [...args, '-layers', 'Optimize', out]);
  console.log(`wrote ${out} (${frames.length} frames)`);
} finally {
  await browser.close();
  server.close();
  await rm(dir, { recursive: true, force: true });
}
