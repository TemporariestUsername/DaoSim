import { NUM_ELEMENTS } from './field';

export type PaletteMode = 'elemental' | 'evenSpaced';

// Wood=green, Fire=red, Earth=ochre/yellow, Metal=pale silver-white, Water=deep blue.
// Chosen for OKLCH hue separation (Wood/Fire kept far apart in both hue and lightness
// to survive a deuteranopia check, per spec 4's accessibility note).
const ELEMENTAL_HUES = [145, 25, 80, 95, 260]; // degrees
const EVEN_SPACED_HUES = [0, 72, 144, 216, 288]; // fallback if blended hues muddy

// Metal reads pale/silvery: lower chroma ceiling regardless of concentration.
const CHROMA_SCALE = [1, 1, 1, 0.45, 1];

const BASE_CHROMA = 0.16;
const YIN_LIGHTNESS = 0.25;
const YANG_LIGHTNESS = 0.8;

function oklchToSrgb(L: number, C: number, hueDeg: number): [number, number, number] {
  const h = (hueDeg * Math.PI) / 180;
  const a = C * Math.cos(h);
  const b = C * Math.sin(h);

  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.2914855480 * b;

  const l = l_ ** 3;
  const m = m_ ** 3;
  const s = s_ ** 3;

  let r = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
  let g = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
  let bl = -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s;

  const gamma = (c: number) => (c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055);
  r = gamma(r);
  g = gamma(g);
  bl = gamma(bl);

  const clamp = (c: number) => Math.max(0, Math.min(255, Math.round(c * 255)));
  return [clamp(r), clamp(g), clamp(bl)];
}

/**
 * Cell color: hue is the weight-blended mix of the five elemental hues,
 * lightness comes from Yin-Yang polarity (Yin dark/slow, Yang bright/fast),
 * and chroma comes from element concentration — a perfectly mixed 20%-each
 * cell reads as near-gray, a dominant element reads saturated.
 */
export function cellColor(
  weights: ArrayLike<number>,
  p: number,
  mode: PaletteMode = 'elemental',
): [number, number, number] {
  const hues = mode === 'elemental' ? ELEMENTAL_HUES : EVEN_SPACED_HUES;
  let cx = 0;
  let cy = 0;
  let maxW = 0;
  let maxK = 0;
  for (let k = 0; k < NUM_ELEMENTS; k++) {
    const wk = weights[k];
    const rad = (hues[k] * Math.PI) / 180;
    cx += wk * Math.cos(rad);
    cy += wk * Math.sin(rad);
    if (wk > maxW) {
      maxW = wk;
      maxK = k;
    }
  }
  const hue = (Math.atan2(cy, cx) * 180) / Math.PI;
  const concentration = Math.max(0, Math.min(1, (maxW - 1 / NUM_ELEMENTS) / (1 - 1 / NUM_ELEMENTS)));
  const chroma = BASE_CHROMA * concentration * CHROMA_SCALE[maxK];
  const lightness = YIN_LIGHTNESS + ((p + 1) / 2) * (YANG_LIGHTNESS - YIN_LIGHTNESS);
  return oklchToSrgb(lightness, chroma, hue);
}

export { ELEMENTAL_HUES, EVEN_SPACED_HUES };
