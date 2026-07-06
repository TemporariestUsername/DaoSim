import './style.css';
import { Field } from './sim/field';
import { cloneParams, DEFAULT_PARAMS } from './sim/config';
import { Renderer } from './render/renderer';
import { createDevPanel } from './ui/devPanel';
import { Gallery } from './gallery/gallery';
import { BUILTIN_PRESETS } from './sim/presets';

const app = document.getElementById('app')!;

const canvas = document.createElement('canvas');
canvas.id = 'field';
app.appendChild(canvas);

const params = cloneParams(DEFAULT_PARAMS);
let field = new Field(params.size, params.seed);
let renderer = new Renderer(canvas, params.size);

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
  onChange: () => {},
  onReseed: (seed) => field.reseed(seed),
  onReset: () => {
    field = new Field(params.size, params.seed);
  },
});
app.appendChild(devPanel.el);

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
      field.tick(params);
      accumulator -= params.dt;
      steps++;
    }
    renderer.draw(field);
  }
}
requestAnimationFrame(frame);
