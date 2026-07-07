// Sound layer (spec 4, stretch): five soft tones whose loudness follows the
// global element shares; mean Yin-Yang sets a lowpass cutoff. Off by
// default, mutable. The tuning is an abstract 7-limit just-intoned set
// (1/1, 9/8, 5/4, 3/2, 7/4) — deliberately not a pentatonic scale.
const RATIOS = [1, 9 / 8, 5 / 4, 3 / 2, 7 / 4];
const BASE_HZ = 132;

export class SoundEngine {
  enabled = false;
  private ctx: AudioContext | null = null;
  private gains: GainNode[] = [];
  private filter: BiquadFilterNode | null = null;
  private master: GainNode | null = null;

  /** Must be called from a user gesture (browser autoplay policy). */
  toggle(): boolean {
    if (!this.ctx) this.build();
    this.enabled = !this.enabled;
    if (this.enabled) void this.ctx!.resume();
    else void this.ctx!.suspend();
    return this.enabled;
  }

  private build(): void {
    const ctx = new AudioContext();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = 0.35;
    this.filter = ctx.createBiquadFilter();
    this.filter.type = 'lowpass';
    this.filter.frequency.value = 1000;
    this.filter.Q.value = 0.5;
    this.filter.connect(this.master);
    this.master.connect(ctx.destination);

    for (let k = 0; k < RATIOS.length; k++) {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = BASE_HZ * RATIOS[k];
      const gain = ctx.createGain();
      gain.gain.value = 0;
      osc.connect(gain);
      gain.connect(this.filter);
      osc.start();
      this.gains.push(gain);
    }
  }

  /** Follow the field: tone loudness <- element shares, cutoff <- mean p. */
  update(shares: number[], meanP: number): void {
    if (!this.enabled || !this.ctx || !this.filter) return;
    const t = this.ctx.currentTime;
    for (let k = 0; k < this.gains.length; k++) {
      // squared shares exaggerate contrast: an even 0.2 mix hums quietly,
      // a dominant element sings
      const target = Math.min(0.5, shares[k] * shares[k] * 2.2);
      this.gains[k].gain.setTargetAtTime(target, t, 0.4);
    }
    // full Yin -> muffled 250 Hz, neutral -> 1 kHz, full Yang -> 4 kHz
    const cutoff = 250 * Math.pow(2, (meanP + 1) * 2);
    this.filter.frequency.setTargetAtTime(cutoff, t, 0.6);
  }
}
