// Builds the self-contained bundles in dist/:
//   harpy.min.js         classic script: <script src="harpy.min.js"></script> (works from file:// too)
//   harpy.esm.min.js     ES module:      import { configure } from './harpy.esm.min.js'
//   harpy.min.js.b64     the classic script in base64, for <script src="data:text/javascript;base64,...">
//   embed-example.html   a page that embeds the base64 build and renders without fetching any code
//   themes/<name>/       harpy.min.js and harpy.min.js.b64 with a different default theme
// and copies harpy.min.js into docs/ for the homepage.

import { build } from 'esbuild';
import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { THEMES, FAMILIES } from '../src/themes.js';

const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url)));
const banner = `/*! Harpy ${pkg.version} | MIT License | (c) Mikołaj Kubik | step-by-step diagrams in Mermaid syntax | https://github.com/MikolajKubek/harpy
 * Bundles dagre and graphlib (MIT), marked (MIT) and DOMPurify (MPL-2.0 OR Apache-2.0); their notices follow at the end of this file. */`;

// Third-party code shipped inside the bundles, with the license files that must travel with it.
const bundled = [
  ['@dagrejs/dagre', ['LICENSE']],
  ['@dagrejs/graphlib', ['LICENSE']],
  ['marked', ['LICENSE']],
  ['dompurify', ['LICENSE']],
];
const notices = [];
for (const [name, files] of bundled) {
  const { version, license, homepage } = JSON.parse(await readFile(`node_modules/${name}/package.json`));
  const texts = await Promise.all(files.map((f) => readFile(`node_modules/${name}/${f}`, 'utf8')));
  notices.push({ license, text: `${name} ${version} | ${license} | ${homepage ?? ''}\n\n${texts.join('\n').trim()}` });
}
const rule = `\n\n${'='.repeat(78)}\n\n`;
const thirdParty = `Third-party software bundled in Harpy's dist/ builds\n\n${notices.map((n) => n.text).join(rule)}\n`;
// MIT asks for its notice in every copy, so the bundles carry the MIT texts in full. DOMPurify's
// own @license line (kept by legalComments) points to its license, as its minified builds do.
const mit = notices.filter((n) => n.license === 'MIT').map((n) => n.text).join(rule);
const footer = `/*!\n${mit.replaceAll('*/', '* /')}\n*/`;

const common = {
  entryPoints: ['src/bundle.js'],
  bundle: true,
  minify: true,
  target: 'es2022',
  legalComments: 'eof',
  charset: 'ascii', // escape non-ASCII so the file works whatever charset it is served with
  banner: { js: banner },
  footer: { js: footer },
  logLevel: 'warning',
};

await mkdir('dist', { recursive: true });
await writeFile('dist/THIRD_PARTY_LICENSES.txt', thirdParty);
await build({ ...common, format: 'iife', globalName: 'Harpy', outfile: 'dist/harpy.min.js' });
await build({ ...common, format: 'esm', outfile: 'dist/harpy.esm.min.js' });

const script = await readFile('dist/harpy.min.js');
// The homepage uses the bundle, so docs/ is self-contained and Pages can serve it from the branch.
await writeFile('docs/harpy.min.js', script);
const b64 = script.toString('base64');
await writeFile('dist/harpy.min.js.b64', b64);

// The same classic build with another default theme, one folder each, so the URL picks the look.
// dark/light are Harpy's night/parchment; families follow the system, the rest are fixed.
const variants = [
  'dark', 'light',
  ...Object.keys(FAMILIES).filter((f) => f !== 'harpy'),
  ...Object.keys(THEMES).filter((t) => !Object.values(FAMILIES.harpy).includes(t)),
];
await rm('dist/themes', { recursive: true, force: true });
for (const theme of variants) {
  const outfile = `dist/themes/${theme}/harpy.min.js`;
  await build({
    ...common,
    entryPoints: undefined,
    stdin: {
      contents: `import { configure } from './src/bundle.js';\nexport * from './src/bundle.js';\nconfigure({ theme: ${JSON.stringify(theme)} });`,
      resolveDir: '.',
      sourcefile: `harpy-${theme}.js`,
    },
    banner: { js: banner.replace(' | MIT License', ` | theme: ${theme} | MIT License`) },
    format: 'iife',
    globalName: 'Harpy',
    outfile,
  });
  await writeFile(`${outfile}.b64`, (await readFile(outfile)).toString('base64'));
}

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
console.log(`dist/themes/           ${variants.length} themes: ${variants.join(', ')}`);
