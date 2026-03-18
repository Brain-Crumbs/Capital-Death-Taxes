/* ════════════════════════════════════════════════════════════════════════════
   BORROW & DIE — CHART REGISTRY & SHARED CHART UTILITIES
   ════════════════════════════════════════════════════════════════════════════ */

'use strict';

// ── Chart registry (for destroy-on-reload) ───────────────────────────────────

export class ChartRegistry {
  #charts = {};

  make(id, config) {
    if (this.#charts[id]) { this.#charts[id].destroy(); delete this.#charts[id]; }
    const canvas = document.getElementById(id);
    if (!canvas) return;
    this.#charts[id] = new Chart(canvas, config);
    return this.#charts[id];
  }

  destroyAll() {
    for (const c of Object.values(this.#charts)) { try { c.destroy(); } catch {} }
    for (const k in this.#charts) delete this.#charts[k];
  }

  resize(id) {
    try { this.#charts[id]?.resize(); } catch {}
  }

  resizeAll() {
    for (const c of Object.values(this.#charts)) { try { c.resize(); } catch {} }
  }
}

export const charts = new ChartRegistry();

// ── Shared Chart.js defaults ─────────────────────────────────────────────────

export const BASE_FONT  = { family: "'Courier New', Courier, monospace", size: 11, color: '#6c757d' };
export const GRID_COLOR = '#1e1e3a';
export const TICK_COLOR = '#6c757d';

export function baseScales(xOpts = {}, yOpts = {}) {
  return {
    x: {
      ticks: { color: TICK_COLOR, font: BASE_FONT, ...xOpts.ticks },
      grid:  { color: GRID_COLOR },
      ...xOpts,
    },
    y: {
      ticks: { color: TICK_COLOR, font: BASE_FONT, ...yOpts.ticks },
      grid:  { color: GRID_COLOR },
      ...yOpts,
    },
  };
}

// ── Gauge (semi-circle doughnut) ─────────────────────────────────────────────

export function makeGauge(canvasId, valueId, value, { greenRange, amberRange } = {}) {
  const pct = value == null ? 0 : Math.max(0, Math.min(1, value));
  const display = value == null ? '—' : Math.round(pct * 100) + '%';

  let color = '#ff1744';
  if (greenRange && pct >= greenRange[0] && pct <= greenRange[1]) color = '#00e676';
  else if (amberRange && pct >= amberRange[0] && pct <= amberRange[1]) color = '#ffd740';

  document.getElementById(valueId).textContent = display;
  document.getElementById(valueId).style.color  = color;

  charts.make(canvasId, {
    type: 'doughnut',
    data: {
      datasets: [{
        data:            [pct, 1 - pct],
        backgroundColor: [color, '#1e1e3a'],
        borderWidth:     0,
        circumference:   180,
        rotation:        270,
      }],
    },
    options: {
      animation:   { duration: 600 },
      cutout:      '70%',
      plugins:     { legend: { display: false }, tooltip: { enabled: false } },
      responsive:  false,
      maintainAspectRatio: false,
    },
  });
}
