/**
 * TechStackAgent
 *
 * Strategy:
 *   - Only bids on Technology cards
 *   - Prioritises completing UPSTREAM → MIDSTREAM → DOWNSTREAM vertical stack
 *   - Bids up to baseValue + 3 for a card that fills a missing integration slot
 *   - Holds HOLD personal event cards (never sells for $1)
 *   - Draws loans only after an integration bonus has unlocked additional capacity
 */

import { BaseAgent }          from './base-agent.js';
import { computeLoanCapacity } from '../engine/loans.js';

const PLACEMENTS_IN_ORDER = ['UPSTREAM', 'MIDSTREAM', 'DOWNSTREAM'];
const MAX_OVERBID_NEEDED  = 3;   // integration piece
const MAX_OVERBID_FILL    = 1;   // useful but not a priority piece

export class TechStackAgent extends BaseAgent {
  constructor(playerId, config = {}) {
    super(playerId, config);
    this.agentType = 'tech-stack';
  }

  // ── Internal helpers ───────────────────────────────────────────────────────

  /** Returns the set of placement slots already covered by player's tech assets. */
  _ownedTechPlacements(myPlayer) {
    return new Set(
      (myPlayer.assets ?? [])
        .filter(a => a.industry === 'TECHNOLOGY')
        .map(a => a.placement),
    );
  }

  /**
   * Returns the next most-needed placement slot for vertical integration.
   * Priority: UPSTREAM first, then MIDSTREAM, then DOWNSTREAM.
   * Returns null if all three are already owned.
   */
  _nextNeededPlacement(myPlayer) {
    const owned = this._ownedTechPlacements(myPlayer);
    return PLACEMENTS_IN_ORDER.find(p => !owned.has(p)) ?? null;
  }

  /**
   * Computes the total loan capacity the player would have after owning
   * all current assets plus a hypothetical new one.
   */
  _capacityWithAsset(myPlayer, newAsset) {
    const allAssets = [...(myPlayer.assets ?? []), newAsset];
    return allAssets.reduce((sum, a) => sum + computeLoanCapacity(a, allAssets), 0);
  }

  // ── bidOnAsset ─────────────────────────────────────────────────────────────

  bidOnAsset(card, myPlayer, state) {
    const round = state.round ?? 0;

    // Pass on CEO cards
    if (card.cardType === 'CEO') {
      this.logDecision('PASS', 'TechStack: ignores CEO auction', round);
      return 0;
    }

    if (card.cardType !== 'ASSET') return 0;

    // Only interested in TECHNOLOGY
    if (card.industry !== 'TECHNOLOGY') {
      this.logDecision(
        'PASS',
        `TechStack: skips non-tech ${card.companyName} (${card.industry})`,
        round,
      );
      return 0;
    }

    // Portfolio cap
    if ((myPlayer.assets ?? []).length >= 3) {
      this.logDecision('PASS', 'TechStack: portfolio full', round);
      return 0;
    }

    // Must have T3 access for T3 cards
    if (card.tier === 3 && (myPlayer.ceo?.maxAssetTier ?? 2) < 3) {
      this.logDecision('PASS', `TechStack: no T3 access for ${card.companyName}`, round);
      return 0;
    }

    // Can't afford minimum bid
    if ((myPlayer.cash ?? 0) < card.baseValue) {
      this.logDecision(
        'PASS',
        `TechStack: can't afford ${card.companyName} (need ${card.baseValue}, have ${myPlayer.cash})`,
        round,
      );
      return 0;
    }

    const nextNeeded = this._nextNeededPlacement(myPlayer);
    const isNeeded   = card.placement === nextNeeded;

    // Determine overbid budget
    const overbid   = isNeeded ? MAX_OVERBID_NEEDED : MAX_OVERBID_FILL;
    const bidAmount = Math.min(card.baseValue + overbid, myPlayer.cash);

    if (isNeeded) {
      this.logDecision(
        'BID',
        `TechStack: bids ${bidAmount} for needed ${card.placement} slot ${card.companyName} (stack: ${[...this._ownedTechPlacements(myPlayer)].join(',') || 'empty'})`,
        round,
      );
    } else {
      this.logDecision(
        'BID',
        `TechStack: bids ${bidAmount} for additional tech ${card.companyName} (${card.placement})`,
        round,
      );
    }

    return bidAmount;
  }

  // ── choosePersonalEventAction ──────────────────────────────────────────────

  choosePersonalEventAction(card, myPlayer, state) {
    const round = state.round ?? 0;

    if (card.playTiming === 'HOLD') {
      // Never sell for $1 — HOLD cards are future capital
      this.logDecision('HOLD', `TechStack: holds ${card.eventName} (never sells for $1)`, round);
      return 'HOLD';
    }

    this.logDecision('PLAY', `TechStack: plays immediate ${card.eventName}`, round);
    return 'PLAY';
  }

  // ── chooseSellAsset ────────────────────────────────────────────────────────

  chooseSellAsset(myPlayer, state) {
    // Never sell tech voluntarily — the stack is the whole strategy
    this.logDecision('HOLD_ALL', 'TechStack: never sells tech assets voluntarily', state.round ?? 0);
    return null;
  }

  // ── chooseLoanDraw ─────────────────────────────────────────────────────────

  chooseLoanDraw(myPlayer, state) {
    const round  = state.round ?? 0;
    const assets = myPlayer.assets ?? [];

    // Only draw if integration bonus has unlocked new capacity above base
    const currentCapacityWithoutIntegration = assets.reduce(
      (sum, a) => sum + (a.baseLoanCapacity ?? 0),
      0,
    );
    const currentCapacityWithIntegration = assets.reduce(
      (sum, a) => sum + computeLoanCapacity(a, assets),
      0,
    );

    const integrationBonus = currentCapacityWithIntegration - currentCapacityWithoutIntegration;

    if (integrationBonus <= 0) {
      this.logDecision(
        'NO_LOAN',
        'TechStack: no integration bonus yet — draws no loans',
        round,
      );
      return 0;
    }

    // Draw into the integration-bonus capacity only
    const alreadyDrawn = myPlayer.loans ?? 0;
    const available    = Math.max(0, integrationBonus - alreadyDrawn);

    if (available <= 0) {
      this.logDecision(
        'NO_LOAN',
        `TechStack: integration bonus capacity already used (bonus=${integrationBonus})`,
        round,
      );
      return 0;
    }

    this.logDecision(
      'DRAW_LOAN',
      `TechStack: draws ${available} loan(s) against integration bonus capacity (bonus=${integrationBonus})`,
      round,
    );
    return available;
  }
}
