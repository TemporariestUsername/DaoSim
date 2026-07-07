import type { SimParams } from './config';
import type { BrushKind } from './brushes';
import type { ScaleName } from './multiscale';
import type { Detection } from './fieldNotes';

/** Pointer/brush snapshot the main thread sends with each frame request. */
export interface FrameInput {
  /** accumulated real seconds since the last request, already speed-scaled */
  dtSim: number;
  paused: boolean;
  pointerDown: boolean;
  /** pointer position in world (fine-grid) cells */
  pointerX: number;
  pointerY: number;
  brush: BrushKind | null;
  brushRadius: number;
  brushScale: ScaleName;
}

export type MainToWorker =
  | { t: 'init'; params: SimParams }
  | { t: 'reset'; params: SimParams }
  | { t: 'params'; params: SimParams }
  | { t: 'reseed'; seed: number }
  | { t: 'save' }
  | { t: 'load'; state: ArrayBuffer }
  | {
      t: 'frame';
      input: FrameInput;
      /** buffers returned from the previous frame for reuse (ping-pong) */
      recycle?: ArrayBuffer[];
    };

export interface WorkerFrame {
  t: 'frame';
  fineSize: number;
  midSize: number;
  coarseSize: number;
  /** RGBA pixel buffers, one per scale */
  fine: ArrayBuffer;
  mid: ArrayBuffer;
  coarse: ArrayBuffer;
  /** interleaved particle x,y in world cells */
  particles: ArrayBuffer;
  particleCount: number;
  influence: number;
  influenceRamp: number;
  /** regimes first observed during this frame's ticks (spec 3.3) */
  notes: Detection[];
}

export interface WorkerState {
  t: 'state';
  state: ArrayBuffer;
}

export type WorkerToMain = WorkerFrame | WorkerState;
