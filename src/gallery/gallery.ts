import { Field } from '../sim/field';
import type { SimParams } from '../sim/config';
import { Renderer } from '../render/renderer';
import { saveUserPreset } from '../sim/presets';

interface SweepResultEntry {
  params: SimParams;
  score: number;
  scoreBreakdown: { autocorrelation: number; activity: number; dominant: number };
}

interface SweepResultsFile {
  generatedAt: string;
  results: SweepResultEntry[];
}

interface GalleryCard {
  field: Field;
  renderer: Renderer;
  params: SimParams;
}

/**
 * Gallery mode (spec 1.4): the sweep harness's top scorers replay side by
 * side as live thumbnails. The metrics only measure "alive" — this view is
 * where a human eye picks "beautiful" and saves it as a preset.
 */
export class Gallery {
  private readonly el: HTMLElement;
  private cards: GalleryCard[] = [];
  private raf = 0;
  private lastTime = 0;
  private accumulator = 0;
  private readonly container: HTMLElement;

  constructor(container: HTMLElement) {
    this.container = container;
    this.el = document.createElement('div');
    this.el.className = 'gallery hidden';
    this.container.appendChild(this.el);
  }

  async open(): Promise<void> {
    this.el.classList.remove('hidden');
    if (this.cards.length === 0) await this.load();
    this.lastTime = performance.now();
    this.loop(this.lastTime);
  }

  close(): void {
    this.el.classList.add('hidden');
    cancelAnimationFrame(this.raf);
  }

  private async load(): Promise<void> {
    this.el.textContent = 'Loading sweep results...';
    let data: SweepResultsFile;
    try {
      const res = await fetch('/sweep-results.json');
      data = await res.json();
    } catch {
      this.el.textContent = 'No sweep results found. Run `npm run sweep` first.';
      return;
    }
    this.el.textContent = '';

    this.cards = data.results.map((entry) => {
      const params = entry.params;
      const field = new Field(params.size, params.seed);
      const cell = document.createElement('div');
      cell.className = 'gallery-cell';

      const canvas = document.createElement('canvas');
      canvas.width = 256;
      canvas.height = 256;
      cell.appendChild(canvas);

      const label = document.createElement('div');
      label.className = 'label';
      label.textContent = `score ${entry.score.toFixed(2)} — α${params.alpha} β${params.beta} μ${params.mu}`;
      cell.appendChild(label);

      const saveBtn = document.createElement('button');
      saveBtn.textContent = 'Save as preset';
      saveBtn.addEventListener('click', () => {
        const name = prompt('Preset name?', `Preset ${params.alpha}/${params.beta}/${params.mu}`);
        if (!name) return;
        saveUserPreset({ name, params });
        saveBtn.textContent = 'Saved!';
        setTimeout(() => (saveBtn.textContent = 'Save as preset'), 1200);
      });
      cell.appendChild(saveBtn);

      this.el.appendChild(cell);
      const renderer = new Renderer(canvas, params.size);
      return { field, renderer, params };
    });
  }

  private loop = (time: number): void => {
    this.raf = requestAnimationFrame(this.loop);
    const dtReal = Math.min(0.1, (time - this.lastTime) / 1000);
    this.lastTime = time;
    this.accumulator += dtReal;

    const dt = this.cards[0]?.params.dt ?? 1 / 30;
    while (this.accumulator >= dt) {
      for (const card of this.cards) card.field.tick(card.params);
      this.accumulator -= dt;
    }
    for (const card of this.cards) card.renderer.draw(card.field);
  };
}
