/**
 * CEO ability dispatch and explicit per-ability activators.
 *
 * applyCEOAbilities(player, phase, state, dice, context)
 *   → { logEvents }
 *   Auto-resolves passive / auto-trigger abilities for the given phase.
 *   Phases: 'LABOR' | 'AUCTION' | 'VALUE_UPDATE' | 'SETTLEMENT'
 *
 * useSuitMarketRefresh(player, state)
 *   → { logEvent }   (ONCE_PER_GAME; returns null logEvent if already used)
 *
 * useGamblerReroll(player, originalRoll, dice)
 *   → { newRoll, oldRoll, stressGained, logEvent }
 *
 * useLobbyistGMIAdjust(player, state, direction)
 *   → { logEvent }   direction: +1 | -1
 *
 * resetCEOYearlyAbilities(player)
 *   → void   (clears ONCE_PER_YEAR flags at year end)
 *
 * Ability state is tracked on player.ceoAbilityState (lazily initialised):
 *   { suitRefreshUsed: boolean, gamblerRerollUsedThisYear: boolean,
 *     lobbyistAdjustUsedThisYear: boolean, ... }
 */

// ─────────────────────────────────────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns (and lazily initialises) the CEO ability state object.
 * @private
 */
function abilityState(player) {
  player.ceoAbilityState = player.ceoAbilityState ?? {};
  return player.ceoAbilityState;
}

// ─────────────────────────────────────────────────────────────────────────────
// Phase dispatch
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Auto-resolves passive and auto-triggered CEO abilities for the given phase.
 *
 * Abilities handled here (automatically, no player choice required):
 *
 *   LABOR phase
 *     The Worker  — roll d6; on 4–6, gain +$1 cash (bonus income on top of base $1).
 *     The Suit    — $3 base income every year (gross income component; caller handles
 *                   taxable income by reading player.ceo.annualIncome = 3).
 *                   No mutation here — annualIncome is read by computeTaxableIncome.
 *
 *   VALUE_UPDATE phase
 *     The Short Seller — if gmiDelta < 0 this year, gain $1 cash (context.gmiDelta).
 *     The Influencer   — whenever player stress increases, their highest-value
 *                        MEDIA_ENTERTAINMENT asset gains +1. This is reactive and
 *                        must be called by the caller after any stress increase.
 *                        Pass context.stressDelta > 0 to trigger it here.
 *     The Visionary    — RISK: if total asset value did not increase vs. start of
 *                        year, gain +1 stress. Pass context.assetValueIncreased
 *                        (boolean) to resolve this.
 *
 *   SETTLEMENT phase
 *     The Tax Attorney — first $2 of income is tax-free.  No mutation here — the
 *                        caller adjusts computeTaxableIncome inputs (or passes a
 *                        custom free threshold) when ceoName === 'The Tax Attorney'.
 *
 * Abilities NOT handled here (explicit activators below):
 *   The Suit        → useSuitMarketRefresh
 *   The Gambler     → useGamblerReroll
 *   The Lobbyist    → useLobbyistGMIAdjust
 *
 * @param {object} player
 * @param {'LABOR'|'AUCTION'|'VALUE_UPDATE'|'SETTLEMENT'} phase
 * @param {object} state
 * @param {import('./dice.js').Dice} dice
 * @param {{
 *   gmiDelta?: number,
 *   stressDelta?: number,
 *   assetValueIncreased?: boolean,
 * }} [context={}]
 * @returns {{ logEvents: object[] }}
 */
export function applyCEOAbilities(player, phase, state, dice, context = {}) {
  if (!player.alive || !player.ceo) return { logEvents: [] };

  const ceoName   = player.ceo.ceoName;
  const logEvents = [];

  // ── LABOR ─────────────────────────────────────────────────────────────────
  if (phase === 'LABOR') {
    if (ceoName === 'The Worker') {
      const roll = dice.d6();
      if (roll >= 4) {
        player.cash += 1;
        logEvents.push({
          type:     'CEO_ABILITY',
          ceoName,
          ability:  'WORKER_BONUS_INCOME',
          roll,
          delta:    1,
          newCash:  player.cash,
        });
      } else {
        logEvents.push({
          type:     'CEO_ABILITY',
          ceoName,
          ability:  'WORKER_BONUS_INCOME',
          roll,
          delta:    0,
          newCash:  player.cash,
        });
      }
    }
  }

  // ── VALUE_UPDATE ──────────────────────────────────────────────────────────
  if (phase === 'VALUE_UPDATE') {
    // Short Seller passive: negative GMI → +$1
    if (ceoName === 'The Short Seller' && (context.gmiDelta ?? 0) < 0) {
      player.cash += 1;
      logEvents.push({
        type:     'CEO_ABILITY',
        ceoName,
        ability:  'SHORT_SELLER_NEGATIVE_GMI',
        delta:    1,
        newCash:  player.cash,
      });
    }

    // Influencer passive: stress increase → highest MEDIA_ENTERTAINMENT asset +1
    if (ceoName === 'The Influencer' && (context.stressDelta ?? 0) > 0) {
      const mediaAssets = (player.assets ?? []).filter(
        a => a.industry === 'MEDIA_ENTERTAINMENT',
      );
      if (mediaAssets.length > 0) {
        // Highest-value asset
        const target = mediaAssets.reduce((best, a) => {
          const v = a.currentValue ?? a.baseValue;
          return v > (best.currentValue ?? best.baseValue) ? a : best;
        });
        const oldValue      = target.currentValue ?? target.baseValue;
        target.currentValue = oldValue + 1;
        logEvents.push({
          type:     'CEO_ABILITY',
          ceoName,
          ability:  'INFLUENCER_STRESS_CONTENT',
          assetId:  target.companyName,
          oldValue,
          newValue: target.currentValue,
        });
      }
    }

    // Visionary RISK: if asset value did not increase, +1 stress
    if (ceoName === 'The Visionary' && context.assetValueIncreased === false) {
      player.stress += 1;
      logEvents.push({
        type:      'CEO_ABILITY',
        ceoName,
        ability:   'VISIONARY_STAGNATION_STRESS',
        delta:     1,
        newStress: player.stress,
      });
    }
  }

  return { logEvents };
}

