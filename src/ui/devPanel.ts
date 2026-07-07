import { DEFAULT_PARAMS, PARAM_RANGES, type SimParams } from '../sim/config';

export interface DevPanelHandle {
  el: HTMLElement;
  toggle: () => void;
  refresh: () => void;
}

/**
 * Runtime tuning panel for every constant in the param registry — hidden
 * behind `~` per spec 6 ("tuning is most of the work; make it frictionless").
 */
export function createDevPanel(
  params: SimParams,
  callbacks: {
    onChange: () => void;
    onReseed: (seed: number) => void;
    onReset: () => void;
  },
): DevPanelHandle {
  const el = document.createElement('div');
  el.id = 'dev-panel';
  el.className = 'dev-panel hidden';

  const title = document.createElement('div');
  title.className = 'dev-panel-title';
  title.textContent = 'Dev panel (~)';
  el.appendChild(title);

  const rows: Array<() => void> = [];

  for (const key of Object.keys(PARAM_RANGES) as Array<keyof typeof PARAM_RANGES>) {
    const range = PARAM_RANGES[key];
    const row = document.createElement('label');
    row.className = 'dev-row';

    const name = document.createElement('span');
    name.className = 'dev-row-name';
    name.textContent = key;

    const slider = document.createElement('input');
    slider.type = 'range';
    slider.min = String(range.min);
    slider.max = String(range.max);
    slider.step = String(range.step);
    slider.value = String(params[key]);

    const value = document.createElement('span');
    value.className = 'dev-row-value';
    value.textContent = Number(params[key]).toFixed(4);

    slider.addEventListener('input', () => {
      const v = parseFloat(slider.value);
      (params as unknown as Record<string, number>)[key] = v;
      value.textContent = v.toFixed(4);
      callbacks.onChange();
    });

    row.appendChild(name);
    row.appendChild(slider);
    row.appendChild(value);
    el.appendChild(row);

    rows.push(() => {
      slider.value = String(params[key]);
      value.textContent = Number(params[key]).toFixed(4);
    });
  }

  // boolean toggles (flow-visualization layer, spec 4)
  for (const key of ['showParticles', 'showTrails'] as const) {
    const row = document.createElement('label');
    row.className = 'dev-row';
    const name = document.createElement('span');
    name.className = 'dev-row-name';
    name.textContent = key;
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = params[key];
    checkbox.addEventListener('change', () => {
      params[key] = checkbox.checked;
      callbacks.onChange();
    });
    row.appendChild(name);
    row.appendChild(checkbox);
    el.appendChild(row);
    rows.push(() => {
      checkbox.checked = params[key];
    });
  }

  // particle count (rebuilds the particle system on change, unlike the live sliders above)
  const particleCountRow = document.createElement('label');
  particleCountRow.className = 'dev-row';
  const particleCountName = document.createElement('span');
  particleCountName.className = 'dev-row-name';
  particleCountName.textContent = 'particleCount';
  const particleCountInput = document.createElement('input');
  particleCountInput.type = 'number';
  particleCountInput.min = '0';
  particleCountInput.step = '100';
  particleCountInput.value = String(params.particleCount);
  particleCountInput.addEventListener('change', () => {
    const v = Math.max(0, parseInt(particleCountInput.value, 10) || 0);
    params.particleCount = v;
    particleCountInput.value = String(v);
    callbacks.onChange();
  });
  particleCountRow.appendChild(particleCountName);
  particleCountRow.appendChild(particleCountInput);
  el.appendChild(particleCountRow);
  rows.push(() => {
    particleCountInput.value = String(params.particleCount);
  });

  // palette (elemental hues, or the evenly-spaced fallback from spec 4)
  const paletteRow = document.createElement('label');
  paletteRow.className = 'dev-row';
  const paletteName = document.createElement('span');
  paletteName.className = 'dev-row-name';
  paletteName.textContent = 'palette';
  const paletteSelect = document.createElement('select');
  for (const v of ['elemental', 'evenSpaced']) {
    const opt = document.createElement('option');
    opt.value = v;
    opt.textContent = v;
    paletteSelect.appendChild(opt);
  }
  paletteSelect.value = params.palette;
  paletteSelect.addEventListener('change', () => {
    params.palette = paletteSelect.value as SimParams['palette'];
    callbacks.onChange();
  });
  paletteRow.appendChild(paletteName);
  paletteRow.appendChild(paletteSelect);
  el.appendChild(paletteRow);
  rows.push(() => {
    paletteSelect.value = params.palette;
  });

  // conserve flag
  const conserveRow = document.createElement('label');
  conserveRow.className = 'dev-row';
  const conserveName = document.createElement('span');
  conserveName.className = 'dev-row-name';
  conserveName.textContent = 'conserve';
  const conserveSelect = document.createElement('select');
  for (const v of ['simplex', 'unbounded']) {
    const opt = document.createElement('option');
    opt.value = v;
    opt.textContent = v;
    conserveSelect.appendChild(opt);
  }
  conserveSelect.value = params.conserve;
  conserveSelect.addEventListener('change', () => {
    params.conserve = conserveSelect.value as SimParams['conserve'];
    callbacks.onChange();
  });
  conserveRow.appendChild(conserveName);
  conserveRow.appendChild(conserveSelect);
  el.appendChild(conserveRow);

  // neighborhood flag
  const neighborhoodRow = document.createElement('label');
  neighborhoodRow.className = 'dev-row';
  const neighborhoodName = document.createElement('span');
  neighborhoodName.className = 'dev-row-name';
  neighborhoodName.textContent = 'neighborhood';
  const neighborhoodSelect = document.createElement('select');
  for (const v of ['vonNeumann', 'moore']) {
    const opt = document.createElement('option');
    opt.value = v;
    opt.textContent = v;
    neighborhoodSelect.appendChild(opt);
  }
  neighborhoodSelect.value = params.neighborhood;
  neighborhoodSelect.addEventListener('change', () => {
    params.neighborhood = neighborhoodSelect.value as SimParams['neighborhood'];
    callbacks.onChange();
  });
  neighborhoodRow.appendChild(neighborhoodName);
  neighborhoodRow.appendChild(neighborhoodSelect);
  el.appendChild(neighborhoodRow);

  // seed + actions
  const actions = document.createElement('div');
  actions.className = 'dev-actions';

  const seedInput = document.createElement('input');
  seedInput.type = 'number';
  seedInput.value = String(params.seed);
  seedInput.className = 'dev-seed-input';

  const reseedBtn = document.createElement('button');
  reseedBtn.textContent = 'Reseed';
  reseedBtn.addEventListener('click', () => {
    const seed = parseInt(seedInput.value, 10) || 1;
    params.seed = seed;
    callbacks.onReseed(seed);
  });

  const resetBtn = document.createElement('button');
  resetBtn.textContent = 'Reset defaults';
  resetBtn.addEventListener('click', () => {
    Object.assign(params, DEFAULT_PARAMS);
    seedInput.value = String(params.seed);
    conserveSelect.value = params.conserve;
    neighborhoodSelect.value = params.neighborhood;
    for (const r of rows) r();
    callbacks.onReset();
  });

  actions.appendChild(seedInput);
  actions.appendChild(reseedBtn);
  actions.appendChild(resetBtn);
  el.appendChild(actions);

  const toggle = () => el.classList.toggle('hidden');

  return {
    el,
    toggle,
    refresh: () => {
      for (const r of rows) r();
      seedInput.value = String(params.seed);
      conserveSelect.value = params.conserve;
      neighborhoodSelect.value = params.neighborhood;
    },
  };
}
