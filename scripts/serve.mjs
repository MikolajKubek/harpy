// A minimal static file server for scripts and tests that drive pages in a browser.
//   const { url, close } = await serve(rootDir);

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.md': 'text/markdown' };

export async function serve(root) {
  const server = createServer(async (req, res) => {
    let path = normalize(join(root, decodeURIComponent(new URL(req.url, 'http://x').pathname)));
    if (path.endsWith('/')) path += 'index.html';
    if (!path.startsWith(root)) return res.writeHead(403).end();
    try {
      const body = await readFile(path);
      res.writeHead(200, { 'content-type': TYPES[extname(path)] ?? 'application/octet-stream' }).end(body);
    } catch {
      res.writeHead(404).end();
    }
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  return { url: `http://127.0.0.1:${server.address().port}`, close: () => server.close() };
}
