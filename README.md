# DaoSim

A sandbox simulation about cycles. Five elements generate and overcome one
another across a torus grid, Yin and Yang set the local tempo, and the
whole thing is designed to never sit still. No goals, no score — you watch,
and occasionally nudge it.

This repo currently implements:

- **Milestone 1: Living field** — the element reaction-diffusion sim, canvas
  rendering, a runtime tuning panel, and the headless sweep harness used to
  find parameter regions that stay alive.
- **Milestone 2: Breath & current** — the Yin-Yang polarity oscillator (the
  reversal principle: sustained Yang overshoots and collapses into Yin, and
  vice versa) coupled to local tempo, plus a flow-visualization layer of
  motes that advect along the direction waves travel, with fading trails.
- **Milestone 3: Touch** — brushes (Yang, Yin, the five element seeds, and
  Still, which forms a slowly eroding clot that waves pile around) and the
  restraint economy: Influence regenerates only while you do nothing, drains
  while you paint, and costs more in turbulent regions (the turbulence tax).
- **Milestone 4: Depth** — three grids running the same rules at different
  sizes and tempos (128 at 1x, 32 at 1/8x, 8 at 1/64x), coupled upward by
  aggregation and downward by a constant bias, so patterns echo across
  scales. Scroll-zoom crossfades the render source fine → mid → coarse, and
  brushes at those zoom levels act on that scale's grid at 4x / 16x cost.
  The whole simulation (fields, particles, brushes, influence) runs in a
  Web Worker that paints the RGBA layer buffers and ships them to the main
  thread as transferables; the main thread only handles input and
  compositing.
- **Milestone 5: Memory** — Field Notes, a naturalist's journal that
  passively logs emergent regimes the first time they occur (spiral weave,
  element blooms, eddies, clots, deep breaths, cascades) with a timestamped
  thumbnail; auto-save to localStorage with resume on reload; full-state
  export/import (a self-contained binary that preserves the exact PRNG
  stream); and PNG snapshots.

## Requirements

- [Node.js](https://nodejs.org/) 18+ (developed against Node 22)
- npm (ships with Node)

## Installation

```bash
git clone <this-repo-url>
cd DaoSim
npm install
```

## Running it

Start the dev server:

```bash
npm run dev
```

Then open the printed local URL (typically `http://localhost:5173`) in a browser.

### Controls

- **Click/drag** — paint with the selected brush (pick one in the left palette;
  Observe = no brush, influence regenerates)
- **`~`** — toggle the dev panel (every tunable constant, live-adjustable)
- **`G`** — toggle Gallery mode (live thumbnails of the sweep's top-scoring presets)
- **`H`** — hide/show UI chrome
- **`M`** — meditation mode: UI hidden, slow auto-drifting camera; any click or key exits
- **Space** — pause/resume
- Top bar: pause, speed (0.5x/1x/2x), preset dropdown, Field Notes journal,
  PNG snapshot, export/import of the full sim state, and the sound toggle
  (five just-intoned tones following the element shares; off by default)
- Left palette: brush buttons, radius slider (1-16 cells), and the Influence meter
- Bottom right: the pentagon legend — generation arrows around the rim,
  overcoming arrows across the star; click to collapse

## Other scripts

```bash
npm run build     # type-check and build for production
npm run preview   # preview the production build locally
npm test          # run the unit tests (vitest)
npm run sweep     # headless parameter sweep -> public/sweep-results.json
```

`npm run sweep` runs the default parameter grid for ~10k ticks per
combination, scores each on spatial structure / sustained motion / no
monoculture collapse, and writes the top scorers to
`public/sweep-results.json`. Gallery mode (key `G`) reads that file to
render live thumbnails so you can audition and save new presets by eye.

## Project structure

```
src/
  sim/       core reaction-diffusion field, config/param registry, color mapping, presets
  render/    canvas rendering (offscreen buffer + smoothed upscale)
  ui/        dev panel
  sweep/     headless sweep harness + CLI
  gallery/   live gallery mode
  test/      unit tests
```
