// The sim worker (spec 6 threading): owns the multiscale field, particles,
// brushes, and the influence economy, and paints the RGBA layer buffers so
// the main thread only composites. Frames are request/response with buffer
// ping-pong — the main thread returns last frame's buffers for reuse.
import type { SimParams } from './config';
import { Multiscale, SCALE_FACTOR } from './multiscale';
import { ParticleSystem } from './particles';
import { Influence } from './influence';
import { applyBrush, strokeCost, type BrushStroke } from './brushes';
import { paintFieldPixels } from '../render/paintField';
import { RegimeDetector, SAMPLE_EVERY, type Detection } from './fieldNotes';
import { deserializeState, peekParams, serializeState } from './serialize';
import type { MainToWorker, WorkerToMain, FrameInput } from './workerTypes';

const post = (msg: WorkerToMain, transfer: Transferable[]) =>
  (self as unknown as { postMessage: (m: unknown, t?: Transferable[]) => void }).postMessage(msg, transfer);

let params: SimParams | null = null;
let multi: Multiscale | null = null;
let particles: ParticleSystem | null = null;
let influence = new Influence();
let accumulator = 0;
const detector = new RegimeDetector();
let pendingNotes: Detection[] = [];

function rebuild(): void {
  if (!params) return;
  multi = new Multiscale(params.size, params.seed, params);
  particles = new ParticleSystem(params.size, params.particleCount, params.seed);
  accumulator = 0;
  detector.reset();
  pendingNotes = [];
}

function scaleDivisor(scale: FrameInput['brushScale']): number {
  return scale === 'fine' ? 1 : scale === 'mid' ? SCALE_FACTOR : SCALE_FACTOR * SCALE_FACTOR;
}

function step(input: FrameInput): void {
  if (!params || !multi || !particles) return;
  if (input.paused) return;

  accumulator += Math.min(0.25, input.dtSim);
  const div = scaleDivisor(input.brushScale);
  let steps = 0;
  while (accumulator >= params.dt && steps < 200) {
    if (input.pointerDown && input.brush) {
      const target = multi.field(input.brushScale);
      const stroke: BrushStroke = {
        kind: input.brush,
        x: input.pointerX / div,
        y: input.pointerY / div,
        radius: input.brushRadius,
      };
      // moving the climate is expensive: costs x4 at mid, x16 at coarse
      const cost = strokeCost(target, stroke, params, params.dt) * div;
      if (influence.spend(cost)) applyBrush(target, stroke, params, params.dt);
    } else {
      influence.idle(params.dt, params);
    }
    multi.tick(params);
    particles.step(multi.fine, params.particleSpeed, params.dt);
    if (multi.fine.tickCount % SAMPLE_EVERY === 0) {
      pendingNotes.push(...detector.sample(multi, params));
    }
    accumulator -= params.dt;
    steps++;
  }
}

function takeBuffer(recycle: ArrayBuffer[], bytes: number): ArrayBuffer {
  for (let i = 0; i < recycle.length; i++) {
    if (recycle[i].byteLength === bytes) return recycle.splice(i, 1)[0];
  }
  return new ArrayBuffer(bytes);
}

function reply(recycle: ArrayBuffer[]): void {
  if (!params || !multi || !particles) return;
  const fineSize = multi.fine.size;
  const midSize = multi.mid.size;
  const coarseSize = multi.coarse.size;

  const fine = takeBuffer(recycle, fineSize * fineSize * 4);
  const mid = takeBuffer(recycle, midSize * midSize * 4);
  const coarse = takeBuffer(recycle, coarseSize * coarseSize * 4);
  paintFieldPixels(multi.fine, new Uint8ClampedArray(fine), params.palette);
  paintFieldPixels(multi.mid, new Uint8ClampedArray(mid), params.palette);
  paintFieldPixels(multi.coarse, new Uint8ClampedArray(coarse), params.palette);

  const count = particles.count;
  const pbuf = takeBuffer(recycle, count * 2 * 4);
  const pxy = new Float32Array(pbuf);
  for (let i = 0; i < count; i++) {
    pxy[i * 2] = particles.x[i];
    pxy[i * 2 + 1] = particles.y[i];
  }

  // global element shares + mean polarity, for the sound layer (spec 4)
  const n = fineSize * fineSize;
  const shares = [0, 0, 0, 0, 0];
  let meanP = 0;
  for (let idx = 0; idx < n; idx++) {
    for (let k = 0; k < 5; k++) shares[k] += multi.fine.w[k][idx];
    meanP += multi.fine.p[idx];
  }
  for (let k = 0; k < 5; k++) shares[k] /= n;
  meanP /= n;

  post(
    {
      t: 'frame',
      fineSize,
      midSize,
      coarseSize,
      fine,
      mid,
      coarse,
      particles: pbuf,
      particleCount: count,
      influence: influence.value,
      influenceRamp: influence.rampFactor(),
      notes: pendingNotes.splice(0),
      shares,
      meanP,
    },
    [fine, mid, coarse, pbuf],
  );
}

self.onmessage = (e: MessageEvent) => {
  const msg = e.data as MainToWorker;
  switch (msg.t) {
    case 'init':
    case 'reset': {
      params = msg.params;
      influence = new Influence();
      rebuild();
      break;
    }
    case 'params': {
      const sizeChanged = !params || msg.params.size !== params.size;
      const countChanged = !params || msg.params.particleCount !== params.particleCount;
      params = msg.params;
      if (sizeChanged) rebuild();
      else if (countChanged && particles) {
        particles = new ParticleSystem(params.size, params.particleCount, params.seed);
      }
      break;
    }
    case 'reseed': {
      if (!params || !multi) break;
      params.seed = msg.seed;
      multi.reseed(msg.seed);
      particles = new ParticleSystem(params.size, params.particleCount, msg.seed);
      break;
    }
    case 'save': {
      if (!params || !multi) break;
      const state = serializeState(multi, params, influence.value, influence.streak);
      post({ t: 'state', state }, [state]);
      break;
    }
    case 'load': {
      // the binary is self-contained: params live in its header
      const { peeked, ok } = tryLoad(msg.state);
      if (!ok && peeked) {
        // sizes mismatched current world — rebuild to the saved size and retry
        params = peeked;
        rebuild();
        tryLoad(msg.state);
      }
      break;
    }
    case 'frame': {
      step(msg.input);
      reply(msg.recycle ?? []);
      break;
    }
  }
};

function tryLoad(state: ArrayBuffer): { peeked: SimParams | null; ok: boolean } {
  if (!multi) return { peeked: null, ok: false };
  const restored = deserializeState(state, multi);
  if (!restored) {
    // peek params so the caller can rebuild at the right size
    return { peeked: peekParams(state), ok: false };
  }
  params = restored.params;
  influence = new Influence();
  influence.value = restored.influence;
  influence.streak = restored.influenceStreak;
  accumulator = 0;
  detector.reset();
  if (particles && (particles.size !== params.size || particles.count !== params.particleCount)) {
    particles = new ParticleSystem(params.size, params.particleCount, params.seed);
  }
  return { peeked: params, ok: true };
}
