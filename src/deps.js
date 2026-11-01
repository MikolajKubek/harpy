// Runtime dependencies: web fonts and dagre (flowchart layout). Both are fetched lazily and can be
// redirected or replaced with configure().

const config = {
  dagreUrl: 'https://cdn.jsdelivr.net/npm/@dagrejs/dagre@3.1.1/+esm',
  dagre: null, // a preloaded dagre module, used instead of dagreUrl when set
  fonts: 'https://fonts.googleapis.com/css2?family=Cinzel:wght@500;600&family=Cormorant+Garamond:wght@500;600&family=EB+Garamond:ital,wght@0,400;0,500;1,400&family=JetBrains+Mono:wght@400;500&display=swap',
};

export function configureDeps(options = {}) {
  for (const key of Object.keys(config)) if (key in options) config[key] = options[key];
  dagrePromise = null;
}

let dagrePromise = null;
export function loadDagre() {
  if (config.dagre) return Promise.resolve(config.dagre);
  if (!dagrePromise) {
    dagrePromise = import(config.dagreUrl).then((m) => m.default ?? m);
    dagrePromise.catch(() => (dagrePromise = null));
  }
  return dagrePromise;
}

let fontsPromise = null;
/** Adds the font stylesheet to the page once and waits (briefly) for the diagram fonts. */
export function loadFonts() {
  if (!fontsPromise) {
    let sheet = Promise.resolve();
    if (config.fonts && !document.querySelector('link[data-harpy-fonts]')) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = config.fonts;
      link.dataset.harpyFonts = '';
      sheet = new Promise((resolve) => {
        link.addEventListener('load', resolve);
        link.addEventListener('error', resolve);
      });
      document.head.append(link);
    }
    // Text is measured for layout, so the fonts must be ready before the first layout.
    const wanted = ['400 15px "EB Garamond"', 'italic 400 14px "EB Garamond"', '600 10.5px Cinzel'];
    const loaded = sheet.then(() => Promise.all(wanted.map((f) => document.fonts?.load(f).catch(() => null))));
    const timeout = new Promise((r) => setTimeout(r, 2500));
    fontsPromise = Promise.race([loaded, timeout]);
  }
  return fontsPromise;
}
