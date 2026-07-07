import type { Multiscale } from './multiscale';
import type { SimParams } from './config';
import { ELEMENT_NAMES, NUM_ELEMENTS, type Field } from './field';
import {
  autocorrelationLength,
  computeTheta,
  dominantElementShare,
  meanActivity,
  meanElementEntropy,
} from './metrics';

/** Fine ticks between detector samples: ~2 s of sim time at dt = 1/30 (spec 3.3). */
export const SAMPLE_EVERY = 60;

export interface Detection {
  /** stable id — the journal records only the first occurrence of each */
  id: string;
  name: string;
  description: string;
}

// Local detection granularity: 8x8-cell blocks (so 16x16 blocks on the
// default 128 grid). Kept small so a brush-sized structure fully covers at
// least one block regardless of where it lands relative to block boundaries.
const BLOCK_CELLS = 8;
const HISTORY = 90; // rolling samples (~3 sim minutes)
const WARMUP = 5; // samples ignored after init/load (start-up transients)

interface Sample {
  meanP: number;
  activityFine: number;
  activityMid: number;
  activityCoarse: number;
}

/**
 * Passive regime detection (spec 3.3): cheap global metrics every ~2
 * seconds plus per-block activity and cycle-angle rotation tracking. Ten
 * detectable regimes; deliberately no global-stasis entry — total
 * stillness is a bug (spec 1.4), not a discovery.
 */
export class RegimeDetector {
  private readonly history: Sample[] = [];
  private readonly found = new Set<string>();
  private samples = 0;

  // per-block trackers
  private blockTheta: Float32Array | null = null;
  private blockRotation: Float32Array | null = null; // accumulated signed rotation
  private blockRotationAge: Int32Array | null = null; // samples spent rotating one way
  private blockArrestAge: Int32Array | null = null; // consecutive low-activity samples
  private thetaScratch: Float32Array | null = null;

  // consecutive-sample counters for regimes that must persist
  private spiralStreak = 0;

  reset(): void {
    this.history.length = 0;
    this.samples = 0;
    this.spiralStreak = 0;
    this.blockTheta = null;
    this.blockRotation = null;
    this.blockRotationAge = null;
    this.blockArrestAge = null;
    // `found` survives reset on purpose: the journal is a naturalist's
    // notebook for the player, not per-world state; main dedups too.
  }

  sample(multi: Multiscale, params: SimParams): Detection[] {
    const fine = multi.fine;
    const out: Detection[] = [];
    this.samples++;

    const entropy = meanElementEntropy(fine);
    const dom = dominantElementShare(fine);
    const activityFine = meanActivity(fine);
    const activityMid = meanActivity(multi.mid);
    const activityCoarse = meanActivity(multi.coarse);

    const n = fine.size * fine.size;
    let meanP = 0;
    for (let idx = 0; idx < n; idx++) meanP += fine.p[idx];
    meanP /= n;

    this.history.push({ meanP, activityFine, activityMid, activityCoarse });
    if (this.history.length > HISTORY) this.history.shift();

    const warm = this.samples > WARMUP;
    const alive = activityFine > 1e-4;

    // --- spiral regime: mid entropy, mid-range structure, sustained motion
    if (warm && alive) {
      const acl = autocorrelationLength(fine);
      const spiralNow = entropy > 0.75 && entropy < 1.35 && acl >= 3 && acl <= 24;
      this.spiralStreak = spiralNow ? this.spiralStreak + 1 : 0;
      if (this.spiralStreak >= 3) {
        this.emit(out, 'spiral', 'Spiral weave', 'Rotating domains and traveling waves — the field organizing itself.');
      }
    }

    // --- monoculture bloom, named per element
    if (warm && dom.share > 0.6) {
      const name = ELEMENT_NAMES[dom.element];
      this.emit(out, `bloom-${dom.element}`, `${name} bloom`, `${name} has flooded most of the field. Its overcomer is already feeding on the excess.`);
    }

    // --- deep breath: global Yin-Yang oscillation with period > 30 s
    this.detectDeepBreath(out, params);

    // --- cascade: an activity spike echoing across all three scales
    this.detectCascade(out);

    // --- per-block: eddies (rotation) and clots (arrest)
    if (warm && alive) this.detectBlocks(out, fine, params);

    return out;
  }

  private emit(out: Detection[], id: string, name: string, description: string): void {
    if (this.found.has(id)) return;
    this.found.add(id);
    out.push({ id, name, description });
  }

  private detectDeepBreath(out: Detection[], params: SimParams): void {
    const h = this.history;
    if (h.length < 40) return;
    const sampleSeconds = SAMPLE_EVERY * params.dt;
    let base = 0;
    for (const s of h) base += s.meanP;
    base /= h.length;

    // amplitude gate so flat drift doesn't count as breathing
    let min = Infinity;
    let max = -Infinity;
    for (const s of h) {
      if (s.meanP < min) min = s.meanP;
      if (s.meanP > max) max = s.meanP;
    }
    if (max - min < 0.06) return;

    // zero crossings of the demeaned signal; period = 2x mean crossing gap
    const crossings: number[] = [];
    for (let i = 1; i < h.length; i++) {
      if ((h[i - 1].meanP - base) * (h[i].meanP - base) < 0) crossings.push(i);
    }
    if (crossings.length < 3) return;
    const gaps: number[] = [];
    for (let i = 1; i < crossings.length; i++) gaps.push(crossings[i] - crossings[i - 1]);
    const meanGap = gaps.reduce((a, b) => a + b, 0) / gaps.length;
    const period = 2 * meanGap * sampleSeconds;
    if (period > 30) {
      this.emit(out, 'deep-breath', 'Deep breath', `The whole field is exhaling and inhaling on a ${Math.round(period)}-second cycle.`);
    }
  }

