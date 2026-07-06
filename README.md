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

- **`~`** — toggle the dev panel (every tunable constant, live-adjustable)
- **`G`** — toggle Gallery mode (live thumbnails of the sweep's top-scoring presets)
- **`H`** — hide/show UI chrome
- **Space** — pause/resume
- Top bar: pause, speed (0.5x/1x/2x), and a preset dropdown

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
