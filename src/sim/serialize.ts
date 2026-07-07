import type { Field } from './field';
import { NUM_ELEMENTS } from './field';
import type { Multiscale } from './multiscale';
import type { SimParams } from './config';

// Full-state binary save (spec 5): magic, params JSON, tick counters (which
// preserve the multiscale schedule phase), influence, then every plane of
// every scale plus each scale's PRNG state so the noise stream resumes
// exactly where it left off.
const MAGIC = 0x44414f31; // 'DAO1'

function planeCount(): number {
  return NUM_ELEMENTS + 3; // w0..w4, p, v, stillness
}

function fieldBytes(size: number): number {
  return 4 /* size */ + 4 /* rng state */ + planeCount() * size * size * 4;
}

export interface SavedState {
  params: SimParams;
  fineTick: number;
  midTick: number;
  coarseTick: number;
  influence: number;
  influenceStreak: number;
}

export function serializeState(
  multi: Multiscale,
  params: SimParams,
  influence: number,
  influenceStreak: number,
): ArrayBuffer {
  const raw = new TextEncoder().encode(JSON.stringify(params));
  // pad to 4 bytes so the Float32Array plane views stay aligned
  const paramsJson = new Uint8Array(Math.ceil(raw.length / 4) * 4);
  paramsJson.set(raw);
  const headerBytes = 4 + 4 + paramsJson.length + 3 * 4 + 2 * 4;
  const total =
    headerBytes + fieldBytes(multi.fine.size) + fieldBytes(multi.mid.size) + fieldBytes(multi.coarse.size);
  const buffer = new ArrayBuffer(total);
  const view = new DataView(buffer);
  let off = 0;

  view.setUint32(off, MAGIC);
  off += 4;
  // stores the unpadded JSON length; readers advance by the padded length
  view.setUint32(off, raw.length);
  off += 4;
  new Uint8Array(buffer, off, paramsJson.length).set(paramsJson);
  off += paramsJson.length;
  view.setUint32(off, multi.fine.tickCount);
  off += 4;
  view.setUint32(off, multi.mid.tickCount);
  off += 4;
  view.setUint32(off, multi.coarse.tickCount);
  off += 4;
  view.setFloat32(off, influence);
  off += 4;
  view.setFloat32(off, influenceStreak);
  off += 4;

  for (const field of [multi.fine, multi.mid, multi.coarse]) {
    off = writeField(view, buffer, off, field);
  }
  return buffer;
}

function writeField(view: DataView, buffer: ArrayBuffer, off: number, field: Field): number {
  view.setUint32(off, field.size);
  off += 4;
  view.setUint32(off, field.getRngState());
  off += 4;
  const n = field.size * field.size;
  const planes = [...field.w, field.p, field.v, field.stillness];
  for (const plane of planes) {
    new Float32Array(buffer, off, n).set(plane);
    off += n * 4;
  }
  return off;
}

/** Read just the params header — the main thread needs them before the worker loads. */
export function peekParams(buffer: ArrayBuffer): SimParams | null {
  try {
    const view = new DataView(buffer);
    if (view.getUint32(0) !== MAGIC) return null;
    const len = view.getUint32(4);
    const json = new TextDecoder().decode(new Uint8Array(buffer, 8, len));
    return JSON.parse(json) as SimParams;
  } catch {
    return null;
  }
}

/**
 * Restore a serialized state into an existing Multiscale of matching sizes.
 * Returns the header info, or null if the buffer is invalid or mismatched.
 */
export function deserializeState(buffer: ArrayBuffer, multi: Multiscale): SavedState | null {
  const view = new DataView(buffer);
  if (buffer.byteLength < 8 || view.getUint32(0) !== MAGIC) return null;
  const paramsLen = view.getUint32(4);
  let off = 8;
  let params: SimParams;
  try {
    params = JSON.parse(new TextDecoder().decode(new Uint8Array(buffer, off, paramsLen))) as SimParams;
  } catch {
    return null;
  }
  off += Math.ceil(paramsLen / 4) * 4;
  const fineTick = view.getUint32(off);
  off += 4;
  const midTick = view.getUint32(off);
  off += 4;
  const coarseTick = view.getUint32(off);
  off += 4;
  const influence = view.getFloat32(off);
  off += 4;
  const influenceStreak = view.getFloat32(off);
  off += 4;

  for (const field of [multi.fine, multi.mid, multi.coarse]) {
    const size = view.getUint32(off);
    off += 4;
    if (size !== field.size) return null;
    field.setRngState(view.getUint32(off));
    off += 4;
    const n = size * size;
    const planes = [...field.w, field.p, field.v, field.stillness];
    for (const plane of planes) {
      plane.set(new Float32Array(buffer, off, n));
      off += n * 4;
    }
  }

  multi.fine.tickCount = fineTick;
  multi.mid.tickCount = midTick;
  multi.coarse.tickCount = coarseTick;
  return { params, fineTick, midTick, coarseTick, influence, influenceStreak };
}
