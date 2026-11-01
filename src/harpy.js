// Harpy: step-by-step diagrams in Mermaid syntax, drawn by Harpy's own renderer.
//
//   <script type="module" src="harpy/src/harpy.js"></script>
//   <harpy-diagram> <script type="text/harpy"> ... </script> </harpy-diagram>

import { HarpyDiagram, setDefaultTheme } from './component.js';
import { configureDeps } from './deps.js';
import { configureMarkdown } from './markdown.js';

export { HarpyDiagram };
export { parseDocument } from './source.js';
export { parseDiagram } from './diagram/index.js';
export { THEMES, FAMILIES } from './themes.js';

/**
 * Overrides dependency loading, e.g. to self-host:
 *   configure({ dagreUrl, dagre, fonts, markedUrl, purifyUrl, renderMarkdown })
 * `fonts: false` skips loading web fonts (the page then supplies them, or fallbacks are used).
 * `theme` sets the default for elements without a theme attribute: a family (`gruvbox`, follows
 * the system), a theme (`gruvbox-dark`), `dark` or `light`.
 */
export function configure(options = {}) {
  configureDeps(options);
  configureMarkdown(options);
  if ('theme' in options) setDefaultTheme(options.theme);
}

if (!customElements.get('harpy-diagram')) customElements.define('harpy-diagram', HarpyDiagram);
