import type { Field } from './field';
import { NUM_ELEMENTS } from './field';

const TWO_PI = Math.PI * 2;
const MAX_ENTROPY = Math.log(NUM_ELEMENTS);

/** Per-cell Shannon entropy of the five weights, averaged over the grid. 0 = pure phase everywhere, ln(5) = uniform 20% everywhere. */
export function meanElementEntropy(field: Field): number {
  const n = field.size * field.size;
  let total = 0;
  for (let idx = 0; idx < n; idx++) {
    let h = 0;
    for (let k = 0; k < NUM_ELEMENTS; k++) {
      const wk = field.w[k][idx];
      if (wk > 1e-9) h -= wk * Math.log(wk);
    }
    total += h;
  }
  return total / n;
}

/** Share of the globally dominant element (mean weight of the largest of the five channels). */
export function dominantElementShare(field: Field): { element: number; share: number } {
  const n = field.size * field.size;
  const meanW = [0, 0, 0, 0, 0];
  for (let idx = 0; idx < n; idx++) {
    for (let k = 0; k < NUM_ELEMENTS; k++) meanW[k] += field.w[k][idx];
  }
  let best = 0;
  for (let k = 1; k < NUM_ELEMENTS; k++) if (meanW[k] > meanW[best]) best = k;
  return { element: best, share: meanW[best] / n };
}

/** Mean activity (pre-rate |dw|) across the grid this tick — the "sustained motion" signal. */
export function meanActivity(field: Field): number {
  const n = field.size * field.size;
  let total = 0;
  for (let idx = 0; idx < n; idx++) total += field.activity[idx];
  return total / n;
}

/**
 * Phase angle of each cell on the Wood->Fire->Earth->Metal->Water circle:
 * the argument of the first discrete Fourier mode of its five weights.
 * Used for spatial-structure metrics here, and later for flow-visualization particles (spec 4).
 */
export function computeTheta(field: Field, out?: Float32Array): Float32Array {
  const n = field.size * field.size;
  const theta = out ?? new Float32Array(n);
  for (let idx = 0; idx < n; idx++) {
    let cx = 0;
    let cy = 0;
    for (let k = 0; k < NUM_ELEMENTS; k++) {
      const angle = (TWO_PI * k) / NUM_ELEMENTS;
      const wk = field.w[k][idx];
      cx += wk * Math.cos(angle);
      cy += wk * Math.sin(angle);
    }
    theta[idx] = Math.atan2(cy, cx);
  }
  return theta;
}

/**
 * Coarse spatial-autocorrelation-length estimate, in cells, of the cos/sin
 * components of theta along the x axis (torus wrap). Used to tell apart the
 * two collapse failure modes from a living field: length ~1 cell means
 * noise with no structure (over-mixed), length ~size means one frozen
 * domain (monoculture), a mid-range length means organized pattern.
 */
export function autocorrelationLength(
  field: Field,
  lags: number[] = [1, 2, 4, 8, 16, 32, 64],
  threshold = 0.5,
): number {
  const size = field.size;
  const theta = computeTheta(field);
  const n = size * size;
  const u = new Float32Array(n);
  const v = new Float32Array(n);
  let meanU = 0;
  let meanV = 0;
  for (let idx = 0; idx < n; idx++) {
    u[idx] = Math.cos(theta[idx]);
    v[idx] = Math.sin(theta[idx]);
    meanU += u[idx];
    meanV += v[idx];
  }
  meanU /= n;
  meanV /= n;
  let varU = 0;
  let varV = 0;
  for (let idx = 0; idx < n; idx++) {
    varU += (u[idx] - meanU) ** 2;
    varV += (v[idx] - meanV) ** 2;
  }
  varU /= n;
  varV /= n;
  const variance = varU + varV || 1e-9;

  const correlationAt = (lag: number): number => {
    let cov = 0;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const idx = y * size + x;
        const idx2 = y * size + ((x + lag) % size);
        cov += (u[idx] - meanU) * (u[idx2] - meanU) + (v[idx] - meanV) * (v[idx2] - meanV);
      }
    }
    return cov / n / variance;
  };

  const validLags = lags.filter((l) => l < size);
  for (const lag of validLags) {
    if (correlationAt(lag) < threshold) return lag;
  }
  return size; // stayed correlated out to the largest tested lag -> one frozen domain
}

export interface FieldSnapshot {
  tick: number;
  entropy: number;
  dominantShare: number;
  activity: number;
  autocorrelation: number;
}

export function snapshotMetrics(field: Field, includeAutocorrelation = true): FieldSnapshot {
  return {
    tick: field.tickCount,
    entropy: meanElementEntropy(field),
    dominantShare: dominantElementShare(field).share,
    activity: meanActivity(field),
    autocorrelation: includeAutocorrelation ? autocorrelationLength(field) : -1,
  };
}

export const MAX_MEAN_ENTROPY = MAX_ENTROPY;
