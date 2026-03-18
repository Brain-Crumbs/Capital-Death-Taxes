/* ════════════════════════════════════════════════════════════════════════════
   BORROW & DIE — TAB 2: ECONOMIC BALANCE
   ════════════════════════════════════════════════════════════════════════════ */

'use strict';

import { industryColor } from '../constants.js';
import { charts, baseScales, makeGauge, BASE_FONT, TICK_COLOR } from '../charts.js';

export function renderEconomy(agg) {
  // ── Win rate by CEO ────────────────────────────────────────────────────────
  const ceoEntries = Object.entries(agg.winRateByCeo).sort((a, b) => b[1] - a[1]);
  const ceoLabels  = ceoEntries.map(e => e[0]);
  const ceoVals    = ceoEntries.map(e => Math.round(e[1] * 100));

  charts.make('chart-win-ceo', {
    type: 'bar',
    data: {
      labels: ceoLabels,
      datasets: [
        {
          label: 'Win %',
          data:  ceoVals,
          backgroundColor: ceoVals.map(v => v > 40 ? 'rgba(255,23,68,0.8)' : 'rgba(79,195,247,0.8)'),
          borderWidth: 0,
          borderRadius: 3,
        },
        {
          // reference line at 25%
          label: '25% equal share',
          data:  ceoLabels.map(() => 25),
          type:  'line',
          borderColor: '#ff1744',
          borderWidth: 1,
          borderDash: [4, 3],
          pointRadius: 0,
          fill: false,
          order: 0,
        },
      ],
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: ctx => ` ${ctx.parsed.x}%` } },
      },
      scales: baseScales(
        { min: 0, max: 100, ticks: { callback: v => v + '%', color: TICK_COLOR, font: BASE_FONT } },
        { ticks: { color: TICK_COLOR, font: BASE_FONT } }
      ),
    },
  });

  // ── Win rate by Industry ───────────────────────────────────────────────────
  const indEntries = Object.entries(agg.winRateByIndustry).sort((a, b) => b[1] - a[1]);
  const indLabels  = indEntries.map(e => e[0]);
  const indVals    = indEntries.map(e => Math.round(e[1] * 100));

  charts.make('chart-win-industry', {
    type: 'bar',
    data: {
      labels: indLabels,
      datasets: [{
        label: '% wins with industry',
        data:  indVals,
        backgroundColor: indLabels.map(l => industryColor(l) + 'cc'),
        borderWidth: 0,
        borderRadius: 3,
      }],
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: ctx => ` ${ctx.parsed.x}%` } },
      },
      scales: baseScales(
        { min: 0, max: 100, ticks: { callback: v => v + '%', color: TICK_COLOR, font: BASE_FONT } },
        { ticks: { color: TICK_COLOR, font: BASE_FONT } }
      ),
    },
  });

  // ── Gauges ─────────────────────────────────────────────────────────────────
  makeGauge('gauge-income-trap', 'gv-income-trap', agg.incomeTrapRate, {
    greenRange: [0.50, 1.0], amberRange: [0.30, 1.0],
  });
  makeGauge('gauge-tax-offset', 'gv-tax-offset', agg.taxOffsetRate, {
    greenRange: [0.40, 0.80], amberRange: [0.20, 0.90],
  });
  makeGauge('gauge-integration', 'gv-integration', agg.integrationRate, {
    greenRange: [0.40, 0.60], amberRange: [0.20, 0.80],
  });
}
