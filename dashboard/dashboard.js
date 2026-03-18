/* ════════════════════════════════════════════════════════════════════════════
   BORROW & DIE — DASHBOARD LOGIC
   ════════════════════════════════════════════════════════════════════════════ */

'use strict';

// ── Constants ────────────────────────────────────────────────────────────────

const INDUSTRY_COLORS = {
  TECHNOLOGY:      '#4fc3f7',
  ENERGY:          '#ffb74d',
  REAL_ESTATE:     '#a5d6a7',
  FINANCE:         '#ce93d8',
  MANUFACTURING:   '#80cbc4',
  MEDIA:           '#f48fb1',
  MEDIA_ENTERTAINMENT: '#f48fb1',
  HYBRID:          '#ffe082',
};

// Colour for an industry (normalises MEDIA → MEDIA_ENTERTAINMENT etc.)
function industryColor(ind) {
  return INDUSTRY_COLORS[ind] || INDUSTRY_COLORS[(ind||'').replace('-','_').toUpperCase()] || '#888';
}

// ── Health thresholds ────────────────────────────────────────────────────────
// green = [lo, hi], amber = [lo, hi] — anything outside amber is red

const HEALTH_THRESHOLDS = {
  game_length_rounds:          { green: [8, 12],  amber: [6, 14],  target: '~10',  flag: '<6 or >14' },
  first_asset_round:           { green: [1, 4],   amber: [1, 6],   target: '≤4',   flag: '>6' },
  first_death_roll_round:      { green: [6, 8],   amber: [4, 10],  target: '6–8',  flag: '<4 or >10' },
  death_count:                 { green: [0.7, 1.5],amber:[0.3, 2.5],target:'~1',   flag: '0 or >2' },
  bankruptcy_count:            { green: [0.6, 1.5],amber:[0.2, 3.0],target:'~1',   flag: '0 or >3' },
  collateral_violation_count:  { green: [1, 3],   amber: [0.5, 6], target: '1–3',  flag: '0 or >6' },
};

function healthColor(metric, val) {
  if (val === null || val === undefined) return 'card-amber';
  const t = HEALTH_THRESHOLDS[metric];
  if (!t) return 'card-amber';
  if (val >= t.green[0] && val <= t.green[1]) return 'card-green';
  if (val >= t.amber[0] && val <= t.amber[1]) return 'card-amber';
  return 'card-red';
}

// ── Stat helpers ─────────────────────────────────────────────────────────────

function mean(arr) {
  const a = arr.filter(v => v != null && !isNaN(v));
  return a.length ? a.reduce((s,v) => s+v, 0) / a.length : null;
}

function stddev(arr) {
  const a = arr.filter(v => v != null && !isNaN(v));
  if (a.length < 2) return null;
  const m = mean(a);
  return Math.sqrt(a.reduce((s,v) => s+(v-m)**2, 0) / a.length);
}

function percentile(arr, p) {
  const a = arr.filter(v => v != null && !isNaN(v)).sort((x,y) => x-y);
  if (!a.length) return null;
  const idx = p/100 * (a.length-1);
  const lo = Math.floor(idx), hi = Math.ceil(idx);
  if (lo === hi) return a[lo];
  return a[lo]*(1-(idx-lo)) + a[hi]*(idx-lo);
}

function median(arr) { return percentile(arr, 50); }

// ── Aggregate raw runs → summary stats ──────────────────────────────────────

