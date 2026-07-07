import './style.css';
import { cloneParams, DEFAULT_PARAMS } from './sim/config';
import { Multiscale, SCALE_FACTOR, type ScaleName } from './sim/multiscale';
import { SceneRenderer, brushScaleForSpan, MIN_SPAN, MAX_SPAN, type Camera } from './render/sceneRenderer';
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
let multi = new Multiscale(params.size, params.seed, params);
let renderer = new SceneRenderer(canvas, multi);
let particles = new ParticleSystem(params.size, params.particleCount, params.seed);

const camera: Camera = { x: params.size / 2, y: params.size / 2, span: params.size };

function rebuildWorld(): void {
  multi = new Multiscale(params.size, params.seed, params);
  renderer = new SceneRenderer(canvas, multi);
  particles = new ParticleSystem(params.size, params.particleCount, params.seed);
  camera.x = params.size / 2;
  camera.y = params.size / 2;
  camera.span = Math.min(camera.span, MAX_SPAN);
  resize();
}

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
  Object.assign(params, preset.params);
  rebuildWorld();
  devPanel.refresh();
});

const hint = document.createElement('span');
hint.className = 'hint';
hint.textContent =
  'Stillness gathers influence; touch spends it. — scroll zoom, right-drag pan, ~ tune, G gallery, H hide UI';

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
    multi.reseed(seed);
    particles = new ParticleSystem(params.size, params.particleCount, seed);
  },
  onReset: () => rebuildWorld(),
});
app.appendChild(devPanel.el);

// --- brushes & influence -----------------------------------------------------
const palette = createBrushPalette();
app.appendChild(palette.el);
const influence = new Influence();

// pointer state in world (fine-grid) coordinates
const pointer = { x: 0, y: 0, over: false, down: false };
const pan = { active: false, lastX: 0, lastY: 0 };

function cssScale(): number {
  return canvas.getBoundingClientRect().width / camera.span;
}

function toWorld(clientX: number, clientY: number): { x: number; y: number } {
  const rect = canvas.getBoundingClientRect();
  const scale = rect.width / camera.span;
  const spanY = camera.span * (rect.height / rect.width);
  return {
    x: camera.x - camera.span / 2 + (clientX - rect.left) / scale,
    y: camera.y - spanY / 2 + (clientY - rect.top) / scale,
  };
}

function wrapCamera(): void {
  const w = params.size;
  camera.x = ((camera.x % w) + w) % w;
  camera.y = ((camera.y % w) + w) % w;
}

canvas.addEventListener('pointerdown', (e) => {
  if (e.button === 2) {
    pan.active = true;
    pan.lastX = e.clientX;
    pan.lastY = e.clientY;
    canvas.setPointerCapture(e.pointerId);
    return;
  }
  if (e.button !== 0) return;
  canvas.setPointerCapture(e.pointerId);
  const g = toWorld(e.clientX, e.clientY);
  pointer.x = g.x;
  pointer.y = g.y;
  pointer.down = true;
});
canvas.addEventListener('pointermove', (e) => {
  if (pan.active) {
    const scale = cssScale();
    camera.x -= (e.clientX - pan.lastX) / scale;
    camera.y -= (e.clientY - pan.lastY) / scale;
    pan.lastX = e.clientX;
    pan.lastY = e.clientY;
    wrapCamera();
    return;
  }
  const g = toWorld(e.clientX, e.clientY);
  pointer.x = g.x;
  pointer.y = g.y;
  pointer.over = true;
});
canvas.addEventListener('pointerup', (e) => {
  if (e.button === 2) pan.active = false;
  else pointer.down = false;
});
canvas.addEventListener('pointercancel', () => {
  pointer.down = false;
  pan.active = false;
});
canvas.addEventListener('pointerleave', () => {
  pointer.over = false;
  pointer.down = false;
  pan.active = false;
});
canvas.addEventListener('contextmenu', (e) => e.preventDefault());

canvas.addEventListener(
  'wheel',
  (e) => {
    e.preventDefault();
    const before = toWorld(e.clientX, e.clientY);
    const factor = Math.exp(e.deltaY * 0.0012);
    camera.span = Math.min(MAX_SPAN, Math.max(MIN_SPAN, camera.span * factor));
    // keep the world point under the cursor fixed while zooming
    const after = toWorld(e.clientX, e.clientY);
    camera.x += before.x - after.x;
    camera.y += before.y - after.y;
    wrapCamera();
  },
  { passive: false },
);

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

// brushing at mid/coarse zoom acts on that scale's grid, at that scale's cost
function scaleDivisor(scale: ScaleName): number {
  return scale === 'fine' ? 1 : scale === 'mid' ? SCALE_FACTOR : SCALE_FACTOR * SCALE_FACTOR;
}

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
    const brushScale = brushScaleForSpan(camera.span);
    const div = scaleDivisor(brushScale);
    while (accumulator >= params.dt && steps < 200) {
      // brush before tick, so the stroke's effect propagates this step
      const brushing = pointer.down && palette.state.kind !== null;
      if (brushing && palette.state.kind) {
        const target = multi.field(brushScale);
        const stroke: BrushStroke = {
          kind: palette.state.kind,
          x: pointer.x / div,
          y: pointer.y / div,
          radius: palette.state.radius,
        };
        // moving the climate is expensive: costs x4 at mid, x16 at coarse
        const cost = strokeCost(target, stroke, params, params.dt) * div;
        if (influence.spend(cost)) applyBrush(target, stroke, params, params.dt);
      } else {
        influence.idle(params.dt, params);
      }
      multi.tick(params);
      particles.step(multi.fine, params.particleSpeed, params.dt);
      accumulator -= params.dt;
      steps++;
    }
    canvas.classList.toggle('brushing', palette.state.kind !== null);
    palette.setInfluence(influence.value, influence.rampFactor());
    renderer.draw(multi, camera, {
      particles,
      showParticles: params.showParticles,
      showTrails: params.showTrails,
      trailFade: params.trailFade,
      cursor:
        pointer.over && palette.state.kind !== null
          ? { x: pointer.x, y: pointer.y, radius: palette.state.radius * div }
          : null,
    });
  }
}
requestAnimationFrame(frame);
