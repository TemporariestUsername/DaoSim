import './style.css';
import { cloneParams, DEFAULT_PARAMS } from './sim/config';
import { SCALE_FACTOR } from './sim/multiscale';
import { SceneRenderer, brushScaleForSpan, MIN_SPAN, MAX_SPAN, type Camera } from './render/sceneRenderer';
import { createDevPanel } from './ui/devPanel';
import { Gallery } from './gallery/gallery';
import { BUILTIN_PRESETS } from './sim/presets';
import { createBrushPalette } from './ui/brushPalette';
import type { MainToWorker, WorkerFrame } from './sim/workerTypes';

const app = document.getElementById('app')!;

const canvas = document.createElement('canvas');
canvas.id = 'field';
app.appendChild(canvas);

const params = cloneParams(DEFAULT_PARAMS);
let renderer = new SceneRenderer(canvas, params.size);
const camera: Camera = { x: params.size / 2, y: params.size / 2, span: params.size };

// --- sim worker ---------------------------------------------------------------
// The simulation lives entirely in a worker (spec 6): the main thread sends
// one frame request per rAF (never more than one in flight) with the pointer
// snapshot, and gets back painted layer buffers to composite.
const worker = new Worker(new URL('./sim/worker.ts', import.meta.url), { type: 'module' });

function send(msg: MainToWorker, transfer?: Transferable[]): void {
  worker.postMessage(msg, transfer ?? []);
}

send({ t: 'init', params });

function rebuildWorld(): void {
  renderer = new SceneRenderer(canvas, params.size);
  camera.x = params.size / 2;
  camera.y = params.size / 2;
  camera.span = Math.min(Math.max(camera.span, MIN_SPAN), MAX_SPAN);
  resize();
  send({ t: 'reset', params });
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
  onChange: () => send({ t: 'params', params }),
  onReseed: (seed) => send({ t: 'reseed', seed }),
  onReset: () => rebuildWorld(),
});
app.appendChild(devPanel.el);

// --- brushes & influence UI ---------------------------------------------------
const palette = createBrushPalette();
app.appendChild(palette.el);

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

// --- frame loop: request from worker, composite reply ------------------------
let lastTime = performance.now();
let pendingSimTime = 0;
let awaitingFrame = false;
let recycle: ArrayBuffer[] = [];

function requestFrame(): void {
  awaitingFrame = true;
  const brushScale = brushScaleForSpan(camera.span);
  send(
    {
      t: 'frame',
      input: {
        dtSim: pendingSimTime,
        paused: paused || galleryOpen,
        pointerDown: pointer.down,
        pointerX: pointer.x,
        pointerY: pointer.y,
        brush: palette.state.kind,
        brushRadius: palette.state.radius,
        brushScale,
      },
      recycle,
    },
    recycle,
  );
  pendingSimTime = 0;
  recycle = [];
}

worker.onmessage = (e: MessageEvent) => {
  const frame = e.data as WorkerFrame;
  if (frame.t !== 'frame') return;
  awaitingFrame = false;

  if (!galleryOpen && frame.fineSize === params.size) {
    const brushScale = brushScaleForSpan(camera.span);
    const div = brushScale === 'fine' ? 1 : brushScale === 'mid' ? SCALE_FACTOR : SCALE_FACTOR * SCALE_FACTOR;
    canvas.classList.toggle('brushing', palette.state.kind !== null);
    palette.setInfluence(frame.influence, frame.influenceRamp);
    renderer.drawFrame(frame, camera, {
      showParticles: params.showParticles,
      showTrails: params.showTrails,
      trailFade: params.trailFade,
      cursor:
        pointer.over && palette.state.kind !== null
          ? { x: pointer.x, y: pointer.y, radius: palette.state.radius * div }
          : null,
    });
  }
  // hand the buffers back to the worker on the next request
  recycle = [frame.fine, frame.mid, frame.coarse, frame.particles];
};

function frame(time: number) {
  requestAnimationFrame(frame);
  const dtReal = Math.min(0.25, (time - lastTime) / 1000);
  lastTime = time;
  pendingSimTime = Math.min(0.25, pendingSimTime + dtReal * speed);
  if (!awaitingFrame) requestFrame();
}
requestAnimationFrame(frame);
