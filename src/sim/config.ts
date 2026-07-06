// Central param registry — every tunable constant in the spec lives here so
// the dev panel and the sweep harness can both read/write a single source of truth.

export type Conserve = 'simplex' | 'unbounded';
export type Neighborhood = 'vonNeumann' | 'moore';

export interface SimParams {
  size: number; // grid is size x size, torus wraparound

  // element (wuxing) dynamics
  alpha: number; // generation strength
  beta: number; // overcoming (suppression) strength
  mu: number; // diffusion
  delta: number; // uniform decay
  eps: number; // reignition floor so extinct phases can recover
  sigma: number; // noise floor amplitude

  // yin-yang oscillator (unused while polarity is held at 0 in milestone 1,
  // wired up now so milestone 2 doesn't need a data-model change)
  gamma: number;
  kappa: number;
  lambda: number;
  eta: number;
  aBar: number;

  dt: number;
  conserve: Conserve;
  neighborhood: Neighborhood;
  seed: number;
}

export const DEFAULT_PARAMS: SimParams = {
  size: 128,

  alpha: 1.0,
  beta: 0.9,
  mu: 0.15,
  delta: 0.05,
  eps: 0.01,
  sigma: 0.002,

  gamma: 2.0,
  kappa: 1.5,
  lambda: 0.3,
  eta: 0.4,
  aBar: 0.02,

  dt: 1 / 30,
  conserve: 'simplex',
  neighborhood: 'vonNeumann',
  seed: 1,
};

export const PARAM_RANGES: Record<
  keyof Omit<SimParams, 'conserve' | 'neighborhood' | 'seed' | 'size'>,
  { min: number; max: number; step: number }
> = {
  alpha: { min: 0, max: 3, step: 0.01 },
  beta: { min: 0, max: 3, step: 0.01 },
  mu: { min: 0, max: 1, step: 0.005 },
  delta: { min: 0, max: 0.5, step: 0.005 },
  eps: { min: 0, max: 0.1, step: 0.001 },
  sigma: { min: 0, max: 0.05, step: 0.0005 },
  gamma: { min: 0, max: 5, step: 0.05 },
  kappa: { min: 0, max: 5, step: 0.05 },
  lambda: { min: 0, max: 2, step: 0.01 },
  eta: { min: 0, max: 2, step: 0.01 },
  aBar: { min: 0, max: 0.2, step: 0.001 },
  dt: { min: 1 / 120, max: 1 / 10, step: 1 / 120 },
};

export function cloneParams(p: SimParams): SimParams {
  return { ...p };
}
