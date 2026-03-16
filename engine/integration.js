/**
 * Vertical integration and cross-industry synergy resolution.
 *
 * computeIntegrationLoanBonus(asset, playerAssets)
 *   → total LOAN_CAPACITY_BONUS earned by `asset` from the player's portfolio
 */

/**
 * Returns the total extra loan capacity granted to `asset` by any active
 * vertical-integration or cross-industry-synergy rules.
 *
 * A rule activates when the player owns at least one OTHER asset whose
 * industry and placement match the rule's requirements.
 *
 * @param {object}   asset         — the asset being evaluated
 * @param {object[]} playerAssets  — all assets currently owned by the player
 * @returns {number}  bonus to add to baseLoanCapacity (0 if none)
 */
export function computeIntegrationLoanBonus(asset, playerAssets = []) {
  // Other assets owned by this player (exclude the asset itself)
  const others = playerAssets.filter(a => a.companyName !== asset.companyName);

  let bonus = 0;

  const rules = [
    ...(asset.verticalIntegrationRules   ?? []),
    ...(asset.crossIndustrySynergies     ?? []),
  ];

  for (const rule of rules) {
    if (rule.effectType !== 'LOAN_CAPACITY_BONUS') continue;
    if (!rule.requiresIndustry || !rule.requiresPlacement) continue;

    const fulfilled = others.some(
      a => a.industry === rule.requiresIndustry &&
           a.placement === rule.requiresPlacement,
    );

    if (fulfilled) {
      bonus += rule.effectMagnitude ?? 0;
    }
  }

  return bonus;
}
