import type { SimParams } from './config';
import { mulberry32, type Rng } from './rng';

export const NUM_ELEMENTS = 5;
// canonical wuxing order: generation k <- k-1, overcoming k -| k-2
export const ELEMENT_NAMES = ['Wood', 'Fire', 'Earth', 'Metal', 'Water'] as const;

const VON_NEUMANN_OFFSETS: ReadonlyArray<readonly [number, number]> = [
  [0, -1],
  [0, 1],
  [-1, 0],
  [1, 0],
];

const MOORE_OFFSETS: ReadonlyArray<readonly [number, number]> = [
  [0, -1],
  [0, 1],
  [-1, 0],
  [1, 0],
  [-1, -1],
  [1, -1],
  [-1, 1],
  [1, 1],
];

/**
 * The living field: a torus grid of five element weights (SoA Float32Array
 * planes, summing to 1 per cell under 'simplex' conserve) plus a Yin-Yang
 * polarity plane and its oscillator velocity. Pure preallocated-buffer sim
 * core — no allocations inside tick().
 */
export class Field {
  readonly size: number;
  readonly w: [Float32Array, Float32Array, Float32Array, Float32Array, Float32Array];
  readonly p: Float32Array;
  readonly v: Float32Array;
  /** mean |raw dw| per cell this tick, pre-rate — used by metrics & the M2 oscillator. */
  readonly activity: Float32Array;

  private readonly nMean: [Float32Array, Float32Array, Float32Array, Float32Array, Float32Array];
  private readonly pMean: Float32Array;
  private readonly dwRaw: [Float32Array, Float32Array, Float32Array, Float32Array, Float32Array];
  private rng: Rng;
  private seed: number;
  private readonly scratchSums = new Float64Array(NUM_ELEMENTS);
  private readonly scratchNext = new Float64Array(NUM_ELEMENTS);
  tickCount = 0;

  constructor(size: number, seed: number) {
    this.size = size;
    const n = size * size;
    this.w = [
      new Float32Array(n),
      new Float32Array(n),
      new Float32Array(n),
      new Float32Array(n),
      new Float32Array(n),
    ];
    this.p = new Float32Array(n);
    this.v = new Float32Array(n);
    this.activity = new Float32Array(n);
    this.nMean = [
      new Float32Array(n),
      new Float32Array(n),
      new Float32Array(n),
      new Float32Array(n),
      new Float32Array(n),
    ];
    this.dwRaw = [
      new Float32Array(n),
      new Float32Array(n),
      new Float32Array(n),
      new Float32Array(n),
      new Float32Array(n),
    ];
    this.pMean = new Float32Array(n);
    this.seed = seed;
    this.rng = mulberry32(seed);
    this.init();
  }

  /** Reset to a fresh random field from the current seed — deterministic. */
  init(): void {
    this.rng = mulberry32(this.seed);
    const n = this.size * this.size;
    for (let idx = 0; idx < n; idx++) {
      let sum = 0;
      const vals = [0, 0, 0, 0, 0];
      for (let k = 0; k < NUM_ELEMENTS; k++) {
        const val = 0.2 + (this.rng() - 0.5) * 0.3;
        vals[k] = Math.max(0.001, val);
        sum += vals[k];
      }
      for (let k = 0; k < NUM_ELEMENTS; k++) {
        this.w[k][idx] = vals[k] / sum;
      }
      this.p[idx] = 0;
      this.v[idx] = 0;
      this.activity[idx] = 0;
    }
    this.tickCount = 0;
  }

  reseed(seed: number): void {
    this.seed = seed;
    this.init();
  }

  private neighborOffsets(neighborhood: SimParams['neighborhood']) {
    return neighborhood === 'moore' ? MOORE_OFFSETS : VON_NEUMANN_OFFSETS;
  }

