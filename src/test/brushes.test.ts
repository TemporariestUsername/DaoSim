import { describe, expect, it } from 'vitest';
import { Field } from '../sim/field';
import { DEFAULT_PARAMS, type SimParams } from '../sim/config';
import { applyBrush, localActivity, strokeCost, type BrushStroke } from '../sim/brushes';
import { Influence, INFLUENCE_MAX } from '../sim/influence';

function paramsWith(overrides: Partial<SimParams>): SimParams {
  return { ...DEFAULT_PARAMS, ...overrides };
}

function meanUnder(field: Field, plane: Float32Array, cx: number, cy: number, r: number): number {
  let sum = 0;
  let count = 0;
  const size = field.size;
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      if (dx * dx + dy * dy > r * r) continue;
      sum += plane[(((cy + dy) % size + size) % size) * size + (((cx + dx) % size + size) % size)];
      count++;
    }
  }
  return sum / count;
}

describe('brushes', () => {
  it('yang brush pushes p toward +1 under the footprint, yin toward -1', () => {
    const params = paramsWith({ size: 32 });
    const field = new Field(params.size, 1);
    const yang: BrushStroke = { kind: { type: 'yang' }, x: 16, y: 16, radius: 5 };
    for (let i = 0; i < 30; i++) applyBrush(field, yang, params, params.dt);
    expect(meanUnder(field, field.p, 16, 16, 3)).toBeGreaterThan(0.1);

    const yin: BrushStroke = { kind: { type: 'yin' }, x: 16, y: 16, radius: 5 };
    for (let i = 0; i < 90; i++) applyBrush(field, yin, params, params.dt);
    expect(meanUnder(field, field.p, 16, 16, 3)).toBeLessThan(-0.1);
  });

  it('seed brush raises the chosen element and keeps simplex weights normalized', () => {
    const params = paramsWith({ size: 32 });
    const field = new Field(params.size, 1);
    const before = meanUnder(field, field.w[1], 16, 16, 3); // Fire
    const stroke: BrushStroke = { kind: { type: 'seed', element: 1 }, x: 16, y: 16, radius: 5 };
    for (let i = 0; i < 30; i++) applyBrush(field, stroke, params, params.dt);
    expect(meanUnder(field, field.w[1], 16, 16, 3)).toBeGreaterThan(before + 0.1);

    const idx = 16 * params.size + 16;
    let sum = 0;
    for (let k = 0; k < 5; k++) sum += field.w[k][idx];
    expect(sum).toBeCloseTo(1, 5);
  });

  it('still brush arrests local activity (clot) and the clot erodes after the brush lifts', () => {
    const params = paramsWith({ size: 32 });
    const field = new Field(params.size, 1);
    for (let t = 0; t < 100; t++) field.tick(params);

    const stroke: BrushStroke = { kind: { type: 'still' }, x: 16, y: 16, radius: 6 };
    for (let i = 0; i < 60; i++) {
      applyBrush(field, stroke, params, params.dt);
      field.tick(params);
    }
    const stillCenter = field.stillness[16 * params.size + 16];
    expect(stillCenter).toBeGreaterThan(0.5);

    // effective update rate at the clot's core is near-arrested vs. far field
    const farIdx = 2 * params.size + 2;
    expect(field.stillness[farIdx]).toBe(0);

    // erosion: with the brush lifted, stillness decays toward zero
    for (let t = 0; t < Math.ceil(30 / params.stillDecay); t++) field.tick(params);
    expect(field.stillness[16 * params.size + 16]).toBeLessThan(stillCenter / 2);
  });

  it('turbulence tax makes strokes on active regions cost more than the base rate', () => {
    const params = paramsWith({ size: 32 });
    const field = new Field(params.size, 1);
    for (let t = 0; t < 200; t++) field.tick(params); // develop real activity
    const stroke: BrushStroke = { kind: { type: 'yang' }, x: 16, y: 16, radius: 5 };
    expect(localActivity(field, stroke)).toBeGreaterThan(0);
    const cost = strokeCost(field, stroke, params, 1);
    expect(cost).toBeGreaterThan(params.costYang); // tax strictly > 1 on a living field
  });
});

describe('influence economy', () => {
  it('regenerates only while idle, with the stillness-streak ramp capped at 3x', () => {
    const params = paramsWith({});
    const inf = new Influence();
    inf.value = 0;
    inf.idle(1, params);
    expect(inf.value).toBeCloseTo(params.influenceRegen * 1, 0);

    // after a long streak the ramp approaches (but never exceeds) 3x
    inf.streak = 1e9;
    expect(inf.rampFactor()).toBeCloseTo(3, 5);
  });

  it('spend drains, resets the streak, and refuses only when empty', () => {
    const inf = new Influence();
    inf.streak = 50;
    expect(inf.spend(30)).toBe(true);
    expect(inf.value).toBe(INFLUENCE_MAX - 30);
    expect(inf.streak).toBe(0);

    // spending into 0 is allowed once; after that, brushes stop working
    expect(inf.spend(1000)).toBe(true);
    expect(inf.value).toBe(0);
    expect(inf.spend(0.01)).toBe(false);
  });
});
