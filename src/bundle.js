// Entry point for the self-contained builds in dist/: Harpy with dagre, marked and DOMPurify
// bundled in, so diagrams render without fetching any code at runtime.

import dagre from '@dagrejs/dagre';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import { configure } from './harpy.js';

configure({ dagre, renderMarkdown: (md) => DOMPurify.sanitize(marked.parse(md, { async: false })) });

export * from './harpy.js';
