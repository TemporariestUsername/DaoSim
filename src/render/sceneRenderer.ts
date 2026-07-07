import { SCALE_FACTOR, type ScaleName } from '../sim/multiscale';
import type { WorkerFrame } from '../sim/workerTypes';
import { FieldLayer } from './fieldLayer';

/**
 * Camera over the torus world. Coordinates are in fine-grid ("world")
 * cells; `span` is how many world cells are visible across the viewport
 * width, so smaller span = zoomed in.
 */
export interface Camera {
  x: number;
  y: number;
  span: number;
}

export const MIN_SPAN = 8;
export const MAX_SPAN = 512;

// Render-source crossfade thresholds (spec 2): zooming out past the point
// where the fine grid stops resolving, the view hands over to the mid grid,
// then the coarse grid — the same kind of field, one level up.
const FINE_FULL = 128; // fine fully opaque at or below this span
const FINE_GONE = 208; // fine fully faded by this span
const MID_FULL = 320;
const MID_GONE = 448;

function fadeOut(span: number, full: number, gone: number): number {
  if (span <= full) return 1;
  if (span >= gone) return 0;
  return 1 - (span - full) / (gone - full);
}

/** Which scale's grid the brushes act on at this zoom level (spec 3.2). */
export function brushScaleForSpan(span: number): ScaleName {
  if (span <= (FINE_FULL + FINE_GONE) / 2) return 'fine';
  if (span <= (MID_FULL + MID_GONE) / 2) return 'mid';
  return 'coarse';
}

export interface SceneDrawOptions {
  showParticles?: boolean;
  showTrails?: boolean;
  trailFade?: number;
  /** brush footprint: center in world cells, radius in world cells */
  cursor?: { x: number; y: number; radius: number } | null;
}

const PARTICLE_SUPERSAMPLE = 4;

/**
 * Composites the three scale layers (painted in the sim worker) through
 * the camera with torus wrap tiling and the zoom crossfade, plus the
 * particle layer and brush cursor. Pure view: no sim state lives here.
 */
export class SceneRenderer {
  private readonly visible: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly fineLayer: FieldLayer;
  private readonly midLayer: FieldLayer;
  private readonly coarseLayer: FieldLayer;
  private readonly particleCanvas: HTMLCanvasElement;
  private readonly particleCtx: CanvasRenderingContext2D;
  /** world extent = fine grid size */
  private readonly world: number;

  constructor(visible: HTMLCanvasElement, fineSize: number) {
    this.visible = visible;
    const ctx = visible.getContext('2d');
    if (!ctx) throw new Error('2d context unavailable');
    this.ctx = ctx;
    this.world = fineSize;
    this.fineLayer = new FieldLayer(fineSize);
    this.midLayer = new FieldLayer(fineSize / SCALE_FACTOR);
    this.coarseLayer = new FieldLayer(fineSize / (SCALE_FACTOR * SCALE_FACTOR));

    this.particleCanvas = document.createElement('canvas');
    this.particleCanvas.width = fineSize * PARTICLE_SUPERSAMPLE;
    this.particleCanvas.height = fineSize * PARTICLE_SUPERSAMPLE;
    const pctx = this.particleCanvas.getContext('2d');
    if (!pctx) throw new Error('2d context unavailable');
    this.particleCtx = pctx;
  }

  resize(width: number, height: number): void {
    this.visible.width = width;
    this.visible.height = height;
  }

  drawFrame(frame: WorkerFrame, camera: Camera, options: SceneDrawOptions = {}): void {
    const { showParticles = true, showTrails = true, trailFade = 0.9, cursor = null } = options;

    const { width, height } = this.visible;
    const ctx = this.ctx;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    const fineAlpha = fadeOut(camera.span, FINE_FULL, FINE_GONE);
    const midAlpha = fadeOut(camera.span, MID_FULL, MID_GONE);

    ctx.clearRect(0, 0, width, height);

    // painter's order, coarse under mid under fine; skip fully hidden layers
    if (midAlpha < 1) {
      this.coarseLayer.setPixels(new Uint8ClampedArray(frame.coarse));
      this.drawTiled(this.coarseLayer.canvas, camera, 1);
    }
    if (fineAlpha < 1 && midAlpha > 0) {
      this.midLayer.setPixels(new Uint8ClampedArray(frame.mid));
      this.drawTiled(this.midLayer.canvas, camera, midAlpha);
    }
    if (fineAlpha > 0) {
      this.fineLayer.setPixels(new Uint8ClampedArray(frame.fine));
      this.drawTiled(this.fineLayer.canvas, camera, fineAlpha);
    }

    if (showParticles && fineAlpha > 0 && frame.particleCount > 0) {
      this.paintParticles(new Float32Array(frame.particles), frame.particleCount, showTrails, trailFade);
      // motes are fine-scale detail: they fade out with the fine layer
      this.drawTiled(this.particleCanvas, camera, 0.9 * fineAlpha);
    }

    if (cursor) {
      const scale = width / camera.span;
      const left = camera.x - camera.span / 2;
      const top = camera.y - (camera.span * height) / width / 2;
      // nearest wrapped copy of the cursor center to the camera center
      let wx = cursor.x;
      let wy = cursor.y;
      const w = this.world;
      if (wx - camera.x > w / 2) wx -= w;
      if (camera.x - wx > w / 2) wx += w;
      if (wy - camera.y > w / 2) wy -= w;
      if (camera.y - wy > w / 2) wy += w;
      ctx.strokeStyle = 'rgba(255,255,255,0.5)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc((wx - left) * scale, (wy - top) * scale, cursor.radius * scale, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  /** Draw a full-world layer through the camera, tiling for torus wrap. */
  private drawTiled(source: HTMLCanvasElement, camera: Camera, alpha: number): void {
    const { width, height } = this.visible;
    const ctx = this.ctx;
    const w = this.world;
    const scale = width / camera.span;
    const spanY = camera.span * (height / width);
    const left = camera.x - camera.span / 2;
    const top = camera.y - spanY / 2;
    const destSize = w * scale;

    ctx.globalAlpha = alpha;
    const oxMin = Math.floor(left / w) * w;
    const oyMin = Math.floor(top / w) * w;
    for (let oy = oyMin; oy < top + spanY; oy += w) {
      for (let ox = oxMin; ox < left + camera.span; ox += w) {
        const dx = (ox - left) * scale;
        const dy = (oy - top) * scale;
        if (dx > width || dy > height || dx + destSize < 0 || dy + destSize < 0) continue;
        ctx.drawImage(source, 0, 0, source.width, source.height, dx, dy, destSize, destSize);
      }
    }
    ctx.globalAlpha = 1;
  }

  private paintParticles(xy: Float32Array, count: number, showTrails: boolean, trailFade: number): void {
    const cw = this.particleCanvas.width;
    const ch = this.particleCanvas.height;
    const ctx = this.particleCtx;

    if (showTrails) {
      ctx.globalCompositeOperation = 'destination-out';
      ctx.fillStyle = `rgba(0,0,0,${1 - trailFade})`;
      ctx.fillRect(0, 0, cw, ch);
      ctx.globalCompositeOperation = 'source-over';
    } else {
      ctx.clearRect(0, 0, cw, ch);
    }

    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    for (let i = 0; i < count; i++) {
      ctx.fillRect(xy[i * 2] * PARTICLE_SUPERSAMPLE, xy[i * 2 + 1] * PARTICLE_SUPERSAMPLE, 1, 1);
    }
  }
}

/** SCALE_FACTOR re-export for brush coordinate mapping in main. */
export { SCALE_FACTOR };
