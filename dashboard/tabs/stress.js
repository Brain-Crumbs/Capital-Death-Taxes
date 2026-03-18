/* ════════════════════════════════════════════════════════════════════════════
   BORROW & DIE — TAB 4: STRESS & DEATH
   ════════════════════════════════════════════════════════════════════════════ */

'use strict';

import { stressRgba } from '../constants.js';
import { charts, baseScales, BASE_FONT, TICK_COLOR } from '../charts.js';

export function renderStress(agg) {
  // ── Stress histogram ───────────────────────────────────────────────────────
  const histLabels = agg.stressHist.map((_, i) => String(i));
  const histColors = agg.stressHist.map((_, i) => stressRgba(i, 0.8));

  charts.make('chart-stress-hist', {
    type: 'bar',
    data: {
      labels: histLabels,
      datasets: [{
        label: 'Count',
        data:  agg.stressHist,
        backgroundColor: histColors,
        borderWidth: 0,
        borderRadius: 3,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: baseScales(
        { title: { display: true, text: 'Stress Level', color: TICK_COLOR, font: BASE_FONT } },
        { title: { display: true, text: 'Count', color: TICK_COLOR, font: BASE_FONT },
          ticks: { stepSize: 1, color: TICK_COLOR, font: BASE_FONT } }
      ),
    },
  });

  // ── Scatter: stress at death roll vs final score ───────────────────────────
  const scatterData = agg.stressScatter
    .filter(p => p.score != null)
    .map(p => ({ x: p.stress, y: p.score }));

  charts.make('chart-stress-scatter', {
    type: 'scatter',
    data: {
      datasets: [{
        label: 'Player',
        data:  scatterData,
        backgroundColor: 'rgba(255,23,68,0.5)',
        pointRadius: 4,
        borderWidth: 0,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: baseScales(
        { title: { display: true, text: 'Stress at Death Roll', color: TICK_COLOR, font: BASE_FONT } },
        { title: { display: true, text: 'Final Score',          color: TICK_COLOR, font: BASE_FONT } }
      ),
    },
  });

  // ── Mean stress by CEO archetype (horizontal bar) ──────────────────────────
  const archEntries = Object.entries(agg.meanStressByArch)
    .filter(([, v]) => v != null)
    .sort((a, b) => b[1] - a[1]);

  charts.make('chart-stress-ceo', {
    type: 'bar',
    data: {
      labels: archEntries.map(e => e[0]),
      datasets: [{
        label: 'Mean Stress',
        data:  archEntries.map(e => +(e[1] || 0).toFixed(2)),
        backgroundColor: archEntries.map(([, v]) => stressRgba(v, 0.7)),
        borderWidth: 0,
        borderRadius: 3,
      }],
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: baseScales(
        { title: { display: true, text: 'Mean Stress', color: TICK_COLOR, font: BASE_FONT } },
        { ticks: { color: TICK_COLOR, font: BASE_FONT } }
      ),
    },
  });

  // ── Death/bankruptcy table ─────────────────────────────────────────────────
  const tbody = document.getElementById('death-table-body');
  tbody.innerHTML = '';
  const rounds = Object.keys(agg.deathEventsByRound).map(Number).sort((a, b) => a - b);
  if (!rounds.length) {
    tbody.innerHTML = '<tr><td colspan="4" class="muted" style="text-align:center;padding:16px">No death events recorded</td></tr>';
  } else {
    for (const r of rounds) {
      const ev = agg.deathEventsByRound[r];
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td class="num">${r}</td>
        <td class="num">${ev.deaths}</td>
        <td class="num">${ev.banks}</td>
        <td class="muted">${ev.runs}</td>
      `;
      tbody.appendChild(tr);
    }
  }
}
