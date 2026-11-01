// Page theme toggle, shared by the site's pages. The choice is saved, and applied before first
// paint by a small inline script in each page's <head>. On pages without data-own-themes on
// <body>, diagrams follow the page theme once it has been chosen explicitly.
(() => {
  const root = document.documentElement;
  const follow = !document.body.hasAttribute('data-own-themes');
  function syncDiagramTheme() {
    if (!follow) return;
    const theme = root.dataset.theme;
    document.querySelectorAll('harpy-diagram').forEach((d) => (theme ? d.setAttribute('theme', theme) : d.removeAttribute('theme')));
  }
  document.getElementById('theme').addEventListener('click', () => {
    const current = root.dataset.theme || (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
    const next = current === 'light' ? 'dark' : 'light';
    root.dataset.theme = next;
    syncDiagramTheme();
    try { localStorage.setItem('harpy-theme', next); } catch {}
  });
  syncDiagramTheme();
})();
