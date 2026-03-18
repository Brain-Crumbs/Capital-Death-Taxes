/* ════════════════════════════════════════════════════════════════════════════
   BORROW & DIE — TAB 1: HEALTH OVERVIEW
   ════════════════════════════════════════════════════════════════════════════ */

'use strict';

import { HEALTH_THRESHOLDS, healthColor, healthRgba } from '../constants.js';
import { charts, baseScales, BASE_FONT, TICK_COLOR } from '../charts.js';

export function renderHealth(agg, runs) {
  // ── Stat cards ─────────────────────────────────────────────────────────────
  const labels = {
    game_length_rounds:         'Game Length',
    first_asset_round:          'First Asset Round',
    first_death_roll_round:     'First Death Roll',
    death_count:                'Deaths',
    bankruptcy_count:           'Bankruptcies',
    collateral_violation_count: 'Collateral Violations',
  };
  const container = document.getElementById('health-cards');
  container.innerHTML = '';

  for (const [key, label] of Object.entries(labels)) {
    const s   = agg.numericStats[key];
    const m   = s.mean;
    const sd  = s.stddev;
    const cls = healthColor(key, m);
    const t   = HEALTH_THRESHOLDS[key];
    const card = document.createElement('div');
    card.className = `stat-card ${cls}`;
    card.innerHTML = `
      <div class="health-dot"></div>
      <div class="label">${label}</div>
      <div class="value">${m == null ? '—' : m.toFixed(2)}</div>
      <div class="sub">${sd != null ? '± ' + sd.toFixed(2) + ' stddev' : 'no variance'}</div>
      <div class="target">target ${t.target} · flag ${t.flag}</div>
    `;
    container.appendChild(card);
  }

  // ── Bar chart: game length distribution ────────────────────────────────────
  const gameLens = runs.map(r => r.metrics.game_length_rounds).filter(v => v != null);
  const minR = Math.min(...gameLens, 1);
  const maxR = Math.max(...gameLens, 1);
  const buckets = {};
  for (let r = minR; r <= maxR; r++) buckets[r] = 0;
  for (const v of gameLens) buckets[v] = (buckets[v] || 0) + 1;
  const roundLabels = Object.keys(buckets).map(Number).sort((a, b) => a - b);
  const counts = roundLabels.map(r => buckets[r]);

  charts.make('chart-game-length', {
    type: 'bar',
    data: {
      labels: roundLabels.map(String),
      datasets: [{
        label: 'Runs',
        data:  counts,
        backgroundColor: roundLabels.map(r => healthRgba('game_length_rounds', r, 0.7)),
        borderWidth: 0,
        borderRadius: 3,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: {
        callbacks: { label: ctx => ` ${ctx.parsed.y} run(s)` }
      }},
      scales: baseScales(
        { title: { display: true, text: 'Rounds', color: TICK_COLOR, font: BASE_FONT } },
        { title: { display: true, text: 'Count',  color: TICK_COLOR, font: BASE_FONT },
          ticks: { stepSize: 1, color: TICK_COLOR, font: BASE_FONT } }
      ),
    },
  });
}
