import type { Field } from '../sim/field';
import { cellColor, type PaletteMode } from '../sim/color';

/**
 * One field painted at 1px/cell into an offscreen canvas — the shared
 * primitive under both the single-scale Renderer (gallery) and the
 * camera-aware SceneRenderer (main app).
 */
export class FieldLayer {
  readonly canvas: HTMLCanvasElement;
  readonly size: number;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly imageData: ImageData;

  constructor(size: number) {
    this.size = size;
    this.canvas = document.createElement('canvas');
    this.canvas.width = size;
    this.canvas.height = size;
    const ctx = this.canvas.getContext('2d');
    if (!ctx) throw new Error('2d context unavailable');
    this.ctx = ctx;
    this.imageData = ctx.createImageData(size, size);
  }

  update(field: Field, paletteMode: PaletteMode = 'elemental'): void {
    const n = field.size * field.size;
    const data = this.imageData.data;
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
    this.ctx.putImageData(this.imageData, 0, 0);
  }
}
