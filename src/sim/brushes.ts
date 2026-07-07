import type { Field } from './field';
import { NUM_ELEMENTS } from './field';
import type { SimParams } from './config';

export type BrushKind =
  | { type: 'yang' }
  | { type: 'yin' }
  | { type: 'seed'; element: number } // 0..4 = Wood..Water
  | { type: 'still' };

export interface BrushStroke {
  kind: BrushKind;
  /** center in fine-grid coordinates */
  x: number;
  y: number;
  /** radius in fine cells (1..16 per spec 3.2) */
  radius: number;
}

function costPerSecond(kind: BrushKind, params: SimParams): number {
  switch (kind.type) {
    case 'yang':
      return params.costYang;
    case 'yin':
      return params.costYin;
    case 'seed':
      return params.costSeed;
    case 'still':
      return params.costStill;
  }
}

/**
 * Mean activity under the brush footprint — the basis of the turbulence tax
 * (spec 3.1): nudging a quiet spot is cheap, wrestling a storm is ruinous.
 */
export function localActivity(field: Field, stroke: BrushStroke): number {
  const size = field.size;
  const r = Math.ceil(stroke.radius);
  const cx = Math.round(stroke.x);
  const cy = Math.round(stroke.y);
  let sum = 0;
  let count = 0;
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      if (dx * dx + dy * dy > stroke.radius * stroke.radius) continue;
      const idx = (((cy + dy) % size + size) % size) * size + (((cx + dx) % size + size) % size);
      sum += field.activity[idx];
      count++;
    }
  }
  return count > 0 ? sum / count : 0;
}

/** Influence drained by holding this brush down for dt seconds, tax included. */
export function strokeCost(field: Field, stroke: BrushStroke, params: SimParams, dt: number): number {
  const tax = 1 + params.tau * localActivity(field, stroke);
  return costPerSecond(stroke.kind, params) * tax * dt;
}

/**
 * Apply one brush stroke for dt seconds. Smooth radial falloff
 * (cos^2-shaped) so edits blend into the field instead of stamping discs.
 */
export function applyBrush(field: Field, stroke: BrushStroke, params: SimParams, dt: number): void {
  const size = field.size;
  const r = Math.ceil(stroke.radius);
  const cx = Math.round(stroke.x);
  const cy = Math.round(stroke.y);
  const strength = params.brushStrength * dt;

  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      const d2 = dx * dx + dy * dy;
      if (d2 > stroke.radius * stroke.radius) continue;
      const idx = (((cy + dy) % size + size) % size) * size + (((cx + dx) % size + size) % size);
      const t = Math.sqrt(d2) / stroke.radius;
      const falloff = Math.cos((t * Math.PI) / 2) ** 2;
      const amount = strength * falloff;

      switch (stroke.kind.type) {
        case 'yang': {
          field.p[idx] += (1 - field.p[idx]) * amount;
          break;
        }
        case 'yin': {
          field.p[idx] += (-1 - field.p[idx]) * amount;
          break;
        }
        case 'seed': {
          const k = stroke.kind.element;
          field.w[k][idx] += amount;
          if (params.conserve === 'simplex') {
            let sum = 0;
            for (let e = 0; e < NUM_ELEMENTS; e++) sum += field.w[e][idx];
            for (let e = 0; e < NUM_ELEMENTS; e++) field.w[e][idx] /= sum;
          }
          break;
        }
        case 'still': {
          // deliberately forms a clot; capped just below 1 so the cell keeps
          // turning within (an eddy, not a dead pixel — spec's north star)
          const s = field.stillness[idx] + (1 - field.stillness[idx]) * amount;
          field.stillness[idx] = Math.min(0.98, s);
          field.v[idx] *= 1 - amount;
          break;
        }
      }
    }
  }
}
