/**
 * Global and personal event resolution.
 *
 * resolveGlobalEvent(card, state, dice)
 *   → { gmiDelta, logEvents }
 *   Handles:
 *     • existing depression persistence/escape rolls
 *     • GMI computation
 *     • bubble pops (when GMI delta < 0)
 *     • new bubble / depression registration
 *     • STRESS_MODIFIER effects applied to all living players
 *
 * resolvePersonalEvent(card, player, state, dice)
 *   → { logEvents }
 *   IMMEDIATE  → apply immediateEffect now and discard
 *   HOLD       → add to player.hand (player plays it voluntarily later)
 *   PASSIVE    → add to player.hand (always-active rule)
 */

import { computeGMIDelta }         from './gmi.js';
import { checkCollateralViolation } from './loans.js';

/**
 * d6 threshold at which each persistent depression ends (roll >= threshold).
 * @private
 */
const DEPRESSION_ESCAPE_THRESHOLD = {
  'Great Depression':  4,   // 4–6 escape
  'Debt Crisis':       5,   // 5–6 escape
  'Systemic Collapse': 6,   // 6 only
};

/**
 * Resolves a drawn global event card against the current game state.
 *
 * Step order:
 *   1. Roll for each active depression: escape or persist (+1 stress to all).
 *   2. Compute GMI delta from the newly drawn card.
 *   3. Pop any active bubble whose targetIndustry is affected when gmiDelta < 0:
 *      all assets of that industry drop by 3.
 *   4. Register the new card as an active bubble or depression (if persistent).
 *   5. Apply any STRESS_MODIFIER effects from the new card to all living players.
 *
 * @param {object}                    card   — global event card
 * @param {object}                    state  — GameState (mutated)
 * @param {import('./dice.js').Dice}  dice
 * @returns {{ gmiDelta: number, logEvents: object[] }}
 */
export function resolveGlobalEvent(card, state, dice) {
  const logEvents = [];

  // ── 1. Depression persistence / escape rolls ──────────────────────────────
  const survivingDepressions = [];

  for (const dep of (state.activeDepressions ?? [])) {
    const threshold = DEPRESSION_ESCAPE_THRESHOLD[dep.eventName];
    if (threshold === undefined) {
      // Unknown depression type — keep it active, skip roll
      survivingDepressions.push(dep);
      continue;
    }

    const roll    = dice.d6();
    const escaped = roll >= threshold;

    if (escaped) {
      logEvents.push({
        type:      'DEPRESSION_ENDED',
        eventName: dep.eventName,
        roll,
      });
    } else {
      // Persists — all living players gain +1 stress
      for (const player of state.players) {
        if (!player.alive) continue;
        player.stress += 1;
        logEvents.push({
          type:      'STRESS_CHANGE',
          playerId:  player.id,
          delta:     1,
          newStress: player.stress,
          reason:    'DEPRESSION_PERSISTS',
          source:    dep.eventName,
        });
      }
      survivingDepressions.push(dep);
      logEvents.push({
        type:      'DEPRESSION_PERSISTS',
        eventName: dep.eventName,
        roll,
      });
    }
  }
  state.activeDepressions = survivingDepressions;

  // ── 2. Compute GMI delta ──────────────────────────────────────────────────
  let gmiDelta = 0;
  if (card.playerSetGMI) {
    const chance = dice.roll(6);
    if (chance in [1, 2]) {
      gmiDelta = -2;
    }
    if (chance in [3, 4]) {
      gmiDelta = 2;
    }
    if (chance in [5, 6]) {
      gmiDelta = 0;
    }
  } else {
    gmiDelta = computeGMIDelta(card, dice);
  }
  
  state.gmi     += gmiDelta;

  logEvents.push({
    type:      'GMI_UPDATE',
    eventName: card.eventName,
    gmiDelta,
    newGmi:    state.gmi,
  });

  // ── 3. Pop bubbles when GMI delta is negative ─────────────────────────────
  const survivingBubbles = [];

  for (const bubble of (state.activeBubbles ?? [])) {
    if (gmiDelta < 0) {
      // Drop all assets in the bubble industry by 3 (floor 0, §12).
      const affectedPlayers = new Set();
      for (const player of state.players) {
        for (const asset of (player.assets ?? [])) {
          if (asset.industry !== bubble.targetIndustry) continue;
          const oldValue     = asset.currentValue ?? asset.baseValue;
          asset.currentValue = Math.max(0, oldValue - 3);
          affectedPlayers.add(player);
          logEvents.push({
            type:     'BUBBLE_POP_ASSET_DROP',
            assetId:  asset.companyName,
            playerId: player.id,
            industry: bubble.targetIndustry,
            oldValue,
            newValue: asset.currentValue,
          });
        }
      }

      // §10: immediately check collateral violations for affected players.
      for (const player of affectedPlayers) {
        const { violated, totalLoans, totalCapacity } = checkCollateralViolation(player);
        if (!violated) continue;
        // Immediate resolution: repay with cash; shortfall → stress (§12).
        const excess    = totalLoans - totalCapacity;
        const repaid    = Math.min(excess, player.cash ?? 0);
        player.loans   -= repaid;
        player.cash    -= repaid;
        const shortfall = excess - repaid;
        if (shortfall > 0) {
          player.stress  += shortfall;
          player.loans   -= shortfall;  // loans reduced by stress-conversion
        }
        logEvents.push({
          type:         'BUBBLE_POP_COLLATERAL_VIOLATION',
          playerId:     player.id,
          excess,
          repaid,
          shortfall,
          newLoans:     player.loans,
          newCash:      player.cash,
          newStress:    player.stress,
        });
      }

      logEvents.push({
        type:           'BUBBLE_POPPED',
        eventName:      bubble.eventName,
        targetIndustry: bubble.targetIndustry,
      });
    } else {
      survivingBubbles.push(bubble);
    }
  }
  state.activeBubbles = survivingBubbles;

  // ── 4. Register new persistent bubble or depression ───────────────────────
  if (card.persistent) {
    if (card.eventCategory === 'BUBBLE') {
      state.activeBubbles.push(card);
      logEvents.push({
        type:           'BUBBLE_ACTIVATED',
        eventName:      card.eventName,
        targetIndustry: card.targetIndustry,
      });
    } else if (card.eventCategory === 'DEPRESSION') {
      state.activeDepressions.push(card);
      logEvents.push({
        type:      'DEPRESSION_ACTIVATED',
        eventName: card.eventName,
      });
    }
  }

  // ── 5. Apply STRESS_MODIFIER effects to all living players ────────────────
  for (const effect of (card.effects ?? [])) {
    if (effect.effectType !== 'STRESS_MODIFIER') continue;
    for (const player of state.players) {
      if (!player.alive) continue;
      player.stress += effect.magnitude;
      logEvents.push({
        type:      'STRESS_CHANGE',
        playerId:  player.id,
        delta:     effect.magnitude,
        newStress: player.stress,
        reason:    'GLOBAL_EVENT',
        source:    card.eventName,
      });
    }
  }

  return { gmiDelta, logEvents };
}

