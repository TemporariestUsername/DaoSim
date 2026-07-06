import { Field } from '../sim/field';
import { cloneParams, DEFAULT_PARAMS, type SimParams } from '../sim/config';
import { autocorrelationLength, meanActivity, meanElementEntropy, dominantElementShare } from '../sim/metrics';

export interface SweepSample {
  tick: number;
  entropy: number;
  autocorrelation: number;
  activity: number;
  dominantShare: number;
}

export interface SweepResult {
  params: SimParams;
  score: number;
  scoreBreakdown: { autocorrelation: number; activity: number; dominant: number };
  samples: SweepSample[];
}

export interface SweepOptions {
  ticks: number;
  sampleEvery: number;
  activityFloor: number;
}

export const DEFAULT_SWEEP_OPTIONS: SweepOptions = {
  ticks: 10000,
  sampleEvery: 200,
  activityFloor: 1e-5,
};

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/**
 * Runs one parameter combination for `ticks` steps, sampling metrics along
 * the way, and scores it on the milestone-1 acceptance criteria (spec 1.4):
 * no collapse to a single element, no gray uniform stasis, sustained motion.
 * Score is a product of three [0,1] factors so any single failure mode tanks it.
 */
export function evaluateParams(params: SimParams, options: SweepOptions = DEFAULT_SWEEP_OPTIONS): SweepResult {
  const field = new Field(params.size, params.seed);
  const samples: SweepSample[] = [];

  for (let t = 0; t < options.ticks; t++) {
    field.tick(params);
    if (t % options.sampleEvery === 0 || t === options.ticks - 1) {
      samples.push({
        tick: t,
        entropy: meanElementEntropy(field),
        autocorrelation: autocorrelationLength(field),
        activity: meanActivity(field),
        dominantShare: dominantElementShare(field).share,
      });
    }
  }

  const half = samples.slice(Math.floor(samples.length / 2));
  const steadyState = half.length > 0 ? half : samples;

  const meanAutocorr = steadyState.reduce((s, x) => s + x.autocorrelation, 0) / steadyState.length;
  const normLen = meanAutocorr / params.size;
  const autocorrelationScore = 4 * normLen * (1 - normLen); // peaks at mid-range structure, 0 at either extreme

  const minActivity = Math.min(...steadyState.map((x) => x.activity));
  const activityScore = Math.min(1, minActivity / options.activityFloor);

  const finalShare = steadyState[steadyState.length - 1].dominantShare;
  const dominantScore = 1 - smoothstep(0.6, 0.95, finalShare);

  const score = autocorrelationScore * activityScore * dominantScore;

  return {
    params: cloneParams(params),
    score,
    scoreBreakdown: { autocorrelation: autocorrelationScore, activity: activityScore, dominant: dominantScore },
    samples,
  };
}

export function runSweep(paramSets: SimParams[], options: SweepOptions = DEFAULT_SWEEP_OPTIONS): SweepResult[] {
  return paramSets.map((p) => evaluateParams(p, options));
}

/** Default search space: alpha ~ beta and moderate diffusion, per spec 1.1's expected emergent behavior. */
export function generateDefaultGrid(base: SimParams = DEFAULT_PARAMS): SimParams[] {
  const alphas = [0.8, 1.0, 1.2];
  const betas = [0.7, 0.9, 1.1];
  const mus = [0.08, 0.15, 0.25];
  const grid: SimParams[] = [];
  for (const alpha of alphas) {
    for (const beta of betas) {
      for (const mu of mus) {
        grid.push({ ...base, alpha, beta, mu, size: 64 });
      }
    }
  }
  return grid;
}

export function topN(results: SweepResult[], n = 8): SweepResult[] {
  return [...results].sort((a, b) => b.score - a.score).slice(0, n);
}
