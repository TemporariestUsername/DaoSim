// Headless sweep CLI (spec 1.4): `npm run sweep`
// Runs the default parameter grid for ~10k ticks each, scores every run on
// entropy/spatial-structure/sustained-motion, and writes the top scorers to
// public/sweep-results.json for Gallery mode (src/gallery) to load and replay live.
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { generateDefaultGrid, runSweep, topN, DEFAULT_SWEEP_OPTIONS } from './harness';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outPath = path.join(__dirname, '..', '..', 'public', 'sweep-results.json');

function main() {
  const grid = generateDefaultGrid();
  console.log(`Sweeping ${grid.length} parameter combinations, ${DEFAULT_SWEEP_OPTIONS.ticks} ticks each...`);

  const t0 = Date.now();
  const results = runSweep(grid);
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`Done in ${elapsed}s`);

  const ranked = [...results].sort((a, b) => b.score - a.score);
  console.log('\nrank  score  autocorr  activity  dominant  alpha  beta   mu');
  ranked.forEach((r, i) => {
    console.log(
      `${String(i + 1).padStart(4)}  ${r.score.toFixed(3)}  ${r.scoreBreakdown.autocorrelation.toFixed(3)}     ` +
        `${r.scoreBreakdown.activity.toFixed(3)}     ${r.scoreBreakdown.dominant.toFixed(3)}     ` +
        `${r.params.alpha.toFixed(2)}   ${r.params.beta.toFixed(2)}   ${r.params.mu.toFixed(2)}`,
    );
  });

  const top = topN(results, 8);
  const alive = top.filter((r) => r.score > 0);
  console.log(`\n${alive.length}/${top.length} of the top scorers clear the living-field bar (score > 0).`);

  const payload = {
    generatedAt: new Date().toISOString(),
    options: DEFAULT_SWEEP_OPTIONS,
    results: top.map((r) => ({
      params: r.params,
      score: r.score,
      scoreBreakdown: r.scoreBreakdown,
      samples: r.samples,
    })),
  };
  writeFileSync(outPath, JSON.stringify(payload, null, 2));
  console.log(`\nWrote top ${top.length} to ${outPath}`);
}

main();
