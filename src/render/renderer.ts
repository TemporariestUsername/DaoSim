import type { Field } from '../sim/field';
import { cellColor, type PaletteMode } from '../sim/color';
import type { ParticleSystem } from '../sim/particles';

export interface CursorRing {
  /** center in fine-grid coordinates */
  x: number;
  y: number;
  /** radius in fine cells */
  radius: number;
}

export interface DrawOptions {
  paletteMode?: PaletteMode;
  particles?: ParticleSystem | null;
  showParticles?: boolean;
  showTrails?: boolean;
  trailFade?: number;
  /** brush footprint indicator; null when observing */
  cursor?: CursorRing | null;
}

/**
 * Draws the field to a fine offscreen buffer at 1px/cell, then lets the
 * browser's bilinear upscale do the smoothing when compositing to the
 * visible canvas — "river, not mosaic" (spec section 4): the grid must
 * never read as discrete tiles. A separate particle layer (spec 4's
 * flow-visualization motes) is composited on top; it persists across
 * frames and only fades (rather than clears) when trails are enabled, so
 * motion leaves a whisper of a trail.
 */
// Motes are drawn on a supersampled canvas relative to the field grid so a
// 1x1px dot reads as a small fleck rather than a full smoothed-out cell —
// "faint drifting motes" (spec 4), not blobs the size of the pattern itself.
const PARTICLE_SUPERSAMPLE = 4;

export class Renderer {
  private readonly offscreen: HTMLCanvasElement;
  private readonly offCtx: CanvasRenderingContext2D;
  private imageData: ImageData;
  private readonly visible: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly particleCanvas: HTMLCanvasElement;
  private readonly particleCtx: CanvasRenderingContext2D;
  private readonly particleScale: number;

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

    this.particleScale = PARTICLE_SUPERSAMPLE;
    this.particleCanvas = document.createElement('canvas');
    this.particleCanvas.width = size * this.particleScale;
    this.particleCanvas.height = size * this.particleScale;
    const particleCtx = this.particleCanvas.getContext('2d');
    if (!particleCtx) throw new Error('2d context unavailable');
    this.particleCtx = particleCtx;
  }

  draw(field: Field, options: DrawOptions = {}): void {
    const {
      paletteMode = 'elemental',
      particles = null,
      showParticles = true,
      showTrails = true,
      trailFade = 0.9,
      cursor = null,
    } = options;

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

    if (particles && showParticles) {
      this.drawParticles(particles, showTrails, trailFade);
      this.ctx.drawImage(
        this.particleCanvas,
        0,
        0,
        this.particleCanvas.width,
        this.particleCanvas.height,
        0,
        0,
        width,
        height,
      );
    }

    if (cursor) {
      // grid -> screen: the field is stretched to fill the whole canvas
      const sx = width / field.size;
      const sy = height / field.size;
      this.ctx.strokeStyle = 'rgba(255,255,255,0.5)';
      this.ctx.lineWidth = 1.5;
      this.ctx.beginPath();
      this.ctx.ellipse(cursor.x * sx, cursor.y * sy, cursor.radius * sx, cursor.radius * sy, 0, 0, Math.PI * 2);
      this.ctx.stroke();
    }
  }

  private drawParticles(particles: ParticleSystem, showTrails: boolean, trailFade: number): void {
    const w = this.particleCanvas.width;
    const h = this.particleCanvas.height;
    const ctx = this.particleCtx;

    if (showTrails) {
      ctx.globalCompositeOperation = 'destination-out';
      ctx.fillStyle = `rgba(0,0,0,${1 - trailFade})`;
      ctx.fillRect(0, 0, w, h);
      ctx.globalCompositeOperation = 'source-over';
    } else {
      ctx.clearRect(0, 0, w, h);
    }

    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    const { x, y } = particles;
    const scale = this.particleScale;
    for (let i = 0; i < x.length; i++) {
      ctx.fillRect(x[i] * scale, y[i] * scale, 1, 1);
    }
  }

  resize(width: number, height: number): void {
    this.visible.width = width;
    this.visible.height = height;
    this.ctx.imageSmoothingEnabled = true;
    this.ctx.imageSmoothingQuality = 'high';
  }
}
