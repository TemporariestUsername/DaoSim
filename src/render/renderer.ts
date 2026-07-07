import type { Field } from '../sim/field';
import type { PaletteMode } from '../sim/color';
import { FieldLayer } from './fieldLayer';

/**
 * Single-scale renderer: paints the field at 1px/cell and lets the
 * browser's bilinear upscale smooth it into the visible canvas — "river,
 * not mosaic" (spec 4). Used by Gallery mode; the main app composites
 * multiple scales through SceneRenderer instead.
 */
export class Renderer {
  private readonly layer: FieldLayer;
  private readonly visible: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;

  constructor(visible: HTMLCanvasElement, size: number) {
    this.visible = visible;
    const ctx = visible.getContext('2d');
    if (!ctx) throw new Error('2d context unavailable');
    this.ctx = ctx;
    this.ctx.imageSmoothingEnabled = true;
    this.ctx.imageSmoothingQuality = 'high';
    this.layer = new FieldLayer(size);
  }

  draw(field: Field, paletteMode: PaletteMode = 'elemental'): void {
    this.layer.update(field, paletteMode);
    const { width, height } = this.visible;
    this.ctx.clearRect(0, 0, width, height);
    this.ctx.drawImage(this.layer.canvas, 0, 0, field.size, field.size, 0, 0, width, height);
  }

  resize(width: number, height: number): void {
    this.visible.width = width;
    this.visible.height = height;
    this.ctx.imageSmoothingEnabled = true;
    this.ctx.imageSmoothingQuality = 'high';
  }
}
