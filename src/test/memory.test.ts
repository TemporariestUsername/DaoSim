import { describe, expect, it } from 'vitest';
import { Multiscale } from '../sim/multiscale';
import { NUM_ELEMENTS } from '../sim/field';
import { DEFAULT_PARAMS, type SimParams } from '../sim/config';
import { deserializeState, peekParams, serializeState } from '../sim/serialize';
import { RegimeDetector } from '../sim/fieldNotes';
import { applyBrush } from '../sim/brushes';

function paramsWith(overrides: Partial<SimParams>): SimParams {
  return { ...DEFAULT_PARAMS, ...overrides };
}

describe('full-state serialization', () => {
  it('round-trips exactly: restored world ticks identically to the original', () => {
    const params = paramsWith({ size: 64 });
    const original = new Multiscale(params.size, 42, params);
    for (let t = 0; t < 100; t++) original.tick(params);

    const buffer = serializeState(original, params, 77.5, 12.25);

    const restored = new Multiscale(params.size, 1, params); // different seed on purpose
    const header = deserializeState(buffer, restored);
    expect(header).not.toBeNull();
    expect(header!.influence).toBeCloseTo(77.5, 4);
    expect(header!.influenceStreak).toBeCloseTo(12.25, 4);
    expect(restored.stateHash()).toBe(original.stateHash());

    // the PRNG state came along too: future ticks stay in lockstep
    for (let t = 0; t < 50; t++) {
      original.tick(params);
      restored.tick(params);
    }
    expect(restored.stateHash()).toBe(original.stateHash());
  });

  it('peekParams reads the embedded params without touching the planes', () => {
    const params = paramsWith({ size: 64, alpha: 1.23 });
    const multi = new Multiscale(params.size, 5, params);
    const buffer = serializeState(multi, params, 100, 0);
    const peeked = peekParams(buffer);
    expect(peeked).not.toBeNull();
    expect(peeked!.alpha).toBeCloseTo(1.23, 6);
    expect(peeked!.size).toBe(64);
  });

  it('rejects garbage buffers instead of corrupting the world', () => {
    const params = paramsWith({ size: 64 });
    const multi = new Multiscale(params.size, 5, params);
    const before = multi.stateHash();
    expect(deserializeState(new ArrayBuffer(16), multi)).toBeNull();
    expect(peekParams(new ArrayBuffer(16))).toBeNull();
    expect(multi.stateHash()).toBe(before);
  });
});

describe('regime detection', () => {
  it('detects a monoculture bloom, named for the flooding element', () => {
    const params = paramsWith({ size: 64 });
    const multi = new Multiscale(params.size, 1, params);
    const detector = new RegimeDetector();

    // flood the fine field with Fire
    const n = multi.fine.size * multi.fine.size;
    for (let idx = 0; idx < n; idx++) {
      for (let k = 0; k < NUM_ELEMENTS; k++) multi.fine.w[k][idx] = k === 1 ? 0.8 : 0.05;
    }
    multi.tick(params);

    let detections = detector.sample(multi, params);
    for (let i = 0; i < 6 && !detections.some((d) => d.id === 'bloom-1'); i++) {
      multi.tick(params);
      detections = detector.sample(multi, params);
    }
    expect(detections.some((d) => d.id === 'bloom-1' && d.name === 'Fire bloom')).toBe(true);
  });

  it('detects a clot after the Still brush arrests a region', () => {
    const params = paramsWith({ size: 64 });
    const multi = new Multiscale(params.size, 1, params);
    const detector = new RegimeDetector();

    // let the field come alive first, past detector warm-up
    for (let t = 0; t < 60; t++) multi.tick(params);
    for (let i = 0; i < 6; i++) detector.sample(multi, params);

    // hold a Still stroke over one spot (block-centered, as a player planting
    // a deliberate clot would; a dab straddling block corners is too diffuse
    // to register as a regime, which is fine)
    const found: string[] = [];
    for (let t = 0; t < 600; t++) {
      applyBrush(multi.fine, { kind: { type: 'still' }, x: 36, y: 36, radius: 10 }, params, params.dt);
      multi.tick(params);
      if (t % 60 === 0) found.push(...detector.sample(multi, params).map((d) => d.id));
    }
    expect(found).toContain('clot');
  });

  it('reports each regime only once', () => {
    const params = paramsWith({ size: 64 });
    const multi = new Multiscale(params.size, 1, params);
    const detector = new RegimeDetector();
    const n = multi.fine.size * multi.fine.size;
    for (let idx = 0; idx < n; idx++) {
      for (let k = 0; k < NUM_ELEMENTS; k++) multi.fine.w[k][idx] = k === 4 ? 0.8 : 0.05;
    }
    multi.tick(params);
    let total = 0;
    for (let i = 0; i < 10; i++) {
      total += detector.sample(multi, params).filter((d) => d.id === 'bloom-4').length;
      multi.tick(params);
    }
    expect(total).toBe(1);
  });
});
