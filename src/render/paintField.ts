import type { Field } from '../sim/field';
import { cellColor, type PaletteMode } from '../sim/color';

/**
 * Paint a field into an RGBA pixel buffer at 1px/cell. Pure array math —
 * no DOM — so it runs identically on the main thread (FieldLayer) and in
 * the sim worker, which ships the finished pixels across as transferables.
 */
export function paintFieldPixels(field: Field, data: Uint8ClampedArray, paletteMode: PaletteMode = 'elemental'): void {
  const n = field.size * field.size;
  const weights: [number, number, number, number, number] = [0, 0, 0, 0, 0];
  for (let idx = 0; idx < n; idx++) {
    weights[0] = field.w[0][idx];
    weights[1] = field.w[1][idx];
    weights[2] = field.w[2][idx];
    weights[3] = field.w[3][idx];
    weights[4] = field.w[4][idx];
    const [r, g, b] = cellColor(weights, field.p[idx], paletteMode);
    const o = idx * 4;
    data[o] = r;
    data[o + 1] = g;
    data[o + 2] = b;
    data[o + 3] = 255;
  }
}
