import { ELEMENT_NAMES, NUM_ELEMENTS } from '../sim/field';
import { cellColor } from '../sim/color';

const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * The legend/logo (spec 4): a plain pentagon labeled Wood-Fire-Earth-
 * Metal-Water with generation arrows around the rim and overcoming arrows
 * as the inner pentagram — accurate, geometric, undecorated. Click to
 * collapse to a small pentagon glyph.
 */
export function createLegend(): HTMLElement {
  const wrap = document.createElement('div');
  wrap.id = 'legend';
  wrap.className = 'legend';
  wrap.title = 'Generation around the rim; overcoming across the star. Click to collapse.';

  const size = 170;
  const cx = size / 2;
  const cy = size / 2 + 4;
  const r = 56;

  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('viewBox', `0 0 ${size} ${size}`);

  // vertex k at the top, proceeding clockwise in generation order
  const vx: number[] = [];
  const vy: number[] = [];
  for (let k = 0; k < NUM_ELEMENTS; k++) {
    const angle = -Math.PI / 2 + (k * 2 * Math.PI) / NUM_ELEMENTS;
    vx.push(cx + r * Math.cos(angle));
    vy.push(cy + r * Math.sin(angle));
  }

  const defs = document.createElementNS(SVG_NS, 'defs');
  for (const [id, color] of [
    ['arrow-gen', 'rgba(216,216,224,0.8)'],
    ['arrow-sup', 'rgba(216,216,224,0.35)'],
  ]) {
    const marker = document.createElementNS(SVG_NS, 'marker');
    marker.setAttribute('id', id);
    marker.setAttribute('viewBox', '0 0 8 8');
    marker.setAttribute('refX', '7');
    marker.setAttribute('refY', '4');
    marker.setAttribute('markerWidth', '5');
    marker.setAttribute('markerHeight', '5');
    marker.setAttribute('orient', 'auto-start-reverse');
    const tip = document.createElementNS(SVG_NS, 'path');
    tip.setAttribute('d', 'M 0 0 L 8 4 L 0 8 z');
    tip.setAttribute('fill', color);
    marker.appendChild(tip);
    defs.appendChild(marker);
  }
  svg.appendChild(defs);

  // an edge from vertex a to b, trimmed at both ends so it clears the labels
  const edge = (a: number, b: number, stroke: string, marker: string, trim: number) => {
    const dx = vx[b] - vx[a];
    const dy = vy[b] - vy[a];
    const len = Math.hypot(dx, dy);
    const ux = dx / len;
    const uy = dy / len;
    const line = document.createElementNS(SVG_NS, 'line');
    line.setAttribute('x1', String(vx[a] + ux * trim));
    line.setAttribute('y1', String(vy[a] + uy * trim));
    line.setAttribute('x2', String(vx[b] - ux * trim));
    line.setAttribute('y2', String(vy[b] - uy * trim));
    line.setAttribute('stroke', stroke);
    line.setAttribute('stroke-width', '1.3');
    line.setAttribute('marker-end', `url(#${marker})`);
    svg.appendChild(line);
  };

  // overcoming (k suppresses k+2): the inner pentagram, drawn first so the
  // rim reads on top
  for (let k = 0; k < NUM_ELEMENTS; k++) {
    edge(k, (k + 2) % NUM_ELEMENTS, 'rgba(216,216,224,0.3)', 'arrow-sup', 16);
  }
  // generation (k feeds k+1): arrows around the rim
  for (let k = 0; k < NUM_ELEMENTS; k++) {
    edge(k, (k + 1) % NUM_ELEMENTS, 'rgba(216,216,224,0.7)', 'arrow-gen', 15);
  }

  // vertex labels in each element's own (concentrated, neutral-p) color
  for (let k = 0; k < NUM_ELEMENTS; k++) {
    const w = [0.05, 0.05, 0.05, 0.05, 0.05];
    w[k] = 0.8;
    const [rr, gg, bb] = cellColor(w, 0.55);
    const label = document.createElementNS(SVG_NS, 'text');
    // push labels slightly outward from the pentagon
    const ox = (vx[k] - cx) * 1.28 + cx;
    const oy = (vy[k] - cy) * 1.28 + cy;
    label.setAttribute('x', String(ox));
    label.setAttribute('y', String(oy + 3));
    label.setAttribute('text-anchor', 'middle');
    label.setAttribute('fill', `rgb(${rr},${gg},${bb})`);
    label.setAttribute('font-size', '10');
    label.textContent = ELEMENT_NAMES[k];
    svg.appendChild(label);
  }

  wrap.appendChild(svg);
  wrap.addEventListener('click', () => wrap.classList.toggle('collapsed'));
  return wrap;
}
