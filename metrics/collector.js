/**
 * metrics/collector.js
 *
 * Extracts raw per-game metrics from a completed GameState.
 *
 * Usage:
 *   import { collect } from './metrics/collector.js';
 *
 *   // After the final runYear() returns (state.endTriggered === true and
 *   // the GAME_OVER event has been appended to state.log):
 *   const result = collect(state);
 *
 * The collector scans state.log once for all event-based counts, and reads
 * state.players for final-state metrics (scores, loan utilisation, etc.).
 *
 * Returned fields
 * ───────────────
 *   first_asset_round         – earliest round where any ASSET_PURCHASED fired
 *   first_death_roll_round    – earliest round where any DEATH_ROLL fired
 *   game_length_rounds        – round when endTriggered was first set
 *   death_count               – DEATH_ROLL events where survived === false
 *   bankruptcy_count          – total BANKRUPTCY events
 *   collateral_violation_count– total COLLATERAL_VIOLATION events
 *   final_score_by_player     – [{ playerId, ceoArchetype, score, industries }]
 *   asset_value_trajectories  – [{ assetId, industry, valueByRound[] }]
 *   loan_utilization_by_player– [{ playerId, maxCapacity, drawn, ratio }]
 *   gmi_by_round              – integer array (one entry per round, 1-indexed)
 *   tax_offset_by_player      – [{ playerId, grossIncome, offset, netTaxable, taxPaid }]
 *   personal_event_actions    – [{ cardName, action: 'HOLD'|'PLAY'|'SELL' }]
 *   integration_bonuses_fired – [{ playerId, bonusType, round }]
 *   stress_at_death_roll      – [{ playerId, stressLevel }]
 *   t3_acquisitions           – { [playerId]: count }
 *   income_vs_score           – [{ playerId, totalIncome, finalScore }]
 *   has_vertical_stack        – boolean: any player ended with a full vertical stack
 */

import { computeLoanCapacity } from '../engine/loans.js';

// ─────────────────────────────────────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Builds an asset-info lookup: companyName → { tier, industry }.
 * Scans all assets visible in the final state (owned, market row, discard piles,
 * and starter assets) so that purchased-then-held assets are always found.
 *
 * @param {object} state
 * @returns {Map<string, { tier: number, industry: string }>}
 */
function buildAssetInfoMap(state) {
  const map = new Map();

  const register = (asset) => {
    if (!asset || !asset.companyName) return;
    if (!map.has(asset.companyName)) {
      map.set(asset.companyName, {
        tier:     asset.tier     ?? null,
        industry: asset.industry ?? null,
      });
    }
  };

  for (const player of (state.players ?? [])) {
    for (const asset of (player.assets ?? [])) register(asset);
    if (player.starterAsset) register(player.starterAsset);
  }
  for (const card of (state.marketCards ?? [])) register(card);
  for (const pile of Object.values(state.discardPiles ?? {})) {
    if (Array.isArray(pile)) pile.forEach(register);
  }

  return map;
}

/**
 * Computes total loan capacity for a player by summing computeLoanCapacity()
 * across all owned assets (mirrors the engine's checkCollateralViolation logic).
 *
 * @param {object} player
 * @returns {number}
 */
function computeTotalLoanCapacity(player) {
  const assets = player.assets ?? [];
  return assets.reduce(
    (sum, asset) => sum + computeLoanCapacity(asset, assets),
    0,
  );
}

/**
 * Returns true when the player's final portfolio contains a full vertical stack:
 * at least one industry where they own UPSTREAM, MIDSTREAM, and DOWNSTREAM assets.
 *
 * @param {object} player
 * @returns {boolean}
 */
