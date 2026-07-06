import type { Field } from '../sim/field';
import { cellColor, type PaletteMode } from '../sim/color';

/**
 * Draws the field to a fine offscreen buffer at 1px/cell, then lets the
 * browser's bilinear upscale do the smoothing when compositing to the
 * visible canvas — "river, not mosaic" (spec section 4): the grid must
 * never read as discrete tiles.
 */
export class Renderer {
  private readonly offscreen: HTMLCanvasElement;
  private readonly offCtx: CanvasRenderingContext2D;
  private imageData: ImageData;
  private readonly visible: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;

  constructor(visible: HTMLCanvasElement, size: number) {
    this.visible = visible;
    const ctx = visible.getContext('2d');
    if (!ctx) throw new Error('2d context unavailable');
    this.ctx = ctx;
    this.ctx.imageSmoothingEnabled = true;
    this.ctx.imageSmoothingQuality = 'high';

    this.offscreen = document.createElement('canvas');
    this.offscreen.width = size;
    this.offscreen.height = size;
    const offCtx = this.offscreen.getContext('2d');
    if (!offCtx) throw new Error('2d context unavailable');
    this.offCtx = offCtx;
    this.imageData = this.offCtx.createImageData(size, size);
  }

  draw(field: Field, paletteMode: PaletteMode = 'elemental'): void {
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
    this.offCtx.putImageData(this.imageData, 0, 0);

    const { width, height } = this.visible;
    this.ctx.clearRect(0, 0, width, height);
    this.ctx.drawImage(this.offscreen, 0, 0, field.size, field.size, 0, 0, width, height);
  }

  resize(width: number, height: number): void {
    this.visible.width = width;
    this.visible.height = height;
    this.ctx.imageSmoothingEnabled = true;
    this.ctx.imageSmoothingQuality = 'high';
  }
}
