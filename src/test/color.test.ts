import { describe, expect, it } from 'vitest';
import { cellColor } from '../sim/color';
import { NUM_ELEMENTS } from '../sim/field';

// Viénot (1999) deuteranopia projection in linear RGB — the spec's
// accessibility bar (section 4): every element pair must stay separable
// when the red-green axis collapses; hue is never the sole channel.
function toLinear(c: number): number {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
}

function deuteranope(rgb: [number, number, number]): [number, number, number] {
  const R = toLinear(rgb[0]);
  const G = toLinear(rgb[1]);
  const B = toLinear(rgb[2]);
  return [0.625 * R + 0.375 * G, 0.7 * R + 0.3 * G, 0.3 * G + 0.7 * B];
}

describe('palette accessibility', () => {
  it('keeps every element pair separable under a deuteranopia projection', () => {
    const colors: Array<[number, number, number]> = [];
    for (let k = 0; k < NUM_ELEMENTS; k++) {
      const w = [0.05, 0.05, 0.05, 0.05, 0.05];
      w[k] = 0.8;
      colors.push(cellColor(w, 0));
    }
    for (let a = 0; a < NUM_ELEMENTS; a++) {
      for (let b = a + 1; b < NUM_ELEMENTS; b++) {
        const da = deuteranope(colors[a]);
        const db = deuteranope(colors[b]);
        const dist = Math.hypot(da[0] - db[0], da[1] - db[1], da[2] - db[2]);
        expect(dist, `pair ${a}-${b}`).toBeGreaterThan(0.09);
      }
    }
  });
});
