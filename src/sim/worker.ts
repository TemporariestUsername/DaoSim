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
import type { MainToWorker, WorkerFrame, FrameInput } from './workerTypes';

const post = (msg: WorkerFrame, transfer: Transferable[]) =>
  (self as unknown as { postMessage: (m: unknown, t?: Transferable[]) => void }).postMessage(msg, transfer);

let params: SimParams | null = null;
let multi: Multiscale | null = null;
let particles: ParticleSystem | null = null;
let influence = new Influence();
let accumulator = 0;

function rebuild(): void {
  if (!params) return;
  multi = new Multiscale(params.size, params.seed, params);
  particles = new ParticleSystem(params.size, params.particleCount, params.seed);
  accumulator = 0;
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
  paintFieldPixels(multi.fine, new Uint8ClampedArray(fine));
  paintFieldPixels(multi.mid, new Uint8ClampedArray(mid));
  paintFieldPixels(multi.coarse, new Uint8ClampedArray(coarse));

  const count = particles.count;
  const pbuf = takeBuffer(recycle, count * 2 * 4);
  const pxy = new Float32Array(pbuf);
  for (let i = 0; i < count; i++) {
    pxy[i * 2] = particles.x[i];
    pxy[i * 2 + 1] = particles.y[i];
  }

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
    case 'frame': {
      step(msg.input);
      reply(msg.recycle ?? []);
      break;
    }
  }
};
