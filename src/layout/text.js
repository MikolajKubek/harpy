// Text measurement and wrapping. In the browser text is measured with a canvas using the same
// font stack the SVG renders with; elsewhere (tests) an average-width estimate is used.

export const FONTS = {
  label: { family: '"EB Garamond", Garamond, Georgia, serif', size: 15, weight: 400, lineHeight: 20 },
  small: { family: '"EB Garamond", Garamond, Georgia, serif', size: 14, weight: 400, lineHeight: 19, style: 'italic' },
  caps: { family: 'Cinzel, "Trajan Pro", Georgia, serif', size: 10.5, weight: 600, lineHeight: 14, letterSpacing: 1.9 },
  number: { family: '"EB Garamond", Garamond, Georgia, serif', size: 11.5, weight: 500, lineHeight: 14 },
};

export function fontString(font) {
  return `${font.style ?? 'normal'} ${font.weight} ${font.size}px ${font.family}`;
}

/** Creates a measure(text, font) => width function. */
export function createMeasurer() {
  const canvas = typeof document !== 'undefined' ? document.createElement('canvas') : null;
  const ctx = canvas?.getContext?.('2d');
  const cache = new Map();
  return (text, font = FONTS.label) => {
    const key = `${fontString(font)}|${text}`;
    let w = cache.get(key);
    if (w === undefined) {
      if (ctx) {
        ctx.font = fontString(font);
        w = ctx.measureText(text).width;
      } else {
        w = text.length * font.size * 0.5;
      }
      w += (font.letterSpacing ?? 0) * text.length;
      cache.set(key, w);
    }
    return w;
  };
}

/**
 * Splits text into lines: explicit newlines first, then word wrapping at maxWidth.
 * @returns {{ lines: string[], width: number, height: number }}
 */
export function layoutText(text, measure, font = FONTS.label, maxWidth = Infinity) {
  const lines = [];
  for (const para of String(text ?? '').split('\n')) {
    const words = para.split(/\s+/).filter(Boolean);
    if (!words.length) {
      lines.push('');
      continue;
    }
    let line = words[0];
    for (const word of words.slice(1)) {
      const candidate = `${line} ${word}`;
      if (measure(candidate, font) > maxWidth) {
        lines.push(line);
        line = word;
      } else {
        line = candidate;
      }
    }
    lines.push(line);
  }
  while (lines.length > 1 && lines.at(-1) === '') lines.pop();
  const width = Math.max(0, ...lines.map((l) => measure(l, font)));
  return { lines, width, height: lines.length * font.lineHeight, font };
}
