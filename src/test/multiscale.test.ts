import { describe, expect, it } from 'vitest';
import { Multiscale, MID_EVERY, COARSE_EVERY, SCALE_FACTOR } from '../sim/multiscale';
import { NUM_ELEMENTS } from '../sim/field';
import { DEFAULT_PARAMS, type SimParams } from '../sim/config';

function paramsWith(overrides: Partial<SimParams>): SimParams {
  return { ...DEFAULT_PARAMS, ...overrides };
}

describe('multiscale coupling', () => {
  it('ticks mid every 8 fine ticks and coarse every 64 (1x / 1/8x / 1/64x)', () => {
    const params = paramsWith({ size: 64 });
    const multi = new Multiscale(params.size, 1, params);
    for (let t = 0; t < COARSE_EVERY * 2; t++) multi.tick(params);
    expect(multi.fine.tickCount).toBe(COARSE_EVERY * 2);
    expect(multi.mid.tickCount).toBe((COARSE_EVERY * 2) / MID_EVERY);
    expect(multi.coarse.tickCount).toBe(2);
  });

  it('pulls a mid cell toward the mean of its fine children (upward coupling)', () => {
    const params = paramsWith({ size: 64, upGain: 0.5 });
    const multi = new Multiscale(params.size, 1, params);

    // make the fine block under mid cell (0,0) strongly Fire
    for (let y = 0; y < SCALE_FACTOR; y++) {
      for (let x = 0; x < SCALE_FACTOR; x++) {
        const idx = y * multi.fine.size + x;
        for (let k = 0; k < NUM_ELEMENTS; k++) multi.fine.w[k][idx] = k === 1 ? 0.9 : 0.025;
      }
    }
    const before = multi.mid.w[1][0];
    for (let t = 0; t < MID_EVERY; t++) multi.tick(params); // one mid tick happens
    expect(multi.mid.w[1][0]).toBeGreaterThan(before + 0.1);
  });

  it('biases fine cells toward their parent state (downward coupling)', () => {
    const params = paramsWith({ size: 64, downGain: 0.3, upGain: 0, sigma: 0 });
    const control = paramsWith({ size: 64, downGain: 0, upGain: 0, sigma: 0 });

    const run = (p: SimParams): number => {
      const multi = new Multiscale(p.size, 1, p);
      const n = multi.mid.size * multi.mid.size;
      for (let t = 0; t < 300; t++) {
        // pin the mid grid to pure Water so the bias direction is unambiguous
        for (let idx = 0; idx < n; idx++) {
          for (let k = 0; k < NUM_ELEMENTS; k++) multi.mid.w[k][idx] = k === 4 ? 1 : 0;
        }
        multi.tick(p);
      }
      const fineN = multi.fine.size * multi.fine.size;
      let meanWater = 0;
      for (let idx = 0; idx < fineN; idx++) meanWater += multi.fine.w[4][idx];
      return meanWater / fineN;
    };

    expect(run(params)).toBeGreaterThan(run(control) + 0.05);
  });

  it('a coarse polarity reversal reshapes fine-scale weather over ~1 sim minute (M4 acceptance)', { timeout: 30000 }, () => {
    const params = paramsWith({ size: 64 });
    const multi = new Multiscale(params.size, 1, params);
    const coarseN = multi.coarse.size * multi.coarse.size;
    const fineN = multi.fine.size * multi.fine.size;

    const meanFineP = () => {
      let s = 0;
      for (let idx = 0; idx < fineN; idx++) s += multi.fine.p[idx];
      return s / fineN;
    };

    // hold the coarse grid deep Yin for one simulated minute
    const oneMinute = Math.round(60 / params.dt);
    for (let t = 0; t < oneMinute; t++) {
      for (let idx = 0; idx < coarseN; idx++) multi.coarse.p[idx] = -0.9;
      multi.tick(params);
    }
    const yinP = meanFineP();

    // now reverse the climate to deep Yang for a minute
    for (let t = 0; t < oneMinute; t++) {
      for (let idx = 0; idx < coarseN; idx++) multi.coarse.p[idx] = 0.9;
      multi.tick(params);
    }
    const yangP = meanFineP();

    expect(yinP).toBeLessThan(-0.05);
    expect(yangP).toBeGreaterThan(0.05);
    expect(yangP - yinP).toBeGreaterThan(0.2);
  });

  it('is deterministic: same seed gives identical combined hash after coupled ticks', () => {
    const params = paramsWith({ size: 64 });
    const a = new Multiscale(params.size, 7, params);
    const b = new Multiscale(params.size, 7, params);
    for (let t = 0; t < 130; t++) {
      a.tick(params);
      b.tick(params);
    }
    expect(a.stateHash()).toBe(b.stateHash());
  });
});
