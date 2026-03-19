/**
 * IncomeAgent  (intentionally suboptimal)
 *
 * Strategy:
 *   - Maximises gross income: always bids on the highest-income card available
 *   - Doesn't understand the loan offset mechanic — rarely draws loans
 *   - Never sells assets voluntarily
 *
 * Design intent:
 *   Tests whether chasing raw income is a trap. High-income assets tend to
 *   carry higher stress and higher tax burdens. Because this agent doesn't
 *   use loans to offset income, it pays full 50% tax, eroding its score.
 */

import { BaseAgent } from './base-agent.js';

export class IncomeAgent extends BaseAgent {
  constructor(playerId, config = {}) {
    super(playerId, config);
    this.agentType = 'income';
  }

  // ── bidOnAsset ─────────────────────────────────────────────────────────────

  bidOnAsset(card, myPlayer, state) {
    const round = state.round ?? 0;

    // Pass on CEO cards — income agent only cares about asset income
    if (card.cardType === 'CEO') {
      this.logDecision('PASS', 'Income: ignores CEO auction', round);
      return 0;
    }

    if (card.cardType !== 'ASSET') return 0;

    // Portfolio cap
    if ((myPlayer.assets ?? []).length >= 3) {
      this.logDecision('PASS', 'Income: portfolio full', round);
      return 0;
    }

    // T3 access check
    if (card.tier === 3 && (myPlayer.ceo?.maxAssetTier ?? 2) < 3) {
      this.logDecision('PASS', `Income: no T3 access for ${card.companyName}`, round);
      return 0;
    }

    // Can't afford minimum bid
    if ((myPlayer.cash ?? 0) < card.baseValue) {
      this.logDecision(
        'PASS',
        `Income: can't afford ${card.companyName} (need ${card.baseValue}, have ${myPlayer.cash})`,
        round,
      );
      return 0;
    }

    const cardIncome = card.income ?? 0;

    // Determine if this is the highest-income card currently visible
    const visibleCards = (state.marketCards ?? []).filter(Boolean);
    const maxVisibleIncome = visibleCards.reduce(
      (max, c) => Math.max(max, c.income ?? 0),
      0,
    );

    // Bid only on the best-income card; if tied, bid on this one
    if (cardIncome < maxVisibleIncome) {
      this.logDecision(
        'PASS',
        `Income: skips ${card.companyName} (income=${cardIncome} < best visible=${maxVisibleIncome})`,
        round,
      );
      return 0;
    }

    // Current portfolio income — only upgrade if this card beats average or is first slot
    const currentIncome = (myPlayer.assets ?? []).reduce((s, a) => s + (a.income ?? 0), 0);
    const slots         = (myPlayer.assets ?? []).length;

    if (slots > 0 && cardIncome === 0) {
      this.logDecision('PASS', `Income: skips zero-income ${card.companyName}`, round);
      return 0;
    }

    const bidAmount = Math.min(card.baseValue + 2, myPlayer.cash);

    this.logDecision(
      'BID',
      `Income: bids ${bidAmount} on ${card.companyName} (income=${cardIncome}, portfolio income=${currentIncome})`,
      round,
    );
    return bidAmount;
  }

  // ── choosePersonalEventAction ──────────────────────────────────────────────

  choosePersonalEventAction(card, myPlayer, state) {
    const round = state.round ?? 0;

    // Play everything immediately — doesn't understand holding value
    if (card.playTiming === 'HOLD') {
      this.logDecision(
        'PLAY',
        `Income: plays HOLD card ${card.eventName} immediately (doesn't strategise holds)`,
        round,
      );
      return 'PLAY';
    }

    this.logDecision('PLAY', `Income: plays ${card.eventName}`, round);
    return 'PLAY';
  }

  // ── chooseSwapSale ─────────────────────────────────────────────────────────

  chooseSwapSale(myPlayer, state) {
    const round  = state.round ?? 0;
    const assets = myPlayer.assets ?? [];

    if (assets.length < 3) return null;

    // Identify the weakest asset by income
    const worstAsset = assets.slice().sort(
      (a, b) => (a.income ?? 0) - (b.income ?? 0),
    )[0];

    // Look for a visible card that beats it on income
    const upgradeCard = (state.marketCards ?? []).find(
      c => c && c.cardType === 'ASSET' && (c.income ?? 0) > (worstAsset.income ?? 0),
    );
    if (!upgradeCard) return null;

    // No swap needed if we can already afford it
    if ((myPlayer.cash ?? 0) >= upgradeCard.baseValue) return null;

    const saleValue = worstAsset.currentValue ?? worstAsset.baseValue;

    // Confirm the swap makes it affordable
    if ((myPlayer.cash ?? 0) + saleValue < upgradeCard.baseValue) {
      this.logDecision(
        'PASS',
        `Income: swap of ${worstAsset.companyName} not enough for ${upgradeCard.companyName}`,
        round,
      );
      return null;
    }

    this.logDecision(
      'SWAP_SELL',
      `Income: sells ${worstAsset.companyName} (income=${worstAsset.income ?? 0}) to upgrade to ${upgradeCard.companyName} (income=${upgradeCard.income ?? 0})`,
      round,
    );
    return worstAsset.companyName;
  }

  // ── chooseSellAsset ────────────────────────────────────────────────────────

  chooseSellAsset(myPlayer, state) {
    // Never sells — high income means high attachment to assets
    this.logDecision('HOLD_ALL', 'Income: never voluntarily sells assets', state.round ?? 0);
    return null;
  }

  // ── chooseLoanDraw ─────────────────────────────────────────────────────────

  chooseLoanDraw(myPlayer, state) {
    // Rarely draws loans — doesn't understand the tax offset mechanic.
    // Will draw a single loan token only if cash is critically low (< 3).
    const round = state.round ?? 0;

    if ((myPlayer.cash ?? 0) >= 3) {
      this.logDecision(
        'NO_LOAN',
        `Income: sufficient cash (${myPlayer.cash}), skips loan draw`,
        round,
      );
      return 0;
    }

    // Emergency single-token draw
    this.logDecision(
      'DRAW_LOAN',
      `Income: emergency loan draw (cash=${myPlayer.cash} < 3)`,
      round,
    );
    return 1;
  }
}
