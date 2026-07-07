import { Field, NUM_ELEMENTS } from './field';
import type { SimParams } from './config';

/** Fine cells per mid cell, and mid cells per coarse cell (per axis). */
export const SCALE_FACTOR = 4;
/** Fine ticks per mid tick / per coarse tick (spec 2: 1x, 1/8x, 1/64x). */
export const MID_EVERY = 8;
export const COARSE_EVERY = 64;

export type ScaleName = 'fine' | 'mid' | 'coarse';

/**
 * Pull each parent cell toward the mean of its 4x4 child block (upward
 * coupling, spec 2). A linear blend of simplex points stays on the simplex,
 * so no renormalization is needed.
 */
function pullUp(parent: Field, child: Field, gain: number): void {
  const ps = parent.size;
  const cs = child.size;
  for (let py = 0; py < ps; py++) {
    for (let px = 0; px < ps; px++) {
      const pIdx = py * ps + px;
      let meanP = 0;
      const meanW = [0, 0, 0, 0, 0];
      for (let dy = 0; dy < SCALE_FACTOR; dy++) {
        for (let dx = 0; dx < SCALE_FACTOR; dx++) {
          const cIdx = (py * SCALE_FACTOR + dy) * cs + (px * SCALE_FACTOR + dx);
          meanP += child.p[cIdx];
          for (let k = 0; k < NUM_ELEMENTS; k++) meanW[k] += child.w[k][cIdx];
        }
      }
      const inv = 1 / (SCALE_FACTOR * SCALE_FACTOR);
      for (let k = 0; k < NUM_ELEMENTS; k++) {
        parent.w[k][pIdx] += (meanW[k] * inv - parent.w[k][pIdx]) * gain;
      }
      parent.p[pIdx] += (meanP * inv - parent.p[pIdx]) * gain;
    }
  }
}

/**
 * Bias each child cell toward its parent's state (downward coupling,
 * spec 2): dw += down_gain * (parent_w - w) * dt, same for p. The coarse
 * scale is climate, the fine scale is weather — the gain is small.
 */
function biasDown(child: Field, parent: Field, gainW: number, gainP: number, dt: number): void {
  const cs = child.size;
  const ps = parent.size;
  const gw = gainW * dt;
  const gp = gainP * dt;
  for (let cy = 0; cy < cs; cy++) {
    const py = (cy / SCALE_FACTOR) | 0;
    for (let cx = 0; cx < cs; cx++) {
      const pIdx = py * ps + ((cx / SCALE_FACTOR) | 0);
      const cIdx = cy * cs + cx;
      for (let k = 0; k < NUM_ELEMENTS; k++) {
        child.w[k][cIdx] += (parent.w[k][pIdx] - child.w[k][cIdx]) * gw;
      }
      child.p[cIdx] += (parent.p[pIdx] - child.p[cIdx]) * gp;
    }
  }
}

/**
 * Three grids running the same rules at different sizes and tempos
 * (spec 2). Each scale gets a distinct PRNG stream; mid and coarse tick
 * with the same dt but 8x / 64x less often, so their dynamics unfold
 * proportionally slower — patterns echo across scales instead of racing.
 */
export class Multiscale {
  readonly fine: Field;
  readonly mid: Field;
  readonly coarse: Field;

  private readonly midParams: SimParams;
  private readonly coarseParams: SimParams;

  constructor(size: number, seed: number, params: SimParams) {
    if (size % (SCALE_FACTOR * SCALE_FACTOR) !== 0) {
      throw new Error(`multiscale size must be divisible by ${SCALE_FACTOR * SCALE_FACTOR}`);
    }
    this.fine = new Field(size, seed);
    this.mid = new Field(size / SCALE_FACTOR, seed + 101);
    this.coarse = new Field(size / (SCALE_FACTOR * SCALE_FACTOR), seed + 202);
    this.midParams = { ...params, size: this.mid.size };
    this.coarseParams = { ...params, size: this.coarse.size };
  }

  field(scale: ScaleName): Field {
    return scale === 'fine' ? this.fine : scale === 'mid' ? this.mid : this.coarse;
  }

  tick(params: SimParams): void {
    this.fine.tick(params);
    // the downward bias is constant — every fine tick, both stages — so a
    // coarse reversal drags mid then fine with a ~1/downGain time constant
    // per level rather than being throttled by the slower tick schedules
    biasDown(this.fine, this.mid, params.downGain, params.downGainP, params.dt);
    biasDown(this.mid, this.coarse, params.downGain, params.downGainP, params.dt);

    if (this.fine.tickCount % MID_EVERY === 0) {
      pullUp(this.mid, this.fine, params.upGain);
      Object.assign(this.midParams, params);
      this.midParams.size = this.mid.size;
      this.mid.tick(this.midParams);

      if (this.fine.tickCount % COARSE_EVERY === 0) {
        pullUp(this.coarse, this.mid, params.upGain);
        Object.assign(this.coarseParams, params);
        this.coarseParams.size = this.coarse.size;
        this.coarse.tick(this.coarseParams);
      }
    }
  }

  reseed(seed: number): void {
    this.fine.reseed(seed);
    this.mid.reseed(seed + 101);
    this.coarse.reseed(seed + 202);
  }

  stateHash(): string {
    return `${this.fine.stateHash()}-${this.mid.stateHash()}-${this.coarse.stateHash()}`;
  }
}