/**
 * Resolves a personal event card drawn for a specific player.
 *
 * IMMEDIATE  — immediateEffect is applied now; card is consumed.
 * HOLD       — card is added to player.hand; player plays it manually later.
 * PASSIVE    — card is added to player.hand; its rule is always active while held.
 *
 * Supported immediateEffect types:
 *   CASH_CHANGE  → player.cash  += magnitude
 *   STRESS_CHANGE → player.stress += magnitude
 *   Others       → recorded in the log but not mutated (caller responsible).
 *
 * @param {object} card    — personal event card
 * @param {object} player  — receiving player (mutated for IMMEDIATE effects)
 * @param {object} state   — GameState (available for future effect types)
 * @param {import('./dice.js').Dice} dice
 * @returns {{ logEvents: object[] }}
 */
export function resolvePersonalEvent(card, player, state, dice) {  // eslint-disable-line no-unused-vars
  const logEvents = [];

  if (card.playTiming === 'IMMEDIATE') {
    const effect = card.immediateEffect;

    if (effect) {
      if (effect.effectType === 'CASH_CHANGE') {
        player.cash += effect.magnitude;
        logEvents.push({
          type:       'PERSONAL_EVENT_APPLIED',
          playerId:   player.id,
          eventName:  card.eventName,
          effectType: effect.effectType,
          magnitude:  effect.magnitude,
          newCash:    player.cash,
        });
      } else if (effect.effectType === 'STRESS_CHANGE') {
        player.stress += effect.magnitude;
        logEvents.push({
          type:       'PERSONAL_EVENT_APPLIED',
          playerId:   player.id,
          eventName:  card.eventName,
          effectType: effect.effectType,
          magnitude:  effect.magnitude,
          newStress:  player.stress,
        });
      } else {
        // Other effect types recorded; caller applies them
        logEvents.push({
          type:       'PERSONAL_EVENT_APPLIED',
          playerId:   player.id,
          eventName:  card.eventName,
          effectType: effect.effectType,
        });
      }
    }
  } else {
    // HOLD or PASSIVE — add to hand
    player.hand = player.hand ?? [];
    player.hand.push(card);
    logEvents.push({
      type:        'PERSONAL_EVENT_HELD',
      playerId:    player.id,
      eventName:   card.eventName,
      playTiming:  card.playTiming,
    });
  }

  return { logEvents };
}