function aggregate(runs) {
  const ms = runs.map(r => r.metrics);

  // scalar numeric stats
  const numericStats = {};
  ['game_length_rounds','first_asset_round','first_death_roll_round',
   'death_count','bankruptcy_count','collateral_violation_count'].forEach(k => {
    const vals = ms.map(m => m[k]).filter(v => v != null);
    numericStats[k] = { mean: mean(vals), stddev: stddev(vals), vals };
  });

  // win rate by CEO
  const winsByCeo = {};
  for (const m of ms) {
    const players = m.final_score_by_player || [];
    if (!players.length) continue;
    const winner = players.reduce((b, p) =>
      p.score > b.score || (p.score === b.score && p.playerId < b.playerId) ? p : b);
    const arch = winner.ceoArchetype || 'UNKNOWN';
    winsByCeo[arch] = (winsByCeo[arch] || 0) + 1;
  }
  const winRateByCeo = Object.fromEntries(
    Object.entries(winsByCeo).map(([k,v]) => [k, v / runs.length])
  );

  // win rate by industry
  const winsByInd = {};
  let winCount = 0;
  for (const m of ms) {
    const players = m.final_score_by_player || [];
    if (!players.length) continue;
    const winner = players.reduce((b, p) =>
      p.score > b.score || (p.score === b.score && p.playerId < b.playerId) ? p : b);
    winCount++;
    for (const ind of (winner.industries || [])) {
      winsByInd[ind] = (winsByInd[ind] || 0) + 1;
    }
  }
  const winRateByIndustry = Object.fromEntries(
    Object.entries(winsByInd).map(([k,v]) => [k, v / (winCount || 1)])
  );

  // income trap rate
  const allPlayers = ms.flatMap(m => m.income_vs_score || []);
  const medScore = median(allPlayers.map(p => p.finalScore));
  const highIncome = allPlayers.filter(p => p.totalIncome > 2);
  const incomeTrapRate = highIncome.length
    ? highIncome.filter(p => p.finalScore < medScore).length / highIncome.length
    : null;

  // tax offset rate
  const offsetRatios = ms
    .flatMap(m => m.tax_offset_by_player || [])
    .filter(p => p.grossIncome > 0)
    .map(p => p.offset / p.grossIncome);
  const taxOffsetRate = mean(offsetRatios);

  // integration achieved rate
  const integrationRate = ms.filter(m => m.has_vertical_stack).length / runs.length;

  // loan utilization mean
  const allRatios = ms.flatMap(m => m.loan_utilization_by_player || []).map(p => p.ratio);
  const loanUtilMean = mean(allRatios);

  // GMI per round: align arrays, compute mean ± stddev per position
  const maxRounds = Math.max(...ms.map(m => (m.gmi_by_round || []).length), 0);
  const gmiMean = [], gmiStddev = [];
  for (let r = 0; r < maxRounds; r++) {
    const vals = ms.map(m => (m.gmi_by_round || [])[r]).filter(v => v != null);
    gmiMean.push(mean(vals));
    gmiStddev.push(stddev(vals) || 0);
  }

  // Asset value trajectories: group by industry, align by round, compute mean
  const industryTrajectories = {};
  for (const m of ms) {
    for (const traj of (m.asset_value_trajectories || [])) {
      const ind = traj.industry || 'UNKNOWN';
      if (!industryTrajectories[ind]) industryTrajectories[ind] = [];
      industryTrajectories[ind].push(traj.valueByRound);
    }
  }
  const assetMeanByIndustry = {};
  for (const [ind, trajs] of Object.entries(industryTrajectories)) {
    const maxLen = Math.max(...trajs.map(t => t.length), 0);
    const means = [];
    for (let r = 0; r < maxLen; r++) {
      const vals = trajs.map(t => t[r]).filter(v => v != null);
      means.push(mean(vals));
    }
    assetMeanByIndustry[ind] = means;
  }

  // Final asset values by industry (last non-null value per trajectory)
  const finalValsByIndustry = {};
  for (const m of ms) {
    for (const traj of (m.asset_value_trajectories || [])) {
      const ind = traj.industry || 'UNKNOWN';
      const last = [...(traj.valueByRound || [])].reverse().find(v => v != null);
      if (last != null) {
        if (!finalValsByIndustry[ind]) finalValsByIndustry[ind] = [];
        finalValsByIndustry[ind].push(last);
      }
    }
  }

  // Stress at death roll histogram (0–12)
  const stressHist = new Array(13).fill(0);
  const stressScatter = []; // { stress, score, arch }
  for (const m of ms) {
    const scoreMap = {};
    const archMap  = {};
    for (const p of (m.final_score_by_player || [])) {
      scoreMap[p.playerId] = p.score;
      archMap[p.playerId]  = p.ceoArchetype;
    }
    for (const ev of (m.stress_at_death_roll || [])) {
      const s = Math.round(ev.stressLevel);
      if (s >= 0 && s <= 12) stressHist[s]++;
      stressScatter.push({
        stress: ev.stressLevel,
        score:  scoreMap[ev.playerId] ?? null,
        arch:   archMap[ev.playerId]  ?? 'UNKNOWN',
      });
    }
  }

  // Mean stress at death roll by CEO archetype
  const stressByArch = {};
  for (const ev of stressScatter) {
    if (!stressByArch[ev.arch]) stressByArch[ev.arch] = [];
    stressByArch[ev.arch].push(ev.stress);
  }
  const meanStressByArch = Object.fromEntries(
    Object.entries(stressByArch).map(([k,v]) => [k, mean(v)])
  );

  // Death/bankruptcy by round
  const deathEventsByRound = {};
  for (const m of ms) {
    const r = m.first_death_roll_round;
    if (r != null) {
      if (!deathEventsByRound[r]) deathEventsByRound[r] = { deaths: 0, banks: 0, runs: 0 };
      deathEventsByRound[r].deaths += m.death_count || 0;
      deathEventsByRound[r].banks  += m.bankruptcy_count || 0;
      deathEventsByRound[r].runs   += 1;
    }
  }

  return {
    numericStats,
    winRateByCeo,
    winRateByIndustry,
    incomeTrapRate,
    taxOffsetRate,
    integrationRate,
    loanUtilMean,
    gmiMean,
    gmiStddev,
    assetMeanByIndustry,
    finalValsByIndustry,
    stressHist,
    stressScatter,
    meanStressByArch,
    deathEventsByRound,
    maxRounds,
  };
}

