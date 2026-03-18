/* ════════════════════════════════════════════════════════════════════════════
   BORROW & DIE — DATA AGGREGATION
   Converts raw simulation runs into summary statistics for the dashboard.
   ════════════════════════════════════════════════════════════════════════════ */

'use strict';

import { mean, stddev, median } from './stats.js';

// ── Internal helpers ─────────────────────────────────────────────────────────

function findWinner(players) {
  return players.reduce((b, p) =>
    p.score > b.score || (p.score === b.score && p.playerId < b.playerId) ? p : b);
}

function aggregateNumericStats(ms) {
  const numericStats = {};
  ['game_length_rounds', 'first_asset_round', 'first_death_roll_round',
   'death_count', 'bankruptcy_count', 'collateral_violation_count'].forEach(k => {
    const vals = ms.map(m => m[k]).filter(v => v != null);
    numericStats[k] = { mean: mean(vals), stddev: stddev(vals), vals };
  });
  return numericStats;
}

function aggregateWinRates(ms, totalRuns) {
  const winsByCeo = {};
  const winsByInd = {};
  let winCount = 0;
  for (const m of ms) {
    const players = m.final_score_by_player || [];
    if (!players.length) continue;
    const winner = findWinner(players);
    const arch = winner.ceoArchetype || 'UNKNOWN';
    winsByCeo[arch] = (winsByCeo[arch] || 0) + 1;
    winCount++;
    for (const ind of (winner.industries || [])) {
      winsByInd[ind] = (winsByInd[ind] || 0) + 1;
    }
  }
  const winRateByCeo = Object.fromEntries(
    Object.entries(winsByCeo).map(([k, v]) => [k, v / totalRuns])
  );
  const winRateByIndustry = Object.fromEntries(
    Object.entries(winsByInd).map(([k, v]) => [k, v / (winCount || 1)])
  );
  return { winRateByCeo, winRateByIndustry };
}

function aggregateEconomicRates(ms, totalRuns) {
  const allPlayers = ms.flatMap(m => m.income_vs_score || []);
  const medScore = median(allPlayers.map(p => p.finalScore));
  const highIncome = allPlayers.filter(p => p.totalIncome > 2);
  const incomeTrapRate = highIncome.length
    ? highIncome.filter(p => p.finalScore < medScore).length / highIncome.length
    : null;

  const offsetRatios = ms
    .flatMap(m => m.tax_offset_by_player || [])
    .filter(p => p.grossIncome > 0)
    .map(p => p.offset / p.grossIncome);
  const taxOffsetRate = mean(offsetRatios);

  const integrationRate = ms.filter(m => m.has_vertical_stack).length / totalRuns;

  const allRatios = ms.flatMap(m => m.loan_utilization_by_player || []).map(p => p.ratio);
  const loanUtilMean = mean(allRatios);

  return { incomeTrapRate, taxOffsetRate, integrationRate, loanUtilMean };
}

function aggregateGmi(ms) {
  const maxRounds = Math.max(...ms.map(m => (m.gmi_by_round || []).length), 0);
  const gmiMean = [], gmiStddev = [];
  const gmiCumMean = [], gmiCumStddev = [];
  for (let r = 0; r < maxRounds; r++) {
    const vals = ms.map(m => (m.gmi_by_round || [])[r]).filter(v => v != null);
    gmiMean.push(mean(vals));
    gmiStddev.push(stddev(vals) || 0);

    const cumVals = ms.map(m => {
      const byRound = m.gmi_by_round || [];
      let sum = 0;
      for (let i = 0; i <= r; i++) {
        if (byRound[i] != null) sum += byRound[i];
      }
      return sum;
    });
    gmiCumMean.push(mean(cumVals));
    gmiCumStddev.push(stddev(cumVals) || 0);
  }
  return { gmiMean, gmiStddev, gmiCumMean, gmiCumStddev, maxRounds };
}

function aggregateAssets(ms) {
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

  return { assetMeanByIndustry, finalValsByIndustry };
}

function aggregateStress(ms) {
  const stressHist = new Array(13).fill(0);
  const stressScatter = [];
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

  const stressByArch = {};
  for (const ev of stressScatter) {
    if (!stressByArch[ev.arch]) stressByArch[ev.arch] = [];
    stressByArch[ev.arch].push(ev.stress);
  }
  const meanStressByArch = Object.fromEntries(
    Object.entries(stressByArch).map(([k, v]) => [k, mean(v)])
  );

  return { stressHist, stressScatter, meanStressByArch };
}

function aggregateDeathEvents(ms) {
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
  return deathEventsByRound;
}

// ── Public API ───────────────────────────────────────────────────────────────

export function aggregate(runs) {
  const ms = runs.map(r => r.metrics);

  const numericStats = aggregateNumericStats(ms);
  const { winRateByCeo, winRateByIndustry } = aggregateWinRates(ms, runs.length);
  const { incomeTrapRate, taxOffsetRate, integrationRate, loanUtilMean } = aggregateEconomicRates(ms, runs.length);
  const { gmiMean, gmiStddev, gmiCumMean, gmiCumStddev, maxRounds } = aggregateGmi(ms);
  const { assetMeanByIndustry, finalValsByIndustry } = aggregateAssets(ms);
  const { stressHist, stressScatter, meanStressByArch } = aggregateStress(ms);
  const deathEventsByRound = aggregateDeathEvents(ms);

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
    gmiCumMean,
    gmiCumStddev,
    assetMeanByIndustry,
    finalValsByIndustry,
    stressHist,
    stressScatter,
    meanStressByArch,
    deathEventsByRound,
    maxRounds,
  };
}
