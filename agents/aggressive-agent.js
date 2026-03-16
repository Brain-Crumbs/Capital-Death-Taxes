/**
 * AggressiveAgent
 *
 * Strategy:
 *   - Bids on Tier 3 cards as soon as eligible (maxAssetTier === 3)
 *   - Always draws loans to maximum capacity
 *   - Accepts stress up to (deathRollThreshold - 1) before backing off T3 bids
 *   - Sells an asset only if a collateral violation is imminent
 *   - Bids up to baseValue + 5
 */

import { BaseAgent }          from './base-agent.js';
import { computeLoanCapacity } from '../engine/loans.js';

const MAX_OVERBID = 5;

export class AggressiveAgent extends BaseAgent {
  constructor(playerId, config = {}) {
    super(playerId, config);
    this.agentType = 'aggressive';
  }

  // ── bidOnAsset ─────────────────────────────────────────────────────────────

  bidOnAsset(card, myPlayer, state) {
    const round = state.round ?? 0;

    // CEO auction: bid aggressively on any CEO — pay up to 5 cash
    if (card.cardType === 'CEO') {
      if ((myPlayer.cash ?? 0) < 1) {
        this.logDecision('PASS', 'Aggressive: no cash for CEO', round);
        return 0;
      }
      const bid = Math.min(5, myPlayer.cash);
      this.logDecision('BID', `Aggressive: bids ${bid} for CEO ${card.ceoName}`, round);
      return bid;
    }

    if (card.cardType !== 'ASSET') {
      return 0;
    }

    // Portfolio cap
    if ((myPlayer.assets ?? []).length >= 3) {
      this.logDecision('PASS', 'Aggressive: portfolio full', round);
      return 0;
    }

    const deathThreshold = myPlayer.ceo?.deathRollThreshold ?? 6;
    const stressLimit    = deathThreshold - 1;

    // Skip T3 if already at stress limit
    if (card.tier === 3 && myPlayer.stress >= stressLimit) {
      this.logDecision(
        'PASS',
        `Aggressive: skips T3 ${card.companyName} — stress ${myPlayer.stress} at limit ${stressLimit}`,
        round,
      );
      return 0;
    }

    // Must have T3 access to bid on T3
    if (card.tier === 3 && (myPlayer.ceo?.maxAssetTier ?? 2) < 3) {
      this.logDecision(
        'PASS',
        `Aggressive: no T3 access for ${card.companyName}`,
        round,
      );
      return 0;
    }

    // Must be able to afford minimum bid
    if ((myPlayer.cash ?? 0) < card.baseValue) {
      this.logDecision(
        'PASS',
        `Aggressive: can't afford ${card.companyName} (need ${card.baseValue}, have ${myPlayer.cash})`,
        round,
      );
      return 0;
    }

    const bidAmount = Math.min(card.baseValue + MAX_OVERBID, myPlayer.cash);

    this.logDecision(
      'BID',
      `Aggressive: bids ${bidAmount} on ${card.companyName} (T${card.tier}, stress=${myPlayer.stress}/${stressLimit})`,
      round,
    );
    return bidAmount;
  }

  // ── choosePersonalEventAction ──────────────────────────────────────────────

  choosePersonalEventAction(card, myPlayer, state) {
    const round = state.round ?? 0;

    if (card.playTiming === 'HOLD') {
      // Keep HOLD cards — they're leverage for later
      this.logDecision('HOLD', `Aggressive: holds ${card.eventName} for future use`, round);
      return 'HOLD';
    }

    this.logDecision('PLAY', `Aggressive: plays ${card.eventName}`, round);
    return 'PLAY';
  }

  // ── chooseSellAsset ────────────────────────────────────────────────────────

  chooseSellAsset(myPlayer, state) {
    const round = state.round ?? 0;

    // Compute current total loans and capacity
    const assets        = myPlayer.assets ?? [];
    const totalCapacity = assets.reduce(
      (sum, a) => sum + computeLoanCapacity(a, assets),
      0,
    );
    const totalLoans = myPlayer.loans ?? 0;

    // Sell only if already in (or one token from) collateral violation
    if (totalLoans <= totalCapacity) {
      this.logDecision(
        'HOLD_ALL',
        `Aggressive: no violation (loans=${totalLoans}, capacity=${totalCapacity})`,
        round,
      );
      return null;
    }

    // Sell the lowest-value asset to free up the most stress relief at cheapest loss
    const toSell = assets
      .slice()
      .sort((a, b) => (a.currentValue ?? a.baseValue) - (b.currentValue ?? b.baseValue))[0];

    if (!toSell) return null;

    this.logDecision(
      'SELL',
      `Aggressive: forced sell ${toSell.companyName} to cure collateral violation (loans=${totalLoans} > capacity=${totalCapacity})`,
      round,
    );
    return toSell.companyName;
  }

  // ── chooseLoanDraw ─────────────────────────────────────────────────────────

  chooseLoanDraw(myPlayer, state) {
    const round  = state.round ?? 0;
    const assets = myPlayer.assets ?? [];

    const totalCapacity = assets.reduce(
      (sum, a) => sum + computeLoanCapacity(a, assets),
      0,
    );
    const available = Math.max(0, totalCapacity - (myPlayer.loans ?? 0));

    if (available === 0) {
      this.logDecision('NO_LOAN', 'Aggressive: already at max loan capacity', round);
      return 0;
    }

    this.logDecision(
      'DRAW_LOAN',
      `Aggressive: draws ${available} loan(s) to max capacity (capacity=${totalCapacity})`,
      round,
    );
    return available;
  }
}
