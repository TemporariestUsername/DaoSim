import './style.css';
import { Field } from './sim/field';
import { cloneParams, DEFAULT_PARAMS } from './sim/config';
import { Renderer } from './render/renderer';
import { createDevPanel } from './ui/devPanel';
import { Gallery } from './gallery/gallery';
import { BUILTIN_PRESETS } from './sim/presets';
import { ParticleSystem } from './sim/particles';
import { applyBrush, strokeCost, type BrushStroke } from './sim/brushes';
import { Influence } from './sim/influence';
import { createBrushPalette } from './ui/brushPalette';

const app = document.getElementById('app')!;

const canvas = document.createElement('canvas');
canvas.id = 'field';
app.appendChild(canvas);

const params = cloneParams(DEFAULT_PARAMS);
let field = new Field(params.size, params.seed);
let renderer = new Renderer(canvas, params.size);
let particles = new ParticleSystem(params.size, params.particleCount, params.seed);

function syncParticlesIfNeeded() {
  if (particles.count !== params.particleCount || particles.size !== params.size) {
    particles = new ParticleSystem(params.size, params.particleCount, params.seed);
  }
}

function resize() {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(window.innerWidth * dpr);
  canvas.height = Math.round(window.innerHeight * dpr);
  renderer.resize(canvas.width, canvas.height);
}
window.addEventListener('resize', resize);
resize();

// --- top bar ---------------------------------------------------------------
const topBar = document.createElement('div');
topBar.className = 'top-bar';

const speedLabel = document.createElement('span');
let speed = 1;
let paused = false;

function updateSpeedLabel() {
  speedLabel.textContent = paused ? 'paused' : `${speed}x`;
}
updateSpeedLabel();

const pauseBtn = document.createElement('button');
pauseBtn.textContent = 'Pause (space)';
pauseBtn.addEventListener('click', () => {
  paused = !paused;
  updateSpeedLabel();
});

const speeds = [0.5, 1, 2];
const speedBtn = document.createElement('button');
speedBtn.textContent = 'Speed';
speedBtn.addEventListener('click', () => {
  speed = speeds[(speeds.indexOf(speed) + 1) % speeds.length];
  updateSpeedLabel();
});

const presetSelect = document.createElement('select');
const defaultOpt = document.createElement('option');
defaultOpt.value = '';
defaultOpt.textContent = 'Default';
presetSelect.appendChild(defaultOpt);
for (const preset of BUILTIN_PRESETS) {
  const opt = document.createElement('option');
  opt.value = preset.name;
  opt.textContent = preset.name;
  presetSelect.appendChild(opt);
}
presetSelect.addEventListener('change', () => {
  const preset = BUILTIN_PRESETS.find((p) => p.name === presetSelect.value);
  if (!preset) return;
  const sizeChanged = preset.params.size !== params.size;
  Object.assign(params, preset.params);
  if (sizeChanged) {
    field = new Field(params.size, params.seed);
    renderer = new Renderer(canvas, params.size);
    resize();
  } else {
    field.reseed(params.seed);
  }
  syncParticlesIfNeeded();
  devPanel.refresh();
});

const hint = document.createElement('span');
hint.className = 'hint';
hint.textContent = 'Stillness gathers influence; touch spends it. — ~ tune, G gallery, H hide UI';

topBar.appendChild(speedLabel);
topBar.appendChild(pauseBtn);
topBar.appendChild(speedBtn);
topBar.appendChild(presetSelect);
topBar.appendChild(hint);
app.appendChild(topBar);

// --- dev panel ---------------------------------------------------------------
const devPanel = createDevPanel(params, {
  onChange: () => syncParticlesIfNeeded(),
  onReseed: (seed) => {
    field.reseed(seed);
    particles = new ParticleSystem(params.size, params.particleCount, seed);
  },
  onReset: () => {
    field = new Field(params.size, params.seed);
    particles = new ParticleSystem(params.size, params.particleCount, params.seed);
  },
});
app.appendChild(devPanel.el);

// --- brushes & influence -----------------------------------------------------
const palette = createBrushPalette();
app.appendChild(palette.el);
const influence = new Influence();

// pointer state in fine-grid coordinates
const pointer = { x: 0, y: 0, over: false, down: false };

function toGrid(e: PointerEvent): { x: number; y: number } {
  const rect = canvas.getBoundingClientRect();
  return {
    x: ((e.clientX - rect.left) / rect.width) * params.size,
    y: ((e.clientY - rect.top) / rect.height) * params.size,
  };
}

canvas.addEventListener('pointerdown', (e) => {
  if (e.button !== 0) return;
  canvas.setPointerCapture(e.pointerId);
  const g = toGrid(e);
  pointer.x = g.x;
  pointer.y = g.y;
  pointer.down = true;
});
canvas.addEventListener('pointermove', (e) => {
  const g = toGrid(e);
  pointer.x = g.x;
  pointer.y = g.y;
  pointer.over = true;
});
canvas.addEventListener('pointerup', () => {
  pointer.down = false;
});
canvas.addEventListener('pointercancel', () => {
  pointer.down = false;
});
canvas.addEventListener('pointerleave', () => {
  pointer.over = false;
  pointer.down = false;
});

// --- gallery ---------------------------------------------------------------
const gallery = new Gallery(app);
let galleryOpen = false;

// --- input ---------------------------------------------------------------
window.addEventListener('keydown', (e) => {
  if (e.key === '~' || e.key === '`') {
    devPanel.toggle();
  } else if (e.key === 'g' || e.key === 'G') {
    galleryOpen = !galleryOpen;
    if (galleryOpen) gallery.open();
    else gallery.close();
  } else if (e.key === 'h' || e.key === 'H') {
    topBar.classList.toggle('hidden');
    palette.el.classList.toggle('hidden');
    document.getElementById('dev-panel')?.classList.add('hidden');
  } else if (e.key === ' ') {
    e.preventDefault();
    paused = !paused;
    updateSpeedLabel();
  }
});

// --- fixed-timestep sim loop, decoupled from render rate --------------------
let lastTime = performance.now();
let accumulator = 0;

function frame(time: number) {
  requestAnimationFrame(frame);
  const dtReal = Math.min(0.25, (time - lastTime) / 1000);
  lastTime = time;

  if (!paused && !galleryOpen) {
    accumulator += dtReal * speed;
    let steps = 0;
    while (accumulator >= params.dt && steps < 200) {
      // brush before tick, so the stroke's effect propagates this step
      const brushing = pointer.down && palette.state.kind !== null;
      if (brushing && palette.state.kind) {
        const stroke: BrushStroke = {
          kind: palette.state.kind,
          x: pointer.x,
          y: pointer.y,
          radius: palette.state.radius,
        };
        const cost = strokeCost(field, stroke, params, params.dt);
        if (influence.spend(cost)) applyBrush(field, stroke, params, params.dt);
      } else {
        influence.idle(params.dt, params);
      }
      field.tick(params);
      particles.step(field, params.particleSpeed, params.dt);
      accumulator -= params.dt;
      steps++;
    }
    canvas.classList.toggle('brushing', palette.state.kind !== null);
    palette.setInfluence(influence.value, influence.rampFactor());
    renderer.draw(field, {
      particles,
      showParticles: params.showParticles,
      showTrails: params.showTrails,
      trailFade: params.trailFade,
      cursor:
        pointer.over && palette.state.kind !== null
          ? { x: pointer.x, y: pointer.y, radius: palette.state.radius }
          : null,
    });
  }
}
requestAnimationFrame(frame);