// ─────────────────────────────────────────────────────────────────────────────
// Explicit activators (player-choice abilities)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The Suit — ONCE_PER_GAME market refresh.
 * Before the auction phase begins, discard all 4 current market cards and
 * replace them with 4 new draws from the remaining deck.
 * Mutates state.marketCards and state.discardPiles.marketDeck.
 * Returns { logEvent: null } if already used this game.
 *
 * @param {object} player
 * @param {object} state   — GameState
 * @returns {{ logEvent: object|null }}
 */
export function useSuitMarketRefresh(player, state) {
  if (player.ceo?.ceoName !== 'The Suit') return { logEvent: null };

  const as = abilityState(player);
  if (as.suitRefreshUsed) return { logEvent: null };

  as.suitRefreshUsed = true;

  const deck         = state.discardPiles.marketDeck ?? [];
  const discarded    = state.marketCards.filter(Boolean).map(c => c.companyName);
  const newCards     = deck.splice(0, 4);

  state.marketCards             = newCards;
  state.discardPiles.marketDeck = deck;

  const logEvent = {
    type:      'CEO_ABILITY',
    ceoName:   'The Suit',
    ability:   'SUIT_MARKET_REFRESH',
    discarded,
    newCards:  newCards.map(c => c.companyName),
  };

  return { logEvent };
}

/**
 * The Gambler — ONCE_PER_YEAR reroll.
 * Called after rolling one asset value die; the new result must be taken.
 * If the new roll is strictly lower than the original, the RISK ability
 * triggers: +1 stress.
 * Returns { logEvent: null } if already used this year.
 *
 * @param {object} player
 * @param {number} originalRoll  — d6 result to reroll
 * @param {import('./dice.js').Dice} dice
 * @returns {{ newRoll: number, oldRoll: number, stressGained: number, logEvent: object|null }}
 */
export function useGamblerReroll(player, originalRoll, dice) {
  if (player.ceo?.ceoName !== 'The Gambler') {
    return { newRoll: originalRoll, oldRoll: originalRoll, stressGained: 0, logEvent: null };
  }

  const as = abilityState(player);
  if (as.gamblerRerollUsedThisYear) {
    return { newRoll: originalRoll, oldRoll: originalRoll, stressGained: 0, logEvent: null };
  }

  as.gamblerRerollUsedThisYear = true;

  const newRoll     = dice.d6();
  const stressGained = newRoll < originalRoll ? 1 : 0;

  if (stressGained > 0) {
    player.stress += stressGained;
  }

  const logEvent = {
    type:         'CEO_ABILITY',
    ceoName:      'The Gambler',
    ability:      'GAMBLER_REROLL',
    oldRoll:      originalRoll,
    newRoll,
    stressGained,
    newStress:    player.stress,
  };

  return { newRoll, oldRoll: originalRoll, stressGained, logEvent };
}

/**
 * The Lobbyist — ONCE_PER_YEAR GMI adjustment.
 * Called immediately after the global event card is drawn, before any asset
 * values are updated.  Adjusts state.gmi by direction (+1 or -1).
 * Returns { logEvent: null } if already used this year.
 *
 * @param {object} player
 * @param {object} state      — GameState (mutated: state.gmi adjusted)
 * @param {1|-1}   direction  — +1 or -1
 * @returns {{ logEvent: object|null }}
 */
export function useLobbyistGMIAdjust(player, state, direction) {
  if (player.ceo?.ceoName !== 'The Lobbyist') return { logEvent: null };

  const as = abilityState(player);
  if (as.lobbyistAdjustUsedThisYear) return { logEvent: null };

  as.lobbyistAdjustUsedThisYear = true;

  state.gmi += direction;

  const logEvent = {
    type:      'CEO_ABILITY',
    ceoName:   'The Lobbyist',
    ability:   'LOBBYIST_GMI_ADJUST',
    direction,
    newGmi:    state.gmi,
  };

  return { logEvent };
}

/**
 * Clears all ONCE_PER_YEAR CEO ability flags at the end of each round.
 * Should be called for every player during year-end cleanup.
 *
 * @param {object} player
 */
export function resetCEOYearlyAbilities(player) {
  const as = abilityState(player);
  as.gamblerRerollUsedThisYear    = false;
  as.lobbyistAdjustUsedThisYear   = false;
}
