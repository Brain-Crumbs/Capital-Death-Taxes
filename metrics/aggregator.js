/**
 * metrics/aggregator.js
 *
 * Takes an array of N per-game results produced by metrics/collector.js and
 * computes population-level statistics, producing a single metrics-summary.json.
 *
 * Usage:
 *   import { aggregate } from './metrics/aggregator.js';
 *   const summary = await aggregate(runs);
 *   // summary is written to ./metrics-summary.json and also returned.
 *
 * Output fields
 * ─────────────
 *   numeric_stats          – mean/median/p10/p90/stddev for scalar game metrics
 *   income_trap_rate       – % of players with totalIncome > 2 who score below median
 *   integration_achieved_rate – % of games with at least one vertical stack
 *   tax_offset_rate        – mean(offset / grossIncome) across all players/games
 *   win_rate_by_ceo        – % of games won by each CEO archetype
 *   win_rate_by_industry   – % of wins where winning portfolio included each industry
 *   run_count              – total games aggregated
 */

import { writeFileSync } from 'node:fs';
import { resolve }       from 'node:path';

// ─────────────────────────────────────────────────────────────────────────────
// Statistical helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns the mean of an array of numbers.
 * Returns null for empty arrays.
 *
 * @param {number[]} values
 * @returns {number|null}
 */
function mean(values) {
  if (!values.length) return null;
  return values.reduce((s, v) => s + v, 0) / values.length;
}

/**
 * Returns the median of an array of numbers.
 * Returns null for empty arrays.
 *
 * @param {number[]} values  – need not be sorted
 * @returns {number|null}
 */
function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid    = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

/**
 * Returns the p-th percentile of an array of numbers using linear interpolation.
 * Returns null for empty arrays.
 *
 * @param {number[]} values
 * @param {number}   p       – percentile in [0, 100]
 * @returns {number|null}
 */
function percentile(values, p) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const idx    = (p / 100) * (sorted.length - 1);
  const lo     = Math.floor(idx);
  const hi     = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  const frac = idx - lo;
  return sorted[lo] * (1 - frac) + sorted[hi] * frac;
}

/**
 * Returns the population standard deviation of an array of numbers.
 * Returns null for arrays with fewer than 2 elements.
 *
 * @param {number[]} values
 * @returns {number|null}
 */
function stddev(values) {
  if (values.length < 2) return null;
  const avg  = mean(values);
  const sqDiffs = values.map((v) => (v - avg) ** 2);
  return Math.sqrt(mean(sqDiffs));
}

/**
 * Computes mean, median, p10, p90, and stddev for an array of numbers.
 * Null / undefined values are filtered out before computation.
 *
 * @param {(number|null|undefined)[]} rawValues
 * @returns {{ mean: number|null, median: number|null, p10: number|null, p90: number|null, stddev: number|null }}
 */
function stats(rawValues) {
  const values = rawValues.filter((v) => v != null);
  return {
    mean:   mean(values),
    median: median(values),
    p10:    percentile(values, 10),
    p90:    percentile(values, 90),
    stddev: stddev(values),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Main export
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Aggregates N per-game metric results into a summary.
 * Writes metrics-summary.json to the current working directory and returns the
 * summary object.
 *
 * @param {object[]} runs    – array of results from collect()
 * @param {object}   [opts]
 * @param {string}   [opts.outputPath] – override output file path
 * @returns {object}  aggregated metrics summary
 */
export async function aggregate(runs, opts = {}) {
  if (!runs || !runs.length) {
    throw new Error('aggregate(): runs array is empty');
  }

  const outputPath = opts.outputPath ?? resolve('./metrics-summary.json');

  // ── Scalar numeric metrics (one value per game) ───────────────────────────

  const numericStats = {
    game_length_rounds: stats(runs.map((r) => r.game_length_rounds)),
    death_count:        stats(runs.map((r) => r.death_count)),
    bankruptcy_count:   stats(runs.map((r) => r.bankruptcy_count)),
    collateral_violation_count: stats(runs.map((r) => r.collateral_violation_count)),
    first_asset_round:       stats(runs.map((r) => r.first_asset_round)),
    first_death_roll_round:  stats(runs.map((r) => r.first_death_roll_round)),
  };

  // ── income_trap_rate ──────────────────────────────────────────────────────
  // "% of players with totalIncome > 2 who score below the median final score"
  //
  // Steps:
  //   1. Collect all (totalIncome, finalScore) pairs across all runs.
  //   2. Compute the median final score across ALL players across ALL runs.
  //   3. Filter to players with totalIncome > 2.
  //   4. income_trap_rate = fraction whose finalScore < median.

  const allPlayers = runs.flatMap((r) => r.income_vs_score ?? []);
  const medianScore = median(allPlayers.map((p) => p.finalScore));
  const highIncome  = allPlayers.filter((p) => p.totalIncome > 2);
  const income_trap_rate = highIncome.length > 0
    ? highIncome.filter((p) => p.finalScore < medianScore).length / highIncome.length
    : null;

  // ── integration_achieved_rate ─────────────────────────────────────────────
  // "% of games with at least one vertical stack"
  // collector.js sets has_vertical_stack = true when any player ends the game
  // with UPSTREAM + MIDSTREAM + DOWNSTREAM in the same industry.

  const integration_achieved_rate =
    runs.filter((r) => r.has_vertical_stack).length / runs.length;

  // ── tax_offset_rate ───────────────────────────────────────────────────────
  // "mean(offset / grossIncome) across all players/games"

  const offsetRatios = runs
    .flatMap((r) => r.tax_offset_by_player ?? [])
    .filter((p) => p.grossIncome > 0)
    .map((p) => p.offset / p.grossIncome);

  const tax_offset_rate = mean(offsetRatios);

  // ── Determine the winner of each game ─────────────────────────────────────
  // Winner = player with the highest final score in that game.
  // Ties are broken by playerId (alphabetical) for determinism.

  const winners = runs.map((run) => {
    const scores = run.final_score_by_player ?? [];
    if (!scores.length) return null;
    return scores.reduce((best, p) =>
      p.score > best.score || (p.score === best.score && p.playerId < best.playerId)
        ? p
        : best,
    );
  }).filter(Boolean);

  // ── win_rate_by_ceo ───────────────────────────────────────────────────────
  // "% of games won by each CEO archetype"

  const winsByCeo = {};
  for (const winner of winners) {
    const arch = winner.ceoArchetype ?? 'UNKNOWN';
    winsByCeo[arch] = (winsByCeo[arch] ?? 0) + 1;
  }
  const win_rate_by_ceo = Object.fromEntries(
    Object.entries(winsByCeo).map(([arch, count]) => [arch, count / runs.length]),
  );

  // ── win_rate_by_industry ──────────────────────────────────────────────────
  // "% of wins where winning portfolio included each industry"

  const winsByIndustry = {};
  for (const winner of winners) {
    for (const industry of (winner.industries ?? [])) {
      winsByIndustry[industry] = (winsByIndustry[industry] ?? 0) + 1;
    }
  }
  const win_rate_by_industry = Object.fromEntries(
    Object.entries(winsByIndustry).map(([ind, count]) => [ind, count / winners.length]),
  );

  // ── Assemble summary ───────────────────────────────────────────────────────

  const summary = {
    run_count:                 runs.length,
    numeric_stats:             numericStats,
    income_trap_rate,
    integration_achieved_rate,
    tax_offset_rate,
    win_rate_by_ceo,
    win_rate_by_industry,
  };

  // ── Write output ───────────────────────────────────────────────────────────

  writeFileSync(outputPath, JSON.stringify(summary, null, 2), 'utf8');

  return summary;
}