  tick(params: SimParams): void {
    const { size, alpha, beta, mu, delta, eps, sigma, dt, conserve, gamma, kappa, lambda, eta, aBar } = params;
    const offsets = this.neighborOffsets(params.neighborhood);
    const invCount = 1 / offsets.length;
    const { w, p, v, nMean, pMean, dwRaw, activity, rng } = this;
    // scratch reused across cells — no per-cell allocation in the hot loop.
    const sums = this.scratchSums;
    const next = this.scratchNext;

    // pass 1: neighborhood means over the torus, read-only over old w and p.
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const idx = y * size + x;
        sums[0] = sums[1] = sums[2] = sums[3] = sums[4] = 0;
        let pSum = 0;
        for (let o = 0; o < offsets.length; o++) {
          const [dx, dy] = offsets[o];
          const nx = (x + dx + size) % size;
          const ny = (y + dy + size) % size;
          const nIdx = ny * size + nx;
          for (let k = 0; k < NUM_ELEMENTS; k++) sums[k] += w[k][nIdx];
          pSum += p[nIdx];
        }
        for (let k = 0; k < NUM_ELEMENTS; k++) nMean[k][idx] = sums[k] * invCount;
        pMean[idx] = pSum * invCount;
      }
    }

    // pass 2: reaction-diffusion + yin-yang tempo + noise floor + renormalize,
    // then the reversal-principle polarity oscillator (spec 1.3).
    const n = size * size;
    for (let idx = 0; idx < n; idx++) {
      const p0 = p[idx];
      const rate = Math.pow(2, p0); // Yang speeds the cell up, Yin slows it down
      let activitySum = 0;
      for (let k = 0; k < NUM_ELEMENTS; k++) {
        const km1 = (k + 4) % NUM_ELEMENTS;
        const km2 = (k + 3) % NUM_ELEMENTS;
        const wk = w[k][idx];
        const gen = alpha * nMean[km1][idx] * (wk + eps);
        const sup = beta * nMean[km2][idx] * wk;
        const dif = mu * (nMean[k][idx] - wk);
        const raw = gen - sup + dif - delta * wk;
        dwRaw[k][idx] = raw;
        activitySum += Math.abs(raw);
      }
      const a = activitySum / NUM_ELEMENTS; // pre-rate, so it isn't self-amplifying
      activity[idx] = a;

      let sum = 0;
      for (let k = 0; k < NUM_ELEMENTS; k++) {
        const noise = (rng() * 2 - 1) * sigma;
        let val = w[k][idx] + dwRaw[k][idx] * rate * dt + noise;
        if (val < 0) val = 0;
        next[k] = val;
        sum += val;
      }
      if (conserve === 'simplex') {
        if (sum > 1e-6) {
          for (let k = 0; k < NUM_ELEMENTS; k++) w[k][idx] = next[k] / sum;
        } else {
          for (let k = 0; k < NUM_ELEMENTS; k++) w[k][idx] = 1 / NUM_ELEMENTS;
        }
      } else {
        for (let k = 0; k < NUM_ELEMENTS; k++) w[k][idx] = next[k];
      }

      // an extreme contains the seed of its own reversal: activity above
      // baseline pushes toward yang, a cubic restoring force makes the
      // extremes unstable, and damping keeps it a relaxation oscillator.
      const dv = (gamma * (a - aBar) + lambda * (pMean[idx] - p0) - kappa * p0 * p0 * p0 - eta * v[idx]) * dt;
      const v1 = v[idx] + dv;
      v[idx] = v1;
      let p1 = p0 + v1 * dt;
      if (p1 > 1) p1 = 1;
      else if (p1 < -1) p1 = -1;
      p[idx] = p1;
    }

    this.tickCount++;
  }

  /** Cheap non-cryptographic hash of the full state, for determinism tests. */
  stateHash(): string {
    let h1 = 0x811c9dc5;
    const mix = (v: number) => {
      // quantize floats so tiny FP jitter across platforms doesn't break equality
      const q = Math.round(v * 1e6);
      h1 ^= q;
      h1 = Math.imul(h1, 0x01000193);
    };
    const n = this.size * this.size;
    for (let idx = 0; idx < n; idx++) {
      for (let k = 0; k < NUM_ELEMENTS; k++) mix(this.w[k][idx]);
      mix(this.p[idx]);
      mix(this.v[idx]);
    }
    return (h1 >>> 0).toString(16);
  }
}
