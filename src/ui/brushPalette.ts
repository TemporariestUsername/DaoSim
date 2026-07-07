import type { BrushKind } from '../sim/brushes';
import { ELEMENT_NAMES } from '../sim/field';

export interface BrushState {
  /** null = observe (no brush, influence regenerates) */
  kind: BrushKind | null;
  radius: number;
}

export interface BrushPaletteHandle {
  el: HTMLElement;
  state: BrushState;
  setInfluence: (value: number, ramp: number) => void;
}

interface PaletteEntry {
  label: string;
  kind: BrushKind | null;
}

const ENTRIES: PaletteEntry[] = [
  { label: 'Observe', kind: null },
  { label: 'Yang', kind: { type: 'yang' } },
  { label: 'Yin', kind: { type: 'yin' } },
  ...ELEMENT_NAMES.map((name, i) => ({ label: name, kind: { type: 'seed', element: i } as BrushKind })),
  { label: 'Still', kind: { type: 'still' } },
];

/**
 * Brush palette (spec 3.2/4): plain labeled buttons down one side, a radius
 * slider, and the Influence meter — the single elegant meter that carries
 * the entire game layer. Geometric, monochrome, no iconography.
 */
export function createBrushPalette(): BrushPaletteHandle {
  const state: BrushState = { kind: null, radius: 6 };

  const el = document.createElement('div');
  el.id = 'brush-palette';
  el.className = 'brush-palette';

  // influence meter
  const meterWrap = document.createElement('div');
  meterWrap.className = 'influence-meter';
  const meterLabel = document.createElement('div');
  meterLabel.className = 'influence-label';
  meterLabel.textContent = 'Influence';
  const meterBar = document.createElement('div');
  meterBar.className = 'influence-bar';
  const meterFill = document.createElement('div');
  meterFill.className = 'influence-fill';
  meterBar.appendChild(meterFill);
  meterWrap.appendChild(meterLabel);
  meterWrap.appendChild(meterBar);
  el.appendChild(meterWrap);

  // brush buttons
  const buttons: HTMLButtonElement[] = [];
  for (const entry of ENTRIES) {
    const btn = document.createElement('button');
    btn.textContent = entry.label;
    btn.className = 'brush-btn';
    if (entry.kind === null) btn.classList.add('active');
    btn.addEventListener('click', () => {
      state.kind = entry.kind;
      for (const b of buttons) b.classList.remove('active');
      btn.classList.add('active');
    });
    buttons.push(btn);
    el.appendChild(btn);
  }

  // radius slider
  const radiusRow = document.createElement('label');
  radiusRow.className = 'radius-row';
  const radiusLabel = document.createElement('span');
  radiusLabel.textContent = 'Radius';
  const radiusSlider = document.createElement('input');
  radiusSlider.type = 'range';
  radiusSlider.min = '1';
  radiusSlider.max = '16';
  radiusSlider.step = '1';
  radiusSlider.value = String(state.radius);
  const radiusValue = document.createElement('span');
  radiusValue.textContent = String(state.radius);
  radiusSlider.addEventListener('input', () => {
    state.radius = parseInt(radiusSlider.value, 10);
    radiusValue.textContent = radiusSlider.value;
  });
  radiusRow.appendChild(radiusLabel);
  radiusRow.appendChild(radiusSlider);
  radiusRow.appendChild(radiusValue);
  el.appendChild(radiusRow);

  return {
    el,
    state,
    setInfluence: (value, ramp) => {
      meterFill.style.width = `${value}%`;
      meterLabel.textContent = ramp > 1.05 ? `Influence x${ramp.toFixed(1)}` : 'Influence';
    },
  };
}
