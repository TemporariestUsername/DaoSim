import type { Field } from './field';
import { computeTheta } from './metrics';
import { mulberry32, type Rng } from './rng';

function wrapAngle(d: number): number {
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return d;
}

function wrapCoord(v: number, size: number): number {
  v %= size;
  return v < 0 ? v + size : v;
}

/**
 * A few thousand motes advected along the spatial gradient of theta — the
 * phase of each cell's position on the Wood->Fire->Earth->Metal->Water
 * circle — so the direction waves travel is visible, not just the pattern
 * itself (spec 4). Positions live in fine-grid coordinates (0..size).
 */
export class ParticleSystem {
  readonly x: Float32Array;
  readonly y: Float32Array;
  readonly size: number;
  private readonly theta: Float32Array;
  private rng: Rng;

  constructor(size: number, count: number, seed: number) {
    this.size = size;
    this.x = new Float32Array(count);
    this.y = new Float32Array(count);
    this.theta = new Float32Array(size * size);
    this.rng = mulberry32((seed ^ 0x9e3779b9) >>> 0);
    for (let i = 0; i < count; i++) {
      this.x[i] = this.rng() * size;
      this.y[i] = this.rng() * size;
    }
  }

  get count(): number {
    return this.x.length;
  }

  step(field: Field, speed: number, dt: number): void {
    const size = this.size;
    const theta = computeTheta(field, this.theta);
    const { x, y, rng } = this;

    for (let i = 0; i < x.length; i++) {
      const cx = Math.floor(x[i]) % size;
      const cy = Math.floor(y[i]) % size;
      const rightIdx = cy * size + ((cx + 1) % size);
      const leftIdx = cy * size + ((cx - 1 + size) % size);
      const downIdx = ((cy + 1) % size) * size + cx;
      const upIdx = ((cy - 1 + size) % size) * size + cx;

      const gx = wrapAngle(theta[rightIdx] - theta[leftIdx]) / 2;
      const gy = wrapAngle(theta[downIdx] - theta[upIdx]) / 2;

      let nx = x[i] + gx * speed * dt;
      let ny = y[i] + gy * speed * dt;

      // a flat gradient (no wave to ride) lets a mote drift on tiny residual
      // noise forever — reseed it elsewhere so the layer keeps reading as flow.
      if (gx * gx + gy * gy < 1e-8) {
        nx = rng() * size;
        ny = rng() * size;
      }

      x[i] = wrapCoord(nx, size);
      y[i] = wrapCoord(ny, size);
    }
  }
}
