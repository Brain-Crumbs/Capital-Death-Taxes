/**
 * GMI (Global Market Index) computation and per-asset application.
 *
 * computeGMIDelta  — resolves this year's integer GMI delta from a global event card
 * applyGMIToAsset  — applies that delta to an asset using its industry mechanics
 */

/**
 * Modifier table used by BULL_RUN, FLAT, and WILDCARD cards.
 * d6 roll → adjustment to add to gmiBase.
 */
function rollModifier(roll) {
  if (roll <= 2) return -1;
  if (roll <= 4) return  0;
  return +1;
}

/**
 * Categories whose gmiBase is augmented by a d6 roll using rollModifier().
 * All other categories use gmiBase directly (gmiDieRoll is null on the card).
 */
const ROLL_MODIFIER_CATEGORIES = new Set(['BULL_RUN', 'FLAT', 'WILDCARD']);

/**
 * Computes the integer GMI delta for the current year.
 *
 * @param {object} globalEventCard  — a card from global-event-cards.json
 * @param {import('./dice.js').Dice} dice
 * @returns {number}  integer delta (may be negative)
 */
export function computeGMIDelta(globalEventCard, dice) {
  const base = globalEventCard.gmiBase;

  // Use the category set first; fall back to the card's own gmiDieRoll field
  // so future card additions are handled automatically.
  const needsRoll =
    ROLL_MODIFIER_CATEGORIES.has(globalEventCard.eventCategory) ||
    globalEventCard.gmiDieRoll === 'd6';

  if (needsRoll) {
    return base + rollModifier(dice.d6());
  }

  return base;
}

/**
 * Applies a pre-computed gmiDelta to an asset using its industry's mechanics.
 *
 * Industry rules
 * ──────────────
 * ENERGY            apply gmiDelta twice (T1/T2) or three times (T3)
 * MANUFACTURING     apply Math.trunc(gmiDelta / 2)  — halved toward zero
 * FINANCE           apply once; if gmiDelta < 0, roll d6 — on 1-3 apply a second time
 * MEDIA_ENTERTAINMENT  roll buzz die: 1-2 → take the lower of (×1, ×2); 3-6 → take higher
 * TECHNOLOGY        apply normally (note: does NOT affect loan capacity — enforced elsewhere)
 * REAL_ESTATE       apply normally
 *
 * The asset value floor is 0 (§6, §12).
 *
 * @param {object} asset       — must have currentValue (or baseValue), industry, tier
 * @param {number} gmiDelta    — integer delta from computeGMIDelta
 * @param {import('./dice.js').Dice} dice  — needed for FINANCE and MEDIA rolls
 * @returns {{ newValue: number, gmiAdjustment: number, buzzRoll: number|null }}
 */
export function applyGMIToAsset(asset, gmiDelta, dice) {
  const currentValue = asset.currentValue ?? asset.baseValue;
  const industry     = asset.industry;
  const tier         = asset.tier ?? 1;

  let gmiAdjustment;
  let buzzRoll = null;

  switch (industry) {
    case 'ENERGY': {
      // T1 and T2 apply twice; T3 applies three times (upstream amplification)
      const multiplier = tier === 3 ? 3 : 2;
      gmiAdjustment = gmiDelta * multiplier;
      break;
    }

    case 'MANUFACTURING': {
      // GMI-resistant: halved, rounded toward zero
      gmiAdjustment = Math.trunc(gmiDelta / 2);
      break;
    }

    case 'FINANCE': {
      // Normal application; on a downturn, chance of double impact
      gmiAdjustment = gmiDelta;
      if (gmiDelta < 0) {
        const roll = dice.d6();
        if (roll <= 3) {
          gmiAdjustment += gmiDelta;   // second application
        }
      }
      break;
    }

    case 'MEDIA_ENTERTAINMENT': {
      // Buzz die mechanic:
      // Roll buzz die (d6): 1-2 = bad buzz → take lower of (×1, ×2);
      //                     3-6 = good buzz → take higher of (×1, ×2)
      //
      // "Lower" of the two candidate adjustments means worse outcome:
      //   positive gmiDelta → ×1 is lower (less gain)
      //   negative gmiDelta → ×2 is lower (more loss)
      // "Higher" is the better outcome in each direction.
      buzzRoll = dice.d6();
      const single = gmiDelta;
      const doubled = gmiDelta * 2;
      gmiAdjustment = buzzRoll <= 2
        ? Math.min(single, doubled)    // bad buzz
        : Math.max(single, doubled);   // good buzz
      break;
    }

    case 'TECHNOLOGY':
    case 'REAL_ESTATE':
    default:
      // Normal application. For TECHNOLOGY, loan-capacity immunity is
      // enforced at the settlement layer, not here.
      gmiAdjustment = gmiDelta;
      break;
  }

  const newValue = Math.max(0, currentValue + gmiAdjustment);
  return { newValue, gmiAdjustment, buzzRoll };
}