// ── Chart registry (for destroy-on-reload) ───────────────────────────────────

const _charts = {};

function makeChart(id, config) {
  if (_charts[id]) { _charts[id].destroy(); delete _charts[id]; }
  const canvas = document.getElementById(id);
  if (!canvas) return;
  _charts[id] = new Chart(canvas, config);
  return _charts[id];
}

// ── Shared Chart.js defaults ─────────────────────────────────────────────────

const BASE_FONT = { family: "'Courier New', Courier, monospace", size: 11, color: '#6c757d' };
const GRID_COLOR = '#1e1e3a';
const TICK_COLOR = '#6c757d';

function baseScales(xOpts = {}, yOpts = {}) {
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

function makeGauge(canvasId, valueId, value, {greenRange, amberRange} = {}) {
  const pct = value == null ? 0 : Math.max(0, Math.min(1, value));
  const display = value == null ? '—' : Math.round(pct * 100) + '%';

  // colour
  let color = '#ff1744';
  if (greenRange && pct >= greenRange[0] && pct <= greenRange[1]) color = '#00e676';
  else if (amberRange && pct >= amberRange[0] && pct <= amberRange[1]) color = '#ffd740';

  document.getElementById(valueId).textContent = display;
  document.getElementById(valueId).style.color  = color;

  makeChart(canvasId, {
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

// ════════════════════════════════════════════════════════════════════════════
// TAB 1: HEALTH OVERVIEW
// ════════════════════════════════════════════════════════════════════════════

function renderHealth(agg, runs) {
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
    const s    = agg.numericStats[key];
    const m    = s.mean;
    const sd   = s.stddev;
    const cls  = healthColor(key, m);
    const t    = HEALTH_THRESHOLDS[key];
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
  const labels2 = Object.keys(buckets).map(Number).sort((a,b) => a-b);
  const counts   = labels2.map(r => buckets[r]);

  makeChart('chart-game-length', {
    type: 'bar',
    data: {
      labels: labels2.map(String),
      datasets: [{
        label: 'Runs',
        data:  counts,
        backgroundColor: labels2.map(r => {
          const c = healthColor('game_length_rounds', r);
          return c === 'card-green' ? 'rgba(0,230,118,0.7)'
               : c === 'card-amber' ? 'rgba(255,215,64,0.7)'
               :                      'rgba(255,23,68,0.7)';
        }),
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

// ════════════════════════════════════════════════════════════════════════════
// TAB 2: ECONOMIC BALANCE
// ════════════════════════════════════════════════════════════════════════════

function renderEconomy(agg) {
  // ── Win rate by CEO ────────────────────────────────────────────────────────
  const ceoEntries = Object.entries(agg.winRateByCeo).sort((a,b) => b[1]-a[1]);
  const ceoLabels  = ceoEntries.map(e => e[0]);
  const ceoVals    = ceoEntries.map(e => Math.round(e[1] * 100));

  makeChart('chart-win-ceo', {
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
          borderDash: [4,3],
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
        { min: 0, max: 100, ticks: { callback: v => v+'%', color: TICK_COLOR, font: BASE_FONT } },
        { ticks: { color: TICK_COLOR, font: BASE_FONT } }
      ),
    },
  });

  // ── Win rate by Industry ───────────────────────────────────────────────────
  const indEntries = Object.entries(agg.winRateByIndustry).sort((a,b) => b[1]-a[1]);
  const indLabels  = indEntries.map(e => e[0]);
  const indVals    = indEntries.map(e => Math.round(e[1] * 100));

  makeChart('chart-win-industry', {
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
        { min: 0, max: 100, ticks: { callback: v => v+'%', color: TICK_COLOR, font: BASE_FONT } },
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

// ════════════════════════════════════════════════════════════════════════════
// TAB 3: ASSET DYNAMICS
// ════════════════════════════════════════════════════════════════════════════

function renderAssets(agg) {
  // ── Asset value lines ──────────────────────────────────────────────────────
  const allIndustries = Object.keys(agg.assetMeanByIndustry);
  const maxLen = Math.max(...Object.values(agg.assetMeanByIndustry).map(a => a.length), 0);
  const roundLabels = Array.from({length: maxLen}, (_, i) => `R${i+1}`);

  makeChart('chart-asset-lines', {
    type: 'line',
    data: {
      labels: roundLabels,
      datasets: allIndustries.map(ind => ({
        label:       ind,
        data:        agg.assetMeanByIndustry[ind],
        borderColor: industryColor(ind),
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

  makeChart('chart-asset-box', {
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
  const gmiLabels = Array.from({length: agg.gmiMean.length}, (_, i) => `R${i+1}`);
  const gmiHi = agg.gmiMean.map((m, i) => m == null ? null : m + (agg.gmiStddev[i] || 0));
  const gmiLo = agg.gmiMean.map((m, i) => m == null ? null : m - (agg.gmiStddev[i] || 0));

  makeChart('chart-gmi', {
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

  // ── Loan utilization gauge ────────────────────────────────────────────────
  makeGauge('gauge-loan-util', 'gv-loan-util', agg.loanUtilMean, {
    greenRange: [0.50, 0.80], amberRange: [0.20, 0.95],
  });
}

// ════════════════════════════════════════════════════════════════════════════
// TAB 4: STRESS & DEATH
// ════════════════════════════════════════════════════════════════════════════

function renderStress(agg) {
  // ── Stress histogram ───────────────────────────────────────────────────────
  const histLabels = agg.stressHist.map((_, i) => String(i));
  const histColors = agg.stressHist.map((_, i) =>
    (i >= 6 && i <= 8) ? 'rgba(0,230,118,0.8)'
    : (i >= 4 && i <= 10) ? 'rgba(255,215,64,0.8)'
    : 'rgba(255,23,68,0.8)'
  );

  makeChart('chart-stress-hist', {
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

  makeChart('chart-stress-scatter', {
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
    .filter(([,v]) => v != null)
    .sort((a,b) => b[1]-a[1]);

  makeChart('chart-stress-ceo', {
    type: 'bar',
    data: {
      labels: archEntries.map(e => e[0]),
      datasets: [{
        label: 'Mean Stress',
        data:  archEntries.map(e => +(e[1] || 0).toFixed(2)),
        backgroundColor: archEntries.map(([,v]) =>
          v >= 6 && v <= 8 ? 'rgba(0,230,118,0.7)'
          : v >= 4 && v <= 10 ? 'rgba(255,215,64,0.7)'
          : 'rgba(255,23,68,0.7)'
        ),
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
  const rounds = Object.keys(agg.deathEventsByRound).map(Number).sort((a,b) => a-b);
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

// ════════════════════════════════════════════════════════════════════════════
// TAB 5: REPLAY
// ════════════════════════════════════════════════════════════════════════════

let _replayRuns              = [];
let _replayRunIdx            = 0;
let _replayRound             = 1;
let _replayListenersAttached = false;

function populateRunSelect(runs) {
  const sel = document.getElementById('replay-run-select');
  sel.innerHTML = '';
  runs.forEach((r, i) => {
    const opt = document.createElement('option');
    opt.value = i;
    opt.textContent = `Run ${r.runIndex} — ${r.scenarioName} (${r.metrics.game_length_rounds} rounds)`;
    sel.appendChild(opt);
  });
}

function renderReplayRound() {
  const run    = _replayRuns[_replayRunIdx];
  if (!run) return;
  const m      = run.metrics;
  const round  = _replayRound;
  const maxRnd = m.game_length_rounds || 1;

  document.getElementById('round-display').textContent = `Round ${round} / ${maxRnd}`;
  document.getElementById('round-slider').value = round;

  // ── GMI ───────────────────────────────────────────────────────────────────
  const gmi = (m.gmi_by_round || [])[round - 1];
  const gmiEl = document.getElementById('replay-gmi-value');
  if (gmi == null) {
    gmiEl.textContent = '—';
    gmiEl.style.color = '#6c757d';
    document.getElementById('replay-gmi-note').textContent = 'No GMI data for this round';
  } else {
    const arrow = gmi > 0 ? '▲' : gmi < 0 ? '▼' : '—';
    gmiEl.textContent = (gmi > 0 ? '+' : '') + gmi + ' ' + arrow;
    gmiEl.style.color = gmi > 0 ? '#00e676' : gmi < 0 ? '#ff1744' : '#a0a0c0';
    document.getElementById('replay-gmi-note').textContent =
      'Global Market Index delta this round';
  }

  // ── Events ────────────────────────────────────────────────────────────────
  const evList = document.getElementById('replay-event-list');
  evList.innerHTML = '';
  const events = (m.notable_events_by_round ?? {})[round] ?? [];

  if (!events.length) {
    const li = document.createElement('li');
    li.innerHTML = '<span class="muted">No recorded events this round</span>';
    evList.appendChild(li);
  } else {
    for (const ev of events) {
      const li = document.createElement('li');
      li.innerHTML = `<span class="event-tag ${ev.tagClass}">${ev.tag}</span>${ev.text}`;
      evList.appendChild(li);
    }
  }

  // ── Asset values bar chart for this round ────────────────────────────────
  const activeAssets = (m.asset_value_trajectories || [])
    .map(t => ({ id: t.assetId, industry: t.industry, val: (t.valueByRound || [])[round - 1] }))
    .filter(a => a.val != null);

  const assetsEmptyEl = document.getElementById('replay-assets-empty');
  if (assetsEmptyEl) assetsEmptyEl.style.display = activeAssets.length === 0 ? 'block' : 'none';

  makeChart('chart-replay-assets', {
    type: 'bar',
    data: {
      labels: activeAssets.map(a => a.id),
      datasets: [{
        label: 'Asset Value',
        data:  activeAssets.map(a => a.val),
        backgroundColor: activeAssets.map(a => industryColor(a.industry) + 'bb'),
        borderColor:     activeAssets.map(a => industryColor(a.industry)),
        borderWidth: 1,
        borderRadius: 3,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: baseScales(
        { ticks: { color: TICK_COLOR, font: BASE_FONT, maxRotation: 35 } },
        { title: { display: true, text: 'Value ($)', color: TICK_COLOR, font: BASE_FONT } }
      ),
    },
  });
}

function renderReplayScores() {
  const run  = _replayRuns[_replayRunIdx];
  if (!run) return;
  const body = document.getElementById('replay-scores-body');
  body.innerHTML = '';
  const players = [...(run.metrics.final_score_by_player || [])]
    .sort((a,b) => b.score - a.score);

  if (!players.length) {
    body.innerHTML = '<tr><td colspan="4" class="muted" style="text-align:center;padding:16px">No player data</td></tr>';
    return;
  }

  players.forEach((p, idx) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td class="num">${idx === 0 ? '🏆 ' : ''}${p.playerId}</td>
      <td>${p.ceoArchetype || '—'}</td>
      <td class="num" style="color:${idx===0?'#00e676':'#e0e0e0'}">${p.score}</td>
      <td class="muted">${(p.industries || []).join(', ') || '—'}</td>
    `;
    body.appendChild(tr);
  });
}

function switchReplayRun(idx) {
  const run   = _replayRuns[idx];
  if (!run) return;
  _replayRunIdx = idx;
  _replayRound  = 1;
  const maxRnd  = run.metrics.game_length_rounds || 1;
  const slider  = document.getElementById('round-slider');
  slider.max   = maxRnd;
  slider.value = 1;
  renderReplayRound();
  renderReplayScores();
}

function initReplay(runs) {
  _replayRuns = runs;
  populateRunSelect(runs);
  switchReplayRun(0);

  if (_replayListenersAttached) return;
  _replayListenersAttached = true;

  document.getElementById('replay-run-select').addEventListener('change', e => {
    switchReplayRun(+e.target.value);
  });

  document.getElementById('round-slider').addEventListener('input', e => {
    _replayRound = +e.target.value;
    renderReplayRound();
  });

  document.getElementById('prev-btn').addEventListener('click', () => {
    if (_replayRound > 1) { _replayRound--; renderReplayRound(); }
  });

  document.getElementById('next-btn').addEventListener('click', () => {
    const maxRnd = _replayRuns[_replayRunIdx].metrics.game_length_rounds || 1;
    if (_replayRound < maxRnd) { _replayRound++; renderReplayRound(); }
  });
}

// ════════════════════════════════════════════════════════════════════════════
// RENDER ALL TABS
// ════════════════════════════════════════════════════════════════════════════

function renderAll(runs) {
  const agg = aggregate(runs);

  // Header meta
  const names = [...new Set(runs.map(r => r.scenarioName))].join(', ');
  const seeds = [...new Set(runs.map(r => r.seed.replace(/-run\d+$/, '')))].join(', ');
  document.getElementById('hdr-scenario').textContent = `Scenario: ${names}`;
  document.getElementById('hdr-runs').textContent     = `${runs.length} run${runs.length===1?'':'s'}`;
  document.getElementById('hdr-seed').textContent     = `seed: ${seeds}`;

  // Render tabs
  renderHealth(agg, runs);
  renderEconomy(agg);
  renderAssets(agg);
  renderStress(agg);
  initReplay(runs);
}

// ════════════════════════════════════════════════════════════════════════════
// FILE LOADING
// ════════════════════════════════════════════════════════════════════════════

function loadRuns(text, filename) {
  let data;
  try {
    data = JSON.parse(text);
  } catch (e) {
    setDropError('Invalid JSON: ' + e.message);
    return;
  }

  if (!Array.isArray(data)) {
    setDropError('Expected a JSON array of run results.');
    return;
  }
  if (!data.length) {
    setDropError('The file contains an empty array.');
    return;
  }

  // Accept both formats:
  //   [{ runIndex, seed, scenarioName, metrics }]  ← scenario-runner output
  //   [{ first_asset_round, ... }]                  ← raw collector output (legacy)
  const runs = data.map((item, i) => {
    if (item.metrics && typeof item.metrics === 'object') return item;
    // treat the whole item as metrics
    return { runIndex: i, seed: `unknown-run${i}`, scenarioName: filename || 'unknown', metrics: item };
  });

  // Switch views
  document.getElementById('drop-screen').style.display  = 'none';
  document.getElementById('dashboard').style.display    = 'flex';
  document.title = 'B&D Dashboard — ' + (runs[0].scenarioName || filename);

  renderAll(runs);
}

function setDropError(msg) {
  document.getElementById('drop-error').textContent = msg;
}

// ── Run picker ─────────────────────────────────────────────────────────────

async function populateRunPicker() {
  const sel = document.getElementById('run-select');
  sel.innerHTML = '<option value="">Loading runs…</option>';
  try {
    const r = await fetch('/runs/');
    const { files } = await r.json();
    sel.innerHTML = '';
    if (!files.length) {
      sel.innerHTML = '<option value="">No runs found in output/runs</option>';
      return;
    }
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = '— select a run —';
    sel.appendChild(placeholder);
    files.forEach(f => {
      const opt = document.createElement('option');
      opt.value = f;
      opt.textContent = f;
      sel.appendChild(opt);
    });
  } catch {
    sel.innerHTML = '<option value="">Failed to load run list</option>';
  }
}

async function loadSelectedRun() {
  const sel = document.getElementById('run-select');
  const filename = sel.value;
  if (!filename) return;
  setDropError('');
  try {
    const res  = await fetch(`/runs/${encodeURIComponent(filename)}`);
    const text = await res.text();
    loadRuns(text, filename);
  } catch (e) {
    setDropError('Failed to load run: ' + e.message);
  }
}

document.getElementById('load-btn').addEventListener('click', loadSelectedRun);
document.getElementById('run-select').addEventListener('change', loadSelectedRun);

populateRunPicker();

// ── Reload button ──────────────────────────────────────────────────────────

document.getElementById('reload-btn').addEventListener('click', () => {
  // Destroy all charts
  for (const c of Object.values(_charts)) { try { c.destroy(); } catch {} }
  for (const k in _charts) delete _charts[k];
  document.getElementById('dashboard').style.display   = 'none';
  document.getElementById('drop-screen').style.display = '';
  setDropError('');
  document.title = 'Borrow & Die — Simulator Dashboard';
  populateRunPicker();
});

// ── Tab switching ──────────────────────────────────────────────────────────

document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(btn.dataset.tab).classList.add('active');

    // Force chart resize after tab switch (Chart.js needs visible canvas)
    setTimeout(() => {
      for (const c of Object.values(_charts)) {
        try { c.resize(); } catch {}
      }
    }, 50);
  });
});
