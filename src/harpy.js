// Harpy: step-by-step diagrams in Mermaid syntax, drawn by Harpy's own renderer.
//
//   <script type="module" src="harpy/src/harpy.js"></script>
//   <harpy-diagram> <script type="text/harpy"> ... </script> </harpy-diagram>

import { HarpyDiagram } from './component.js';
import { configureDeps } from './deps.js';
import { configureMarkdown } from './markdown.js';

export { HarpyDiagram };
export { parseDocument } from './source.js';
export { parseDiagram } from './diagram/index.js';

/**
 * Overrides dependency loading, e.g. to self-host:
 *   configure({ dagreUrl, dagre, fonts, markedUrl, purifyUrl, renderMarkdown })
 * `fonts: false` skips loading web fonts (the page then supplies them, or fallbacks are used).
 */
export function configure(options = {}) {
  configureDeps(options);
  configureMarkdown(options);
}

if (!customElements.get('harpy-diagram')) customElements.define('harpy-diagram', HarpyDiagram);
