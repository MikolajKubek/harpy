// Builds the self-contained bundles in dist/:
//   harpy.min.js         classic script: <script src="harpy.min.js"></script> (works from file:// too)
//   harpy.esm.min.js     ES module:      import { configure } from './harpy.esm.min.js'
//   harpy.min.js.b64     the classic script in base64, for <script src="data:text/javascript;base64,...">
//   embed-example.html   a page that embeds the base64 build and renders without fetching any code

import { build } from 'esbuild';
import { readFile, writeFile, mkdir } from 'node:fs/promises';

const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url)));
const banner = `/*! Harpy ${pkg.version} | step-by-step diagrams in Mermaid syntax | https://github.com/MikolajKubek/harpy */`;
const common = {
  entryPoints: ['src/bundle.js'],
  bundle: true,
  minify: true,
  target: 'es2022',
  legalComments: 'eof',
  charset: 'ascii', // escape non-ASCII so the file works whatever charset it is served with
  banner: { js: banner },
  logLevel: 'warning',
};

await mkdir('dist', { recursive: true });
await build({ ...common, format: 'iife', globalName: 'Harpy', outfile: 'dist/harpy.min.js' });
await build({ ...common, format: 'esm', outfile: 'dist/harpy.esm.min.js' });

const script = await readFile('dist/harpy.min.js');
const b64 = script.toString('base64');
await writeFile('dist/harpy.min.js.b64', b64);

const example = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Harpy embedded</title>
  <style>body { margin: 0; padding: 32px 16px; background: #0f0a17; } harpy-diagram { max-width: 960px; margin: 0 auto; }</style>
</head>
<body>
  <!-- The whole library, embedded: no request is made for any code. -->
  <script src="data:text/javascript;base64,${b64}"></script>

  <harpy-diagram>
    <script type="text/harpy">
      # Embedded, offline

      \`\`\`harpy
      flowchart LR
      %% @step one "Write"
        subgraph Author
          A[Mermaid syntax] --> S[Steps + Markdown]
        end
      %% @step two "Read"
        S --> R([Reader])
      \`\`\`

      ## one
      This page carries Harpy inside a \`data:\` URI, so it works from disk without a network.

      ## two
      Web fonts are still requested; without them Harpy falls back to system serif fonts.
    </script>
  </harpy-diagram>
</body>
</html>
`;
await writeFile('dist/embed-example.html', example);

const kb = (n) => `${(n / 1024).toFixed(0)} KB`;
const esm = await readFile('dist/harpy.esm.min.js');
console.log(`dist/harpy.min.js       ${kb(script.length)}`);
console.log(`dist/harpy.esm.min.js   ${kb(esm.length)}`);
console.log(`dist/harpy.min.js.b64   ${kb(b64.length)}`);
console.log(`dist/embed-example.html ${kb(example.length)}`);
