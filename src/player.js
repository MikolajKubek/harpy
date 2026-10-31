// Applies a step's visual state to a rendered diagram.
//
// Each unit (node, edge, message...) is hidden until the step that introduces it. On the
// current step new units animate in, units from earlier steps are dimmed, and units listed in
// `focus=` are highlighted. The final, summary step shows the whole diagram undimmed.

const STAGGER_MS = 110;
const MAX_STAGGER_MS = 1400;
const DRAW_MS = 550;

function reducedMotion() {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export class Player {
  /**
   * @param {Map<string, {els: Element[], draw: SVGGeometryElement[]}>} bindings
   * @param {{ units: string[], focus: string[]|null, show: string[], hide: string[] }[]} plan
   *   one entry per step (the summary step is implicit and comes after the last one)
   * @param {{ dim?: boolean }} options
   */
  constructor(bindings, plan, { dim = true } = {}) {
    this.bindings = bindings;
    this.plan = plan;
    this.dim = dim;
    this.index = -1;
    this.revealAt = new Map();
    this.hideAt = new Map();
    this.enterOrder = plan.map(() => []);

    plan.forEach((step, i) => {
      for (const u of [...step.units, ...step.show]) {
        if (!this.revealAt.has(u) || this.revealAt.get(u) > i) this.revealAt.set(u, i);
      }
      for (const u of step.hide) if (!this.hideAt.has(u)) this.hideAt.set(u, i);
    });
    for (const [u, i] of this.revealAt) this.enterOrder[i].push(u);
    plan.forEach((step, i) => {
      const order = [...step.show, ...step.units];
      this.enterOrder[i].sort((a, b) => order.indexOf(a) - order.indexOf(b));
    });

    // Start with everything hidden, without fading out what Mermaid just drew.
    instantly(this._allElements(), (el) => el.classList.add('harpy-el', 'harpy-hidden'));
  }

  _allElements() {
    return [...this.bindings.values()].flatMap((b) => b.els);
  }

  /** Number of steps including the summary (when there is at least one step). */
  get length() {
    return this.plan.length ? this.plan.length + 1 : 0;
  }

  isSummary(index) {
    return index >= this.plan.length;
  }

  go(index, { animate = true } = {}) {
    const forward = index === this.index + 1;
    const summary = this.isSummary(index);
    const step = this.plan[index];
    const fresh = summary ? [] : this.enterOrder[index];
    const focus = new Set(summary ? [] : step.focus ?? []);
    const motion = animate && forward && !reducedMotion();
    const apply = [];

    for (const [unit, { els, draw }] of this.bindings) {
      const reveal = this.revealAt.get(unit) ?? -1;
      const hide = this.hideAt.get(unit) ?? Infinity;
      const visible = summary || (reveal <= index && hide > index);
      const isNew = !summary && reveal === index;
      const focused = focus.has(unit);
      const dimmed = !summary && this.dim && visible && !isNew && !focused && (focus.size > 0 || fresh.length > 0);

      const order = fresh.indexOf(unit);
      const delay = motion && isNew ? Math.min(order * STAGGER_MS, MAX_STAGGER_MS) : 0;
      for (const el of els) {
        apply.push([el, () => {
          el.style.transitionDelay = delay ? `${delay}ms` : '';
          el.classList.toggle('harpy-hidden', !visible);
          el.classList.toggle('harpy-dim', dimmed);
          el.classList.toggle('harpy-focus', visible && focused);
          el.classList.toggle('harpy-new', isNew);
        }]);
      }
      for (const el of draw) {
        for (const a of el.getAnimations?.() ?? []) a.cancel();
        if (motion && isNew) drawIn(el, delay);
      }
    }
    if (animate) for (const [, fn] of apply) fn();
    else instantly(apply.map(([el]) => el), (el, i) => apply[i][1]());
    this.index = index;
  }
}

/** Applies class changes with CSS transitions suppressed, so the new state shows immediately. */
function instantly(els, fn) {
  els.forEach((el) => (el.style.transition = 'none'));
  els.forEach(fn);
  if (els.length) els[0].getBoundingClientRect(); // commit the styles before re-enabling transitions
  els.forEach((el) => (el.style.transition = ''));
}

function drawIn(el, delay) {
  let length;
  try {
    length = el.getTotalLength();
  } catch {
    return;
  }
  if (!length || !el.animate) return;
  el.animate(
    [
      { strokeDasharray: `${length} ${length}`, strokeDashoffset: `${length}` },
      { strokeDasharray: `${length} ${length}`, strokeDashoffset: '0' },
    ],
    { duration: DRAW_MS, delay, easing: 'cubic-bezier(.4,0,.2,1)', fill: 'backwards' },
  );
}
