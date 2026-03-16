/**
 * Vertical integration and cross-industry synergy resolution.
 *
 * computeIntegrationLoanBonus(asset, playerAssets)
 *   → total LOAN_CAPACITY_BONUS earned by `asset` from the player's portfolio
 *
 * detectIntegration(player)
 *   → array of active bonus descriptors for the player's current portfolio
 *
 * applyIntegrationBonuses(player, bonuses)
 *   → applies stressReduction bonuses; returns { logEvents }
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

/**
 * Detects all active integration bonuses for a player's current portfolio.
 *
 * For each asset, scans its verticalIntegrationRules and crossIndustrySynergies.
 * A rule is fulfilled when the player owns another asset matching
 * { industry: rule.requiresIndustry, placement: rule.requiresPlacement }.
 *
 * The Operator CEO special rules:
 *   1. When a vertical integration rule is active on an asset, the Operator
 *      may also activate ONE cross-industry synergy on that same asset without
 *      owning the required asset (operatorActivated=true on that bonus).
 *   2. All stressReduction values from vertical integration rules are doubled.
 *
 * @param {object} player  — must have player.assets and player.ceo
 * @returns {Array<{
 *   assetId: string,
 *   rule: object,
 *   effectType: string,
 *   effectMagnitude: number,
 *   stressReduction: number,
 *   source: 'VERTICAL'|'CROSS_INDUSTRY',
 *   operatorActivated?: boolean,
 * }>}
 */
export function detectIntegration(player) {
  const assets      = player.assets ?? [];
  const isOperator  = player.ceo?.ceoName === 'The Operator';
  const bonuses     = [];

  for (const asset of assets) {
    const others = assets.filter(a => a.companyName !== asset.companyName);

    // ── Vertical integration rules ────────────────────────────────────────────
    let hasActiveVertical = false;

    for (const rule of (asset.verticalIntegrationRules ?? [])) {
      if (!rule.requiresIndustry || !rule.requiresPlacement) continue;

      const fulfilled = others.some(
        a => a.industry === rule.requiresIndustry &&
             a.placement === rule.requiresPlacement,
      );
      if (!fulfilled) continue;

      hasActiveVertical = true;
      // The Operator doubles stressReduction on vertical rules
      const stressReduction = isOperator
        ? (rule.stressReduction ?? 0) * 2
        : (rule.stressReduction ?? 0);

      bonuses.push({
        assetId: asset.companyName,
        rule,
        effectType:       rule.effectType,
        effectMagnitude:  rule.effectMagnitude ?? 0,
        stressReduction,
        source:           'VERTICAL',
      });
    }

    // ── Cross-industry synergies ───────────────────────────────────────────────
    let operatorFreeUsed = false;

    for (const rule of (asset.crossIndustrySynergies ?? [])) {
      if (!rule.requiresIndustry || !rule.requiresPlacement) continue;

      const fulfilled = others.some(
        a => a.industry === rule.requiresIndustry &&
             a.placement === rule.requiresPlacement,
      );

      // The Operator may activate ONE free cross-industry synergy per asset
      // when at least one vertical integration is already active on that asset.
      const operatorFree = isOperator && hasActiveVertical && !operatorFreeUsed && !fulfilled;

      if (!fulfilled && !operatorFree) continue;

      if (operatorFree) operatorFreeUsed = true;

      bonuses.push({
        assetId:          asset.companyName,
        rule,
        effectType:       rule.effectType,
        effectMagnitude:  rule.effectMagnitude ?? 0,
        stressReduction:  rule.stressReduction ?? 0,
        source:           'CROSS_INDUSTRY',
        ...(operatorFree ? { operatorActivated: true } : {}),
      });
    }
  }

  return bonuses;
}

/**
 * Applies the stressReduction component of a set of integration bonuses.
 * Stress cannot drop below the CEO's startingStress.
 * Mutates player directly.
 *
 * @param {object} player
 * @param {Array}  bonuses  — from detectIntegration()
 * @returns {{ logEvents: object[] }}
 */
export function applyIntegrationBonuses(player, bonuses) {
  const logEvents = [];
  const floor     = player.ceo?.startingStress ?? 0;

  for (const bonus of bonuses) {
    const reduction = bonus.stressReduction ?? 0;
    if (reduction <= 0) continue;

    const oldStress   = player.stress;
    player.stress     = Math.max(floor, player.stress - reduction);
    const actualDelta = player.stress - oldStress;   // negative or zero

    if (actualDelta !== 0) {
      logEvents.push({
        type:           'INTEGRATION_BONUS',
        playerId:       player.id,
        assetId:        bonus.assetId,
        effectType:     bonus.effectType,
        stressReduction: -actualDelta,
        newStress:      player.stress,
      });
    }
  }

  return { logEvents };
}
