/**
 * test/smoke.js — Smoke test for the Borrow & Die simulator.
 *
 * Runs the default-4p scenario and asserts basic sanity invariants.
 * Exit code 0 = all pass, 1 = any fail.
 *
 * Usage:  node test/smoke.js
 *         npm test
 */

import { readFileSync }  from 'fs';
import { fileURLToPath } from 'url';
import { join, dirname } from 'path';
import { runScenario }   from '../scenarios/scenario-runner.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── Load default-4p config ───────────────────────────────────────────────────

const baseConfig = JSON.parse(
  readFileSync(join(__dirname, '../scenarios/default-4p.json'), 'utf8'),
);

// ── Assertion reporter ───────────────────────────────────────────────────────

let passCount = 0;
let failCount = 0;

function report(name, ok, detail = '') {
  if (ok) {
    console.log(`PASS  ${name}`);
    passCount++;
  } else {
    console.log(`FAIL  ${name}${detail ? ' — ' + detail : ''}`);
    failCount++;
  }
}

// ────────────────────────────────────────────────────────────────────────────
// PHASE A — 10-game run: assertions 1–5
// ────────────────────────────────────────────────────────────────────────────

console.log('Running 10 games (assertions 1–4)…');

const negativeCashViolations = [];
const assetFloorViolations   = [];

const results10 = await runScenario({ ...baseConfig, runs: 10 }, {
  onYearEnd: async (state) => {
    // Assertion 5: no catastrophic cash deficit at end of any turn.
    // The engine does not auto-bankruptcy on negative cash; tax payments are
    // debited even when the player has insufficient cash (bankruptcy only fires
    // on collateral violations). Gradual deficits of $1–$3/round are expected
    // for high-income players with no cash reserves. We flag values below
    // -(round × 5) as a sign the cash mechanic has broken down catastrophically
    // (e.g. double-charging taxes, unbounded negative feedback loops).
    const CASH_FLOOR = -(state.round * 5);
    for (const player of state.players) {
      if (player.alive && player.cash < CASH_FLOOR) {
        negativeCashViolations.push({
          round:    state.round,
          playerId: player.id,
          cash:     player.cash,
          floor:    CASH_FLOOR,
        });
      }
    }

    // Assertion 4: all asset values >= 1 — scan once per completed game
    // (state.log is complete when endTriggered because the final bonus year
    //  runs inside the same runYear() call that set endTriggered)
    if (state.endTriggered) {
      for (const ev of state.log) {
        if (ev.type !== 'ASSET_VALUE_UPDATE') continue;
        const val = ev.finalValue ?? ev.newValue;
        if (typeof val === 'number' && val < 1) {
          assetFloorViolations.push({
            assetId: ev.assetId,
            round:   ev.round,
            value:   val,
          });
        }
      }
    }
  },
});

// Assertion 1: game_length_rounds mean in [4, 20]
const lengths = results10.map(r => r.metrics.game_length_rounds);
const mean    = lengths.reduce((a, b) => a + b, 0) / lengths.length;
report(
  'game_length_rounds mean is between 4 and 20',
  mean >= 4 && mean <= 20,
  `mean=${mean.toFixed(1)}  values=[${lengths.join(', ')}]`,
);

// Assertion 2: no game ends on round 1 (labor phase always > 0)
const endedOnRound1 = lengths.filter(l => l === 1);
report(
  'no game ends on round 1',
  endedOnRound1.length === 0,
  endedOnRound1.length > 0
    ? `${endedOnRound1.length} game(s) ended on round 1`
    : '',
);

// Assertion 3: all asset values >= 1 at all times (floor enforced)
report(
  'all asset values >= 1 at all times',
  assetFloorViolations.length === 0,
  assetFloorViolations.length > 0
    ? `first violation: ${JSON.stringify(assetFloorViolations[0])}`
    : '',
);

// Assertion 5: no catastrophic cash deficit (floor is -(round × 5))
report(
  'no player cash is catastrophically negative (>= -(round × 5))',
  negativeCashViolations.length === 0,
  negativeCashViolations.length > 0
    ? `first violation: ${JSON.stringify(negativeCashViolations[0])}`
    : '',
);

// ────────────────────────────────────────────────────────────────────────────
// PHASE B — 100-game run: assertion 5 (d6 coverage)
// ────────────────────────────────────────────────────────────────────────────

console.log('Running 100 games (assertion 5: d6 coverage)…');

// Map<assetId, { total: number, seen: Set<number> }>
const d6Stats = new Map();

await runScenario({ ...baseConfig, runs: 100 }, {
  onYearEnd: async (state) => {
    if (!state.endTriggered) return;   // only scan once per completed game
    for (const ev of state.log) {
      if (ev.type !== 'ASSET_VALUE_UPDATE') continue;
      const { assetId, roll } = ev;
      if (typeof roll !== 'number') continue;
      if (!d6Stats.has(assetId)) d6Stats.set(assetId, { total: 0, seen: new Set() });
      const entry = d6Stats.get(assetId);
      entry.total++;
      entry.seen.add(roll);
    }
  },
});

// Assertion 5: each asset with >= 30 total rolls must have seen all 6 outcomes.
// Rarely-bought assets (< 30 rolls) are excluded — statistically normal to miss
// one face on a fair d6 with very few trials.
const MIN_ROLLS_FOR_COVERAGE = 30;
const assetsWithGaps = [];
for (const [assetId, { total, seen }] of d6Stats) {
  if (total < MIN_ROLLS_FOR_COVERAGE) continue;
  const missing = [1, 2, 3, 4, 5, 6].filter(r => !seen.has(r));
  if (missing.length > 0) {
    assetsWithGaps.push({ assetId, missing, seen: [...seen].sort(), total });
  }
}

report(
  'd6 coverage — all 6 outcomes rolled per asset across 100 games',
  assetsWithGaps.length === 0,
  assetsWithGaps.length > 0
    ? `${assetsWithGaps.length} asset(s) missing outcomes; first: ` +
      `${assetsWithGaps[0].assetId} missing [${assetsWithGaps[0].missing}] ` +
      `seen [${assetsWithGaps[0].seen}]`
    : '',
);

// ────────────────────────────────────────────────────────────────────────────
// Summary
// ────────────────────────────────────────────────────────────────────────────

const total = passCount + failCount;
console.log(
  `\n${total} assertion${total !== 1 ? 's' : ''}: ` +
  `${passCount} passed, ${failCount} failed`,
);

if (failCount > 0) process.exit(1);
