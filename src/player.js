// Applies a step's visual state to a rendered diagram.
//
// Units are hidden until the step that introduces them. The current step's units (or the ones
// named in focus=) glow in their bright role colour and draw themselves in; earlier units are
// dimmed. The summary step (any index past the last step) shows everything at rest.

const STAGGER_MS = 120;
const MAX_STAGGER_MS = 1500;
const STATES = ['hd-hidden', 'hd-past', 'hd-current'];

function reducedMotion() {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export class Player {
  /**
   * @param {Map<string, { els: Element[], draw: SVGPathElement[] }>} units
   * @param {{ units: string[], focus: string[]|null, show: string[], hide: string[] }[]} plan
   * @param {{ dim?: boolean }} options
   */
  constructor(units, plan, { dim = true } = {}) {
    this.units = units;
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
    plan.forEach((step, i) => {
      for (const u of [...step.show, ...step.units]) {
        if (this.revealAt.get(u) === i && !this.enterOrder[i].includes(u)) this.enterOrder[i].push(u);
      }
    });
    if (plan.length) instantly(this._elements(), (el) => el.classList.add('hd-hidden'));
  }

  _elements() {
    return [...this.units.values()].flatMap((u) => u.els);
  }

  go(index, { animate = true } = {}) {
    const summary = index >= this.plan.length;
    const forward = index === this.index + 1;
    const motion = animate && forward && !reducedMotion();
    const fresh = summary ? [] : this.enterOrder[index];
    const focus = new Set(summary ? [] : this.plan[index].focus ?? fresh);
    const updates = [];

    for (const [unit, { els, draw }] of this.units) {
      const reveal = this.revealAt.get(unit) ?? -1;
      const hide = this.hideAt.get(unit) ?? Infinity;
      const visible = summary || (reveal <= index && hide > index);
      const entering = !summary && reveal === index;
      // Focused units glow; the rest of this step's new units stay at full strength; earlier
      // units are dimmed while something in this step is being shown.
      const current = visible && !summary && focus.has(unit);
      let state = null;
      if (!visible) state = 'hd-hidden';
      else if (summary || entering) state = current ? 'hd-current' : null;
      else if (current) state = 'hd-current';
      else if (this.dim && (focus.size || fresh.length)) state = 'hd-past';
      const delay = motion && entering ? Math.min(Math.max(0, fresh.indexOf(unit)) * STAGGER_MS, MAX_STAGGER_MS) : 0;

      for (const el of els) {
        updates.push([el, () => {
          el.style.setProperty('--d', `${delay}ms`);
          el.classList.remove(...STATES);
          if (state) el.classList.add(state);
        }]);
      }
      for (const stroke of draw) {
        stroke.classList.remove('hd-drawing');
        if (motion && entering) {
          stroke.style.setProperty('--d', `${delay}ms`);
          void getComputedStyle(stroke).animationName; // restart the animation
          stroke.classList.add('hd-drawing');
        }
      }
    }
    if (animate) for (const [, fn] of updates) fn();
    else instantly(updates.map(([el]) => el), (el, i) => updates[i][1]());
    this.index = index;
  }
}

/** Applies class changes with transitions suppressed, so the state shows immediately. */
function instantly(els, fn) {
  els.forEach((el) => (el.style.transition = 'none'));
  els.forEach(fn);
  if (els.length) els[0].getBoundingClientRect();
  els.forEach((el) => (el.style.transition = ''));
}
