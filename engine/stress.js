/**
 * Stress, death rolls, and bankruptcy resolution.
 *
 * applyAssetStress(player, asset)   → { logEvent }
 * removeAssetStress(player, asset)  → { logEvent }
 * checkDeathRoll(player, dice)      → { rolled, result, survived, logEvent }
 * applyBankruptcy(player, gmi)      → { logEvent }
 */

/**
 * Adds an asset's stress value to the player on acquisition.
 * Mutates player directly.
 *
 * @param {object} player
 * @param {object} asset
 * @returns {{ logEvent: object }}
 */
export function applyAssetStress(player, asset) {
  const delta = asset.stress ?? 0;
  player.stress += delta;

  const logEvent = {
    type:      'STRESS_CHANGE',
    playerId:  player.id,
    delta:     +delta,
    newStress: player.stress,
    reason:    'ASSET_ACQUIRED',
    assetId:   asset.companyName,
  };

  return { logEvent };
}

/**
 * Removes an asset's stress value from the player on sale.
 * Stress cannot fall below the CEO's startingStress.
 * Mutates player directly.
 *
 * @param {object} player
 * @param {object} asset
 * @returns {{ logEvent: object }}
 */
export function removeAssetStress(player, asset) {
  const floor    = player.ceo?.startingStress ?? 0;
  const oldStress = player.stress;
  player.stress   = Math.max(floor, player.stress - (asset.stress ?? 0));
  const delta     = player.stress - oldStress;   // negative or zero

  const logEvent = {
    type:      'STRESS_CHANGE',
    playerId:  player.id,
    delta,
    newStress: player.stress,
    reason:    'ASSET_SOLD',
    assetId:   asset.companyName,
  };

  return { logEvent };
}

/**
 * Rolls for death if the player's stress meets or exceeds their CEO's threshold.
 *
 * Threshold:  player.ceo.deathRollThreshold  (8 for The Bureaucrat, 6 for all others)
 * d6 result:  1-2 → dead   (player.alive = false)
 *             3-6 → survive
 *
 * Does nothing (rolled=false) if:
 *   - player is already dead
 *   - stress is below the threshold
 *   - player has no CEO (threshold treated as Infinity)
 *
 * Mutates player.alive on death.
 *
 * @param {object} player
 * @param {import('./dice.js').Dice} dice
 * @returns {{ rolled: boolean, result: number|null, survived: boolean, logEvent: object|null }}
 */
export function checkDeathRoll(player, dice) {
  const threshold = player.ceo?.deathRollThreshold ?? Infinity;

  if (!player.alive || player.stress < threshold) {
    return { rolled: false, result: null, survived: true, logEvent: null };
  }

  const result   = dice.d6();
  const survived = result >= 2;

  if (!survived) {
    player.alive = false;
  }

  const logEvent = {
    type:      'DEATH_ROLL',
    playerId:  player.id,
    stress:    player.stress,
    threshold,
    roll:      result,
    survived,
  };

  return { rolled: true, result, survived, logEvent };
}

/**
 * Resets a player to a post-bankruptcy state.
 * - Cash reset to max(5, gmi + 5)  — a small stake scaled by market conditions
 * - All assets and loans wiped
 * - Stress increases by 2
 * - taxesPaid is preserved (never resets)
 *
 * Mutates player directly.
 *
 * @param {object} player
 * @param {number} gmi  — current year's GMI delta
 * @returns {{ logEvent: object }}
 */
export function applyBankruptcy(player, gmi) {
  player.cash   = Math.max(5, gmi + 5);
  player.assets = [];
  player.loans  = 0;
  player.stress += 2;

  const logEvent = {
    type:      'BANKRUPTCY',
    playerId:  player.id,
    newCash:   player.cash,
    newStress: player.stress,
  };

  return { logEvent };
}
