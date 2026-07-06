import { describe, expect, it } from 'vitest';
import { Field, NUM_ELEMENTS } from '../sim/field';
import { DEFAULT_PARAMS, type SimParams } from '../sim/config';

function paramsWith(overrides: Partial<SimParams>): SimParams {
  return { ...DEFAULT_PARAMS, ...overrides };
}

describe('conservation', () => {
  it('keeps weights normalized (sum to 1) under simplex conserve, even at parameter extremes', () => {
    const params = paramsWith({
      size: 16,
      alpha: 3,
      beta: 3,
      mu: 1,
      delta: 0.5,
      eps: 0.1,
      sigma: 0.05,
      conserve: 'simplex',
    });
    const field = new Field(params.size, 123);
    for (let t = 0; t < 300; t++) field.tick(params);

    const n = params.size * params.size;
    for (let idx = 0; idx < n; idx++) {
      let sum = 0;
      for (let k = 0; k < NUM_ELEMENTS; k++) {
        const wk = field.w[k][idx];
        expect(Number.isFinite(wk)).toBe(true);
        expect(wk).toBeGreaterThanOrEqual(0);
        sum += wk;
      }
      expect(sum).toBeCloseTo(1, 5);
    }
  });

  it('never produces NaN/Infinity under unbounded conserve at parameter extremes', () => {
    // Unbounded mode relies on delta as the growth ceiling (spec 1.1): decay
    // must be able to match generation, so push mu/eps/sigma to their range
    // extremes but keep alpha/beta/delta in the regime the mode is meant for
    // rather than one engineered to diverge (alpha >> delta with no simplex
    // clamp is unbounded growth by construction, not a numerical bug).
    const params = paramsWith({
      size: 16,
      alpha: 1,
      beta: 1,
      mu: 1,
      delta: 1,
      eps: 0.1,
      sigma: 0.05,
      conserve: 'unbounded',
    });
    const field = new Field(params.size, 456);
    for (let t = 0; t < 300; t++) field.tick(params);

    const n = params.size * params.size;
    for (let idx = 0; idx < n; idx++) {
      for (let k = 0; k < NUM_ELEMENTS; k++) {
        expect(Number.isFinite(field.w[k][idx])).toBe(true);
        expect(field.w[k][idx]).toBeGreaterThanOrEqual(0);
      }
    }
  });
});

describe('determinism', () => {
  it('produces an identical state hash for two runs from the same seed', () => {
    const params = paramsWith({ size: 32 });
    const a = new Field(params.size, 7);
    const b = new Field(params.size, 7);
    for (let t = 0; t < 500; t++) {
      a.tick(params);
      b.tick(params);
    }
    expect(a.stateHash()).toBe(b.stateHash());
  });

  it('produces a different state hash for two different seeds', () => {
    const params = paramsWith({ size: 32 });
    const a = new Field(params.size, 7);
    const b = new Field(params.size, 8);
    for (let t = 0; t < 500; t++) {
      a.tick(params);
      b.tick(params);
    }
    expect(a.stateHash()).not.toBe(b.stateHash());
  });
});

describe('torus wraparound', () => {
  function shiftCyclic(field: Field, dx: number, dy: number): Field {
    const size = field.size;
    const shifted = new Field(size, 1);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const srcIdx = y * size + x;
        const dstIdx = ((y + dy + size) % size) * size + ((x + dx + size) % size);
        for (let k = 0; k < NUM_ELEMENTS; k++) shifted.w[k][dstIdx] = field.w[k][srcIdx];
        shifted.p[dstIdx] = field.p[srcIdx];
        shifted.v[dstIdx] = field.v[srcIdx];
      }
    }
    return shifted;
  }

  it('is translation invariant: shifting the field then ticking equals ticking then shifting', () => {
    const params = paramsWith({ size: 8, sigma: 0 }); // no noise -> exact comparison
    const original = new Field(params.size, 99);
    const shiftedBefore = shiftCyclic(original, 3, 2);

    original.tick(params);
    shiftedBefore.tick(params);

    const tickedThenShifted = shiftCyclic(original, 3, 2);

    const n = params.size * params.size;
    for (let idx = 0; idx < n; idx++) {
      for (let k = 0; k < NUM_ELEMENTS; k++) {
        expect(shiftedBefore.w[k][idx]).toBeCloseTo(tickedThenShifted.w[k][idx], 6);
      }
      expect(shiftedBefore.p[idx]).toBeCloseTo(tickedThenShifted.p[idx], 6);
    }
  });
});

describe('yin-yang polarity oscillator', () => {
  it('keeps p clamped to [-1, 1] even under strong forcing', () => {
    const params = paramsWith({ size: 16, gamma: 20, kappa: 0.01, eta: 0.01, aBar: 0 });
    const field = new Field(params.size, 5);
    const n = params.size * params.size;
    let minP = Infinity;
    let maxP = -Infinity;
    let allFiniteV = true;
    for (let t = 0; t < 1000; t++) {
      field.tick(params);
      for (let idx = 0; idx < n; idx++) {
        if (field.p[idx] < minP) minP = field.p[idx];
        if (field.p[idx] > maxP) maxP = field.p[idx];
        if (!Number.isFinite(field.v[idx])) allFiniteV = false;
      }
    }
    expect(minP).toBeGreaterThanOrEqual(-1);
    expect(maxP).toBeLessThanOrEqual(1);
    expect(allFiniteV).toBe(true);
  });

  it('moves p away from the initial 0 once activity drives it (the field is not statically frozen)', () => {
    const params = paramsWith({ size: 32 });
    const field = new Field(params.size, 3);
    for (let t = 0; t < 500; t++) field.tick(params);

    const n = params.size * params.size;
    let meanAbsP = 0;
    for (let idx = 0; idx < n; idx++) meanAbsP += Math.abs(field.p[idx]);
    meanAbsP /= n;
    expect(meanAbsP).toBeGreaterThan(0.001);
  });
});
