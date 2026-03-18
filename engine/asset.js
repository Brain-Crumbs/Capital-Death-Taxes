/**
 * Asset value update engine.
 *
 * rollValueUpdate(asset, dice, gmiDelta, playerId, round)
 *   → { newValue, delta, roll, buzzRoll, baseDelta, gmiAdjustment, logEvent }
 *
 * Looks up the d6 result in asset.baseValueUpdateRule.outcomes for the base
 * delta, then applies GMI via applyGMIToAsset. All intermediate rolls are
 * recorded for the replay log.
 */

import { applyGMIToAsset } from './gmi.js';

/**
 * Finds the outcome delta for a given d6 roll by scanning the asset's
 * baseValueUpdateRule.outcomes array (range-based lookup).
 *
 * @param {Array<{range: [number,number], delta: number}>} outcomes
 * @param {number} roll  1-6
 * @returns {number}  delta for that roll
 */
function lookupOutcome(outcomes, roll) {
  for (const { range, delta } of outcomes) {
    if (roll >= range[0] && roll <= range[1]) return delta;
  }
  throw new Error(`No outcome found for roll ${roll} in outcome table`);
}

/**
 * Resolves one year's value update for a single asset.
 *
 * Steps:
 *  1. Roll d6 → look up base delta in asset.baseValueUpdateRule.outcomes
 *  2. Apply base delta to current value (floor 1) → intermediate value
 *  3. Apply industry-specific GMI mechanic via applyGMIToAsset (may roll
 *     additional dice for FINANCE / MEDIA_ENTERTAINMENT)
 *  4. Build a log event capturing every intermediate value for replay
 *
 * The asset object is not mutated; the caller is responsible for writing
 * newValue back to game state.
 *
 * @param {object} asset      — card object with currentValue (or baseValue),
 *                              industry, tier, baseValueUpdateRule, companyName
 * @param {import('./dice.js').Dice} dice
 * @param {number} gmiDelta   — integer from computeGMIDelta for this round
 * @param {string|null} [playerId]    — for the log event
 * @param {number|null} [round]       — for the log event
 * @param {number|null} [overrideRoll] — when set, use this roll instead of rolling the die
 *                                       (used by the Gambler's reroll ability)
 * @returns {{
 *   newValue:      number,
 *   delta:         number,   // total change from oldValue
 *   roll:          number,   // d6 used for outcome table lookup
 *   buzzRoll:      number|null,
 *   baseDelta:     number,
 *   gmiAdjustment: number,
 *   logEvent:      object,
 * }}
 */
export function rollValueUpdate(asset, dice, gmiDelta, playerId = null, round = null, overrideRoll = null) {
  const oldValue = asset.currentValue ?? asset.baseValue;

  // ── Step 1: base value update roll ───────────────────────────────────────
  const roll = overrideRoll !== null ? overrideRoll : dice.d6();
  const baseDelta = lookupOutcome(asset.baseValueUpdateRule.outcomes, roll);

  // ── Step 2: apply base delta (floor at 0, §6/§12) ───────────────────────
  const valueAfterBase = Math.max(0, oldValue + baseDelta);

  // ── Step 3: apply GMI via industry mechanic ──────────────────────────────
  // Pass a shallow copy with the post-base-delta value so applyGMIToAsset
  // operates from the correct intermediate value.
  const assetAtIntermediate = { ...asset, currentValue: valueAfterBase };
  const { newValue, gmiAdjustment, buzzRoll } = applyGMIToAsset(
    assetAtIntermediate,
    gmiDelta,
    dice,
  );

  // ── Step 4: log event ────────────────────────────────────────────────────
  const logEvent = {
    type:          'ASSET_VALUE_UPDATE',
    assetId:       asset.companyName,
    playerId,
    round,
    roll,
    buzzRoll,
    baseDelta,
    gmiAdjustment,
    newValue,
    oldValue,
  };

  return {
    newValue,
    delta:  newValue - oldValue,
    roll,
    buzzRoll,
    baseDelta,
    gmiAdjustment,
    logEvent,
  };
}
