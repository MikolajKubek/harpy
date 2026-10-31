// Markdown rendering for step descriptions. marked + DOMPurify are loaded lazily, only when a
// document actually has descriptions.

const config = {
  markedUrl: 'https://cdn.jsdelivr.net/npm/marked@18.1.1/lib/marked.esm.js',
  purifyUrl: 'https://cdn.jsdelivr.net/npm/dompurify@3.4.17/dist/purify.es.mjs',
  renderMarkdown: null, // custom (markdown) => html function; replaces marked + DOMPurify
};

let loading = null;

export function configureMarkdown(options = {}) {
  for (const key of Object.keys(config)) if (key in options) config[key] = options[key];
  loading = null;
}

function load() {
  if (!loading) {
    loading = Promise.all([import(config.markedUrl), import(config.purifyUrl)]).then(([m, p]) => {
      const marked = m.marked ?? m.default;
      const purify = p.default ?? p;
      return (md) => purify.sanitize(marked.parse(md, { async: false }));
    });
    loading.catch(() => (loading = null));
  }
  return loading;
}

/** Renders a list of Markdown strings to sanitized HTML strings. */
export async function renderMarkdownAll(sources) {
  if (!sources.some((s) => s && s.trim())) return sources.map(() => '');
  const renderer = config.renderMarkdown ?? (await load());
  return sources.map((s) => (s && s.trim() ? renderer(s) : ''));
}