function playerHasVerticalStack(player) {
  const byIndustry = {};
  for (const asset of (player.assets ?? [])) {
    const ind = asset.industry;
    if (!ind) continue;
    if (!byIndustry[ind]) byIndustry[ind] = new Set();
    byIndustry[ind].add(asset.placement);
  }
  return Object.values(byIndustry).some(
    (placements) =>
      placements.has('UPSTREAM') &&
      placements.has('MIDSTREAM') &&
      placements.has('DOWNSTREAM'),
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main export
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Extracts raw per-game metrics from a completed GameState.
 * Call this once after the final runYear() has returned and the GAME_OVER
 * event has been appended to state.log.
 *
 * @param {object} state  – completed GameState
 * @returns {object}      – raw metrics for this single game run
 */
export function collect(state) {
  const log      = state.log ?? [];
  const assetInfo = buildAssetInfoMap(state);

  // ── Running accumulators ──────────────────────────────────────────────────

  let first_asset_round        = null;
  let first_death_roll_round   = null;
  let death_count              = 0;
  let bankruptcy_count         = 0;
  let collateral_violation_count = 0;
  let gameOverScores           = null;

  // round → cumulative GMI value
  const gmiByRound = {};

  // assetId → { [round]: finalValue }
  const assetValuesByRound = {};

  // playerId → { grossIncome, offset, netTaxable, taxPaid }
  const taxAccByPlayer = {};

  // playerId → total grossIncome (for income_vs_score)
  const incomeTotalByPlayer = {};

  // Flat arrays
  const personalEventActions    = [];
  const integrationBonusesFired = [];
  const stressAtDeathRolls      = [];

  // playerId → t3 purchase count
  const t3ByPlayer = {};

  // per-round notable events for replay display
  // { [round]: Array<{ tag, tagClass, text }> }
  const notableEventsByRound = {};
  const addNotable = (r, tag, tagClass, text) => {
    if (!notableEventsByRound[r]) notableEventsByRound[r] = [];
    notableEventsByRound[r].push({ tag, tagClass, text });
  };

  // ── Single-pass log scan ──────────────────────────────────────────────────

  for (const ev of log) {
    const round = ev.round ?? 0;

    switch (ev.type) {

      case 'ASSET_PURCHASED': {
        if (first_asset_round === null) first_asset_round = round;

        const info = assetInfo.get(ev.assetId);
        if (info?.tier === 3) {
          t3ByPlayer[ev.playerId] = (t3ByPlayer[ev.playerId] ?? 0) + 1;
        }
        break;
      }

      case 'DEATH_ROLL': {
        if (first_death_roll_round === null) first_death_roll_round = round;
        if (!ev.survived) death_count++;
        stressAtDeathRolls.push({ playerId: ev.playerId, stressLevel: ev.stress, round });
        addNotable(round, 'DEATH ROLL', 'death', `${ev.playerId} — stress ${ev.stress}`);
        break;
      }

      case 'BANKRUPTCY': {
        bankruptcy_count++;
        break;
      }

      case 'COLLATERAL_VIOLATION': {
        collateral_violation_count++;
        break;
      }

      case 'END_TRIGGER': {
        break;
      }

      case 'GAME_OVER': {
        gameOverScores = ev.scores ?? null;
        break;
      }

      case 'GMI_UPDATE': {
        // Keep the last update seen for this round (Lobbyist may adjust after).
        // Store the per-round delta (not the cumulative newGmi) so the replay
        // dashboard can display "GMI Delta this round" correctly.
        gmiByRound[round] = ev.gmiDelta;
        const sign = ev.gmiDelta > 0 ? '+' : '';
        addNotable(round, 'MARKET', 'market',
          `${ev.eventName}: GMI ${sign}${ev.gmiDelta}`);
        break;
      }

      case 'ASSET_VALUE_UPDATE': {
        if (!assetValuesByRound[ev.assetId]) assetValuesByRound[ev.assetId] = {};
        // turn.js spreads result.logEvent and appends finalValue (post-bubble bonus);
        // fall back to newValue if finalValue is absent.
        assetValuesByRound[ev.assetId][round] = ev.finalValue ?? ev.newValue;
        break;
      }

      case 'TAX_APPLIED': {
        if (!taxAccByPlayer[ev.playerId]) {
          taxAccByPlayer[ev.playerId] = { grossIncome: 0, offset: 0, netTaxable: 0, taxPaid: 0 };
        }
        const acc = taxAccByPlayer[ev.playerId];
        acc.grossIncome += ev.grossIncome  ?? 0;
        acc.offset      += ev.loanOffset   ?? 0;
        acc.netTaxable  += ev.netTaxable   ?? 0;
        acc.taxPaid     += ev.taxDue       ?? 0;

        incomeTotalByPlayer[ev.playerId] =
          (incomeTotalByPlayer[ev.playerId] ?? 0) + (ev.grossIncome ?? 0);
        break;
      }

      case 'PERSONAL_EVENT_APPLIED': {
        // IMMEDIATE cards resolve straight away → action PLAY
        personalEventActions.push({ cardName: ev.eventName, action: 'PLAY' });
        addNotable(round, 'EVENT', 'event', `${ev.playerId}: ${ev.eventName}`);
        break;
      }

      case 'PERSONAL_EVENT_HELD': {
        // HOLD / PASSIVE cards go into the player's hand
        personalEventActions.push({ cardName: ev.eventName, action: 'HOLD' });
        break;
      }

      case 'PERSONAL_EVENT_SOLD': {
        personalEventActions.push({ cardName: ev.eventName, action: 'SELL' });
        break;
      }

      case 'INTEGRATION_BONUS': {
        integrationBonusesFired.push({
          playerId:  ev.playerId,
          bonusType: ev.effectType,
          round,
        });
        addNotable(round, 'BONUS', 'bonus', `${ev.playerId}: ${ev.effectType}`);
        break;
      }

      default:
        break;
    }
  }

  // ── game_length_rounds: use state.round, which reflects the true last round
  // played (including the post-death final round run after END_TRIGGER fires).
  const game_length_rounds = state.round ?? 0;

  // ── gmi_by_round: dense integer array, one entry per round (1-indexed) ────
  const gmi_by_round = [];
  for (let r = 1; r <= game_length_rounds; r++) {
    gmi_by_round.push(gmiByRound[r] ?? null);
  }

  // ── asset_value_trajectories ───────────────────────────────────────────────
  const asset_value_trajectories = Object.entries(assetValuesByRound).map(
    ([assetId, valueMap]) => {
      const info   = assetInfo.get(assetId) ?? {};
      const maxR   = Math.max(...Object.keys(valueMap).map(Number));
      const valueByRound = [];
      for (let r = 1; r <= maxR; r++) {
        valueByRound.push(valueMap[r] ?? null);
      }
      return { assetId, industry: info.industry ?? null, valueByRound };
    },
  );

  // ── final_score_by_player ──────────────────────────────────────────────────
  const final_score_by_player = (state.players ?? []).map((player) => ({
    playerId:     player.id,
    ceoArchetype: player.ceo?.archetype ?? null,
    score:        gameOverScores?.[player.id]?.score ?? 0,
    industries:   [...new Set((player.assets ?? []).map((a) => a.industry).filter(Boolean))],
  }));

  // ── loan_utilization_by_player ─────────────────────────────────────────────
  const loan_utilization_by_player = (state.players ?? []).map((player) => {
    const maxCapacity = computeTotalLoanCapacity(player);
    const drawn       = player.loans ?? 0;
    return {
      playerId:    player.id,
      maxCapacity,
      drawn,
      ratio: maxCapacity > 0 ? drawn / maxCapacity : 0,
    };
  });

  // ── tax_offset_by_player ───────────────────────────────────────────────────
  const tax_offset_by_player = (state.players ?? []).map((player) => {
    const acc = taxAccByPlayer[player.id] ?? { grossIncome: 0, offset: 0, netTaxable: 0, taxPaid: 0 };
    return {
      playerId:   player.id,
      grossIncome: acc.grossIncome,
      offset:      acc.offset,
      netTaxable:  acc.netTaxable,
      taxPaid:     acc.taxPaid,
    };
  });

  // ── t3_acquisitions per player ─────────────────────────────────────────────
  const t3_acquisitions = Object.fromEntries(
    (state.players ?? []).map((p) => [p.id, t3ByPlayer[p.id] ?? 0]),
  );

  // ── income_vs_score ────────────────────────────────────────────────────────
  const income_vs_score = (state.players ?? []).map((player) => ({
    playerId:   player.id,
    totalIncome: incomeTotalByPlayer[player.id] ?? 0,
    finalScore:  gameOverScores?.[player.id]?.score ?? 0,
  }));

  // ── vertical stack detection (end-of-game structural check) ───────────────
  const has_vertical_stack = (state.players ?? []).some(playerHasVerticalStack);

  // ── Assemble result ────────────────────────────────────────────────────────
  return {
    first_asset_round,
    first_death_roll_round,
    game_length_rounds,
    death_count,
    bankruptcy_count,
    collateral_violation_count,
    final_score_by_player,
    asset_value_trajectories,
    loan_utilization_by_player,
    gmi_by_round,
    tax_offset_by_player,
    personal_event_actions:    personalEventActions,
    integration_bonuses_fired: integrationBonusesFired,
    stress_at_death_roll:      stressAtDeathRolls,
    t3_acquisitions,
    income_vs_score,
    has_vertical_stack,
    notable_events_by_round:   notableEventsByRound,
  };
}
