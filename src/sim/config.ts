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

  // yin-yang reversal-principle oscillator (spec 1.3)
  gamma: number;
  kappa: number;
  lambda: number;
  eta: number;
  aBar: number;

  dt: number;
  conserve: Conserve;
  neighborhood: Neighborhood;
  seed: number;

  // flow-visualization layer (spec 4)
  particleCount: number;
  particleSpeed: number;
  trailFade: number;
  showParticles: boolean;
  showTrails: boolean;

  // fractal structure: three coupled scales (spec 2)
  upGain: number; // blend of parent toward mean of children, per parent tick
  downGain: number; // per-tick bias of child element weights toward parent
  downGainP: number; // per-tick bias of child polarity toward parent

  // restraint economy (spec 3)
  influenceRegen: number; // r: influence per second while still
  tau: number; // turbulence tax: cost x (1 + tau * local activity)
  stillDecay: number; // per-second erosion of Still-brush clots
  brushStrength: number; // how hard brushes push per second at falloff peak
  costYang: number; // influence per second of use
  costYin: number;
  costSeed: number;
  costStill: number;
}

export const DEFAULT_PARAMS: SimParams = {
  size: 128,

  alpha: 1.0,
  beta: 0.9,
  mu: 0.15,
  delta: 0.05,
  eps: 0.01,
  sigma: 0.002,

  // gamma/eta/aBar tuned from the spec's suggested starting point (2.0/0.4/0.02):
  // at the literal defaults the oscillator settles to a static Yang-leaning fixed
  // point instead of breathing (aBar sat well below this field's natural activity
  // level, ~0.03, and stronger damping never let it overshoot). These values were
  // empirically verified to produce sustained, slow-crossing local oscillation.
  gamma: 3.0,
  kappa: 1.5,
  lambda: 0.3,
  eta: 0.1,
  aBar: 0.03,

  dt: 1 / 30,
  conserve: 'simplex',
  neighborhood: 'vonNeumann',
  seed: 1,

  particleCount: 3000,
  particleSpeed: 6,
  trailFade: 0.9,
  showParticles: true,
  showTrails: true,

  // downGain (elements) stays at the spec's suggested 0.05 so fine texture
  // keeps its own life; downGainP (polarity) is tuned much higher because
  // the upward mean-pull at upGain 0.3 per mid tick (~1.1/s effective) would
  // otherwise drown the downward whisper entirely — and a coarse Yin-Yang
  // reversal dragging the fine weather with it is the whole point of the
  // fractal layer (spec 2 / milestone 4 acceptance).
  upGain: 0.3,
  downGain: 0.05,
  downGainP: 0.4,

  influenceRegen: 4,
  tau: 8,
  // slow enough that a fully-charged Still stroke leaves a clot that outlives
  // the stroke by ~15-20 s — long enough to watch waves bend around it (and
  // for Field Notes to recognize it) before it erodes
  stillDecay: 0.08,
  brushStrength: 2.5,
  costYang: 8,
  costYin: 8,
  costSeed: 15,
  costStill: 25,
};

export const PARAM_RANGES: Record<
  keyof Omit<
    SimParams,
    'conserve' | 'neighborhood' | 'seed' | 'size' | 'showParticles' | 'showTrails' | 'particleCount'
  >,
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
  particleSpeed: { min: 0, max: 30, step: 0.5 },
  trailFade: { min: 0, max: 0.99, step: 0.01 },
  upGain: { min: 0, max: 1, step: 0.01 },
  downGain: { min: 0, max: 0.5, step: 0.005 },
  downGainP: { min: 0, max: 1, step: 0.01 },
  influenceRegen: { min: 0, max: 20, step: 0.5 },
  tau: { min: 0, max: 40, step: 0.5 },
  stillDecay: { min: 0.01, max: 1, step: 0.01 },
  brushStrength: { min: 0.1, max: 10, step: 0.1 },
  costYang: { min: 0, max: 60, step: 1 },
  costYin: { min: 0, max: 60, step: 1 },
  costSeed: { min: 0, max: 60, step: 1 },
  costStill: { min: 0, max: 60, step: 1 },
};

export function cloneParams(p: SimParams): SimParams {
  return { ...p };
}
