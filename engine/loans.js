/**
 * Loan mechanics: capacity, repayment rolls, and collateral validation.
 *
 * computeLoanCapacity(asset, playerAssets)  → number
 * checkLoanRepayment(asset, dice)           → { triggered, relief, roll, logEvent }
 * checkCollateralViolation(player)          → { violated, totalLoans, totalCapacity, logEvent }
 */

import { computeIntegrationLoanBonus } from './integration.js';

/**
 * Scans an outcome table for the entry whose range contains `roll`.
 *
 * @param {Array<{range:[number,number]}>} outcomes
 * @param {number} roll  1-6
 * @returns {object}  matching outcome entry
 */
function lookupOutcome(outcomes, roll) {
  for (const outcome of outcomes) {
    if (roll >= outcome.range[0] && roll <= outcome.range[1]) return outcome;
  }
  throw new Error(`No outcome found for roll ${roll}`);
}

/**
 * Returns the maximum number of loan tokens this asset can currently support.
 *
 * Formula:
 *   baseLoanCapacity
 *   + floor(currentValue / 10) * loanCapacityIncreasePer10AssetValue
 *   + integration loan bonus
 *
 * @param {object}   asset
 * @param {object[]} playerAssets  — all assets owned by the player (for integration checks)
 * @returns {number}
 */
export function computeLoanCapacity(asset, playerAssets = []) {
  const value = asset.currentValue ?? asset.baseValue;
  const base  = asset.baseLoanCapacity ?? 0;
  const step  = asset.loanCapacityIncreasePer10AssetValue ?? 0;

  const valueBonus       = Math.floor(value / 10) * step;
  const integrationBonus = computeIntegrationLoanBonus(asset, playerAssets);

  return base + valueBonus + integrationBonus;
}

/**
 * Resolves the annual loan repayment roll for a single asset.
 *
 * Roll d6 and look up the result in asset.loanRepaymentRule.outcomes:
 *   triggered=true  → player must pay asset.loanRepaymentRule.paymentOnTrigger
 *   relief=true     → player may remove one loan token for free
 *
 * @param {object} asset
 * @param {import('./dice.js').Dice} dice
 * @returns {{ triggered: boolean, relief: boolean, roll: number, logEvent: object|null }}
 */
export function checkLoanRepayment(asset, dice) {
  const roll    = dice.d6();
  const outcome = lookupOutcome(asset.loanRepaymentRule.outcomes, roll);

  const triggered = outcome.trigger  ?? false;
  const relief    = outcome.relief   ?? false;

  const logEvent = triggered
    ? {
        type:       'LOAN_REPAYMENT_TRIGGERED',
        assetId:    asset.companyName,
        roll,
        paymentDue: asset.loanRepaymentRule.paymentOnTrigger,
      }
    : null;

  return { triggered, relief, roll, logEvent };
}

/**
 * Checks whether the player's total drawn loans exceed their total loan capacity.
 *
 * Capacity is summed across every asset the player owns.
 * Records the metric 'collateral_violation_count' in the log event when violated.
 *
 * @param {object} player  — must have player.loans (number) and player.assets (array)
 * @returns {{ violated: boolean, totalLoans: number, totalCapacity: number, logEvent: object|null }}
 */
export function checkCollateralViolation(player) {
  const totalCapacity = player.assets.reduce(
    (sum, asset) => sum + computeLoanCapacity(asset, player.assets),
    0,
  );

  const totalLoans = player.loans;
  const violated   = totalLoans > totalCapacity;

  const logEvent = violated
    ? {
        type:         'COLLATERAL_VIOLATION',
        playerId:     player.id,
        totalLoans,
        totalCapacity,
        metric:       'collateral_violation_count',
      }
    : null;

  return { violated, totalLoans, totalCapacity, logEvent };
}
