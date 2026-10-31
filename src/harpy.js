// Harpy: step-by-step animated Mermaid diagrams.
//
//   <script type="module" src="harpy/src/harpy.js"></script>
//   <harpy-diagram> <script type="text/harpy"> ... </script> </harpy-diagram>

import { HarpyDiagram } from './component.js';
import { configureMermaid } from './mermaid-adapter.js';
import { configureMarkdown } from './markdown.js';

export { HarpyDiagram };
export { parseDocument } from './source.js';

/**
 * Overrides dependency loading, e.g. to self-host:
 *   configure({ mermaidUrl, mermaid, mermaidConfig, markedUrl, purifyUrl, renderMarkdown })
 */
export function configure(options = {}) {
  configureMermaid(options);
  configureMarkdown(options);
}

if (!customElements.get('harpy-diagram')) customElements.define('harpy-diagram', HarpyDiagram);
