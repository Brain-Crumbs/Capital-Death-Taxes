/* ════════════════════════════════════════════════════════════════════════════
   BORROW & DIE — TAB 3: ASSET DYNAMICS
   ════════════════════════════════════════════════════════════════════════════ */

'use strict';

import { industryColor } from '../constants.js';
import { percentile, median } from '../stats.js';
import { charts, baseScales, makeGauge, BASE_FONT, TICK_COLOR } from '../charts.js';

export function renderAssets(agg) {
  // ── Asset value lines ──────────────────────────────────────────────────────
  const allIndustries = Object.keys(agg.assetMeanByIndustry);
  const maxLen = Math.max(...Object.values(agg.assetMeanByIndustry).map(a => a.length), 0);
  const roundLabels = Array.from({ length: maxLen }, (_, i) => `R${i + 1}`);

  charts.make('chart-asset-lines', {
    type: 'line',
    data: {
      labels: roundLabels,
      datasets: allIndustries.map(ind => ({
        label:           ind,
        data:            agg.assetMeanByIndustry[ind],
        borderColor:     industryColor(ind),
        backgroundColor: 'transparent',
        borderWidth: 2,
        pointRadius: 2,
        tension:     0.3,
        spanGaps:    true,
      })),
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: true,
          labels: { color: '#a0a0c0', font: BASE_FONT, boxWidth: 12 },
        },
      },
      scales: baseScales(
        {},
        { title: { display: true, text: 'Mean Asset Value ($)', color: TICK_COLOR, font: BASE_FONT } }
      ),
    },
  });

  // ── Final value box-plot (floating bars P10–P90, dot=median) ──────────────
  const boxIndustries = Object.keys(agg.finalValsByIndustry);
  const p10  = boxIndustries.map(i => percentile(agg.finalValsByIndustry[i], 10));
  const meds = boxIndustries.map(i => median(agg.finalValsByIndustry[i]));
  const p90  = boxIndustries.map(i => percentile(agg.finalValsByIndustry[i], 90));
  const q1   = boxIndustries.map(i => percentile(agg.finalValsByIndustry[i], 25));
  const q3   = boxIndustries.map(i => percentile(agg.finalValsByIndustry[i], 75));

  charts.make('chart-asset-box', {
    type: 'bar',
    data: {
      labels: boxIndustries,
      datasets: [
        {
          label: 'P10–Q1',
          data:  boxIndustries.map((_, i) => [p10[i] ?? 0, q1[i] ?? 0]),
          backgroundColor: boxIndustries.map(i => industryColor(i) + '44'),
          borderWidth: 0,
          borderSkipped: false,
        },
        {
          label: 'Q1–Q3 (IQR)',
          data:  boxIndustries.map((_, i) => [q1[i] ?? 0, q3[i] ?? 0]),
          backgroundColor: boxIndustries.map(i => industryColor(i) + 'cc'),
          borderWidth: 0,
          borderSkipped: false,
        },
        {
          label: 'Q3–P90',
          data:  boxIndustries.map((_, i) => [q3[i] ?? 0, p90[i] ?? 0]),
          backgroundColor: boxIndustries.map(i => industryColor(i) + '44'),
          borderWidth: 0,
          borderSkipped: false,
        },
        {
          label: 'Median',
          data:  meds,
          type:  'scatter',
          pointStyle: 'circle',
          pointRadius: 5,
          backgroundColor: boxIndustries.map(i => industryColor(i)),
          borderColor: '#0d0d1a',
          borderWidth: 1,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: {
          label: ctx => {
            if (ctx.dataset.label === 'Median') return ` median: ${ctx.parsed.y?.toFixed(1)}`;
            const [lo, hi] = ctx.parsed._custom || [ctx.parsed.y, ctx.parsed.y];
            return ` ${ctx.dataset.label}: ${lo?.toFixed(1)} – ${hi?.toFixed(1)}`;
          }
        }},
      },
      scales: baseScales(
        { ticks: { color: TICK_COLOR, font: BASE_FONT } },
        { title: { display: true, text: 'Final Asset Value ($)', color: TICK_COLOR, font: BASE_FONT } }
      ),
    },
  });

  // ── GMI line ± stddev band ────────────────────────────────────────────────
  const gmiLabels = Array.from({ length: agg.gmiMean.length }, (_, i) => `R${i + 1}`);
  const gmiHi = agg.gmiMean.map((m, i) => m == null ? null : m + (agg.gmiStddev[i] || 0));
  const gmiLo = agg.gmiMean.map((m, i) => m == null ? null : m - (agg.gmiStddev[i] || 0));

  charts.make('chart-gmi', {
    type: 'line',
    data: {
      labels: gmiLabels,
      datasets: [
        {
          label:   '+1σ',
          data:    gmiHi,
          borderColor: 'rgba(206,147,216,0.2)',
          backgroundColor: 'rgba(206,147,216,0.08)',
          borderWidth: 1,
          pointRadius: 0,
          fill:  '+1',
          spanGaps: true,
          tension: 0.3,
          order: 3,
        },
        {
          label:   'Mean GMI',
          data:    agg.gmiMean,
          borderColor: '#ce93d8',
          backgroundColor: 'transparent',
          borderWidth: 2,
          pointRadius: 2,
          spanGaps: true,
          tension: 0.3,
          order: 1,
        },
        {
          label:   '−1σ',
          data:    gmiLo,
          borderColor: 'rgba(206,147,216,0.2)',
          backgroundColor: 'rgba(206,147,216,0.08)',
          borderWidth: 1,
          pointRadius: 0,
          fill:  '-1',
          spanGaps: true,
          tension: 0.3,
          order: 2,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: ctx => ` ${ctx.dataset.label}: ${ctx.parsed.y?.toFixed(2)}` } },
      },
      scales: baseScales(
        {},
        { title: { display: true, text: 'GMI Delta', color: TICK_COLOR, font: BASE_FONT } }
      ),
    },
  });

  // ── Total GMI (cumulative) line ± stddev band ─────────────────────────────
  const gmiCumLabels = Array.from({ length: agg.gmiCumMean.length }, (_, i) => `R${i + 1}`);
  const gmiCumHi = agg.gmiCumMean.map((m, i) => m == null ? null : m + (agg.gmiCumStddev[i] || 0));
  const gmiCumLo = agg.gmiCumMean.map((m, i) => m == null ? null : m - (agg.gmiCumStddev[i] || 0));

  charts.make('chart-gmi-total', {
    type: 'line',
    data: {
      labels: gmiCumLabels,
      datasets: [
        {
          label:   '+1σ',
          data:    gmiCumHi,
          borderColor: 'rgba(206,147,216,0.2)',
          backgroundColor: 'rgba(206,147,216,0.08)',
          borderWidth: 1,
          pointRadius: 0,
          fill:  '+1',
          spanGaps: true,
          tension: 0.3,
          order: 3,
        },
        {
          label:   'Mean Total GMI',
          data:    agg.gmiCumMean,
          borderColor: '#ce93d8',
          backgroundColor: 'transparent',
          borderWidth: 2,
          pointRadius: 2,
          spanGaps: true,
          tension: 0.3,
          order: 1,
        },
        {
          label:   '−1σ',
          data:    gmiCumLo,
          borderColor: 'rgba(206,147,216,0.2)',
          backgroundColor: 'rgba(206,147,216,0.08)',
          borderWidth: 1,
          pointRadius: 0,
          fill:  '-1',
          spanGaps: true,
          tension: 0.3,
          order: 2,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: ctx => ` ${ctx.dataset.label}: ${ctx.parsed.y?.toFixed(2)}` } },
      },
      scales: baseScales(
        {},
        { title: { display: true, text: 'Total GMI (Cumulative)', color: TICK_COLOR, font: BASE_FONT } }
      ),
    },
  });

  // ── Loan utilization gauge ────────────────────────────────────────────────
  makeGauge('gauge-loan-util', 'gv-loan-util', agg.loanUtilMean, {
    greenRange: [0.50, 0.80], amberRange: [0.20, 0.95],
  });
}