  private detectCascade(out: Detection[]): void {
    const h = this.history;
    if (h.length < 20) return;
    // z-score of the latest 3 samples against the trailing window, per scale
    const spike = (get: (s: Sample) => number): boolean => {
      const trailing = h.slice(0, -3).map(get);
      const recent = h.slice(-3).map(get);
      const mean = trailing.reduce((a, b) => a + b, 0) / trailing.length;
      const variance = trailing.reduce((a, b) => a + (b - mean) ** 2, 0) / trailing.length;
      const sd = Math.sqrt(variance);
      if (sd < 1e-9) return false;
      return Math.max(...recent) > mean + 2.5 * sd;
    };
    if (spike((s) => s.activityFine) && spike((s) => s.activityMid) && spike((s) => s.activityCoarse)) {
      this.emit(out, 'cascade', 'Cascade', 'A surge of activity rippling through every scale at once, weather to climate.');
    }
  }

  private detectBlocks(out: Detection[], fine: Field, params: SimParams): void {
    const size = fine.size;
    const blockCells = BLOCK_CELLS;
    const blocksPerAxis = size / BLOCK_CELLS;
    const nBlocks = blocksPerAxis * blocksPerAxis;
    if (!this.blockTheta || this.blockTheta.length !== nBlocks) {
      this.blockTheta = new Float32Array(nBlocks);
      this.blockRotation = new Float32Array(nBlocks);
      this.blockRotationAge = new Int32Array(nBlocks);
      this.blockArrestAge = new Int32Array(nBlocks);
      this.thetaScratch = new Float32Array(size * size);
    }
    const theta = computeTheta(fine, this.thetaScratch!);
    const sampleSeconds = SAMPLE_EVERY * params.dt;

    // pass 1: per-block *effective* activity — the applied change, i.e. raw
    // |dw| scaled by the yin-yang rate and any Still-brush arrest. A clot has
    // normal potential change but near-zero applied change (spec 3.3).
    const blockAct = new Float64Array(nBlocks);
    const blockThetaNow = new Float64Array(nBlocks);
    let globalEffective = 0;
    for (let by = 0; by < blocksPerAxis; by++) {
      for (let bx = 0; bx < blocksPerAxis; bx++) {
        const b = by * blocksPerAxis + bx;
        let cx = 0;
        let cy = 0;
        let act = 0;
        for (let y = 0; y < blockCells; y++) {
          for (let x = 0; x < blockCells; x++) {
            const idx = (by * blockCells + y) * size + (bx * blockCells + x);
            cx += Math.cos(theta[idx]);
            cy += Math.sin(theta[idx]);
            act += fine.activity[idx] * Math.pow(2, fine.p[idx]) * (1 - fine.stillness[idx]);
          }
        }
        blockAct[b] = act / (blockCells * blockCells);
        blockThetaNow[b] = Math.atan2(cy, cx);
        globalEffective += blockAct[b];
      }
    }
    globalEffective /= nBlocks;
    if (globalEffective < 1e-6) return;

    // mean |rotation| across blocks this sample — an eddy must stand out
    // against this ("...while the field around it drifts", spec 3.3), or
    // ordinary spiral churn would register as eddies everywhere
    let meanAbsRotation = 0;
    const dThetas = new Float64Array(nBlocks);
    for (let b = 0; b < nBlocks; b++) {
      let dTheta = blockThetaNow[b] - this.blockTheta![b];
      while (dTheta > Math.PI) dTheta -= 2 * Math.PI;
      while (dTheta < -Math.PI) dTheta += 2 * Math.PI;
      dThetas[b] = dTheta;
      this.blockTheta![b] = blockThetaNow[b];
      meanAbsRotation += Math.abs(dTheta);
    }
    meanAbsRotation /= nBlocks;

    // pass 2: regime checks against the global baselines
    for (let b = 0; b < nBlocks; b++) {
      // clot: arrested block inside a living field (spec 3.3) — this is
      // also how a player's Still-brush clot gets journaled
      if (blockAct[b] < 0.3 * globalEffective) {
        this.blockArrestAge![b]++;
        if (this.blockArrestAge![b] * sampleSeconds >= 4) {
          this.emit(out, 'clot', 'Clot', 'A patch of the field has locked itself still; waves pile up and bend around it while it lasts.');
        }
      } else {
        this.blockArrestAge![b] = 0;
      }

      // eddy: this block's cycle angle keeps turning one way, well above
      // the ambient drift
      const dTheta = dThetas[b];
      if (this.samples > WARMUP + 1 && Math.abs(dTheta) > 0.02 && Math.abs(dTheta) > 3 * meanAbsRotation) {
        const sameDirection = Math.sign(dTheta) === Math.sign(this.blockRotation![b]) || this.blockRotation![b] === 0;
        if (sameDirection) {
          this.blockRotation![b] += dTheta;
          this.blockRotationAge![b]++;
        } else {
          this.blockRotation![b] = dTheta;
          this.blockRotationAge![b] = 1;
        }
        if (Math.abs(this.blockRotation![b]) > 2 * Math.PI && this.blockRotationAge![b] * sampleSeconds >= 30) {
          this.emit(out, 'eddy', 'Eddy', 'A small structure has been turning in place for half a minute while the field drifts past it.');
        }
      } else if (this.samples > WARMUP + 1) {
        this.blockRotationAge![b] = 0;
        this.blockRotation![b] = 0;
      }
    }
  }
}

export { NUM_ELEMENTS };
