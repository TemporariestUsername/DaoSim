import type { SimParams } from './config';

export const INFLUENCE_MAX = 100;

/** Stillness-streak regen ramp: 1x at 0 s idle, up to 3x after RAMP_SECONDS. */
const REGEN_RAMP_CAP = 3;
const RAMP_SECONDS = 60;

/**
 * The restraint economy (spec 3.1). One resource: Influence, 0..100.
 * Regenerates only through inaction — the longer the stillness streak, the
 * faster it builds (capped at 3x). Any brush action stops regeneration and
 * drains it. Running dry is not punished; brushes simply stop until you wait.
 */
export class Influence {
  value = INFLUENCE_MAX;
  /** seconds since the last brush action */
  streak = 0;

  /** Advance one sim step with no brush active. */
  idle(dt: number, params: SimParams): void {
    this.streak += dt;
    const ramp = 1 + (REGEN_RAMP_CAP - 1) * Math.min(1, this.streak / RAMP_SECONDS);
    this.value = Math.min(INFLUENCE_MAX, this.value + params.influenceRegen * ramp * dt);
  }

  /** Current regen multiplier from the stillness streak (for UI display). */
  rampFactor(): number {
    return 1 + (REGEN_RAMP_CAP - 1) * Math.min(1, this.streak / RAMP_SECONDS);
  }

  /**
   * Try to pay for a brush stroke. Returns true (and drains) if there is
   * any influence left; a stroke can spend into exactly 0 but never below.
   */
  spend(cost: number): boolean {
    if (this.value <= 0) return false;
    this.value = Math.max(0, this.value - cost);
    this.streak = 0;
    return true;
  }
}
