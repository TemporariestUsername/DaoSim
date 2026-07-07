import type { Field } from '../sim/field';
import type { PaletteMode } from '../sim/color';
import { paintFieldPixels } from './paintField';

/**
 * One field painted at 1px/cell into an offscreen canvas — the shared
 * primitive under both the single-scale Renderer (gallery) and the
 * camera-aware SceneRenderer (main app). Pixels can come from a local
 * Field (update) or from a buffer painted in the sim worker (setPixels).
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
    paintFieldPixels(field, this.imageData.data, paletteMode);
    this.ctx.putImageData(this.imageData, 0, 0);
  }

  setPixels(data: Uint8ClampedArray): void {
    if (data.length !== this.size * this.size * 4) return;
    this.imageData.data.set(data);
    this.ctx.putImageData(this.imageData, 0, 0);
  }
}
