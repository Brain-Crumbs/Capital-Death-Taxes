/**
 * Tax computation and settlement.
 *
 * computeTaxableIncome(player, loansDrawnThisYear) → { grossIncome, loanOffset, netTaxable, taxDue }
 * applyTax(player, taxDue, { loanOffset, grossIncome })  → { logEvent }
 */

/**
 * Computes this year's tax liability for a player (pure — does not mutate).
 *
 * Rules:
 *   grossIncome  = sum of income across all owned assets + CEO annualIncome
 *   First $1 of income is always tax-free
 *   loanOffset   = min(grossIncome − 1, loansDrawnThisYear)   loans offset income $-for-$
 *   netTaxable   = max(0, grossIncome − 1 − loanOffset)
 *   taxDue       = floor(netTaxable × 0.5)                    50% flat rate
 *
 * @param {object} player
 * @param {number} [loansDrawnThisYear=0]  — tokens drawn this round (not stored on player)
 * @returns {{ grossIncome: number, loanOffset: number, netTaxable: number, taxDue: number }}
 */
export function computeTaxableIncome(player, loansDrawnThisYear = 0) {
  const assetIncome   = (player.assets ?? []).reduce(
    (sum, asset) => sum + (asset.income ?? 0),
    0,
  );
  const starterIncome = player.starterAsset?.income ?? 0;
  const ceoIncome     = player.ceo?.annualIncome ?? 0;
  const grossIncome   = assetIncome + starterIncome + ceoIncome;

  // loanOffset can only reduce the portion above the first free $1
  const loanOffset  = Math.min(Math.max(0, grossIncome - 1), Math.max(0, loansDrawnThisYear));
  const netTaxable  = Math.max(0, grossIncome - 1 - loanOffset);
  const taxDue      = Math.floor(netTaxable * 0.5);

  return { grossIncome, loanOffset, netTaxable, taxDue };
}

/**
 * Deducts taxDue from the player's cash and records the cumulative total.
 * Mutates player directly.
 *
 * @param {object} player
 * @param {number} taxDue
 * @param {{ loanOffset?: number, grossIncome?: number }} [meta={}]
 *   — pass loanOffset and grossIncome (from computeTaxableIncome) for the metric
 * @returns {{ logEvent: object }}
 */
export function applyTax(player, taxDue, { loanOffset = 0, grossIncome = 0 } = {}) {
  player.cash      += grossIncome;
  player.cash      -= taxDue;
  player.taxesPaid += taxDue;

  // tax_offset_rate: fraction of taxable base that was sheltered by loans (0–1)
  const taxableBase      = Math.max(1, grossIncome - 1);
  const metricOffsetRate = loanOffset / taxableBase;

  const logEvent = {
    type:                 'TAX_APPLIED',
    playerId:             player.id,
    taxDue,
    newCash:              player.cash,
    totalTaxesPaid:       player.taxesPaid,
    metric_tax_offset_rate: metricOffsetRate,
  };

  return { logEvent };
}
