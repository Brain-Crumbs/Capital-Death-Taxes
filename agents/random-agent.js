/**
 * RandomAgent  (chaos baseline)
 *
 * All decisions are uniformly random within the legal move set.
 * Used to establish a chaos baseline for simulation benchmarking.
 *
 * Accepts a seeded rng function in config for deterministic test runs:
 *   new RandomAgent('p1', { rng: mySeededRng })
 * Otherwise falls back to Math.random.
 */

import { BaseAgent }          from './base-agent.js';
import { computeLoanCapacity } from '../engine/loans.js';

export class RandomAgent extends BaseAgent {
  constructor(playerId, config = {}) {
    super(playerId, config);
    this.agentType = 'random';
    // Allow injecting a seeded RNG for reproducibility
    this._rng = config.rng ?? (() => Math.random());
  }

  /** Returns a float in [0, 1). */
  _rand() {
    return this._rng();
  }

  /** Randomly picks one element from an array; returns undefined if empty. */
  _pick(arr) {
    if (!arr.length) return undefined;
    return arr[Math.floor(this._rand() * arr.length)];
  }

  // ── bidOnAsset ─────────────────────────────────────────────────────────────

  bidOnAsset(card, myPlayer, state) {
    const round = state.round ?? 0;

    // 50 % chance to pass on any card outright
    if (this._rand() < 0.5) {
      this.logDecision('PASS', `Random: random pass on ${card.companyName ?? card.ceoName}`, round);
      return 0;
    }

    // Build the range of legal bids: [baseValue, min(baseValue + 5, cash)]
    // CEO cards have no baseValue requirement — treat floor as 0
    const minBid = card.baseValue ?? 0;
    const maxBid = Math.min(minBid + 5, myPlayer.cash ?? 0);

    // Can't afford minimum
    if (maxBid < minBid) {
      this.logDecision(
        'PASS',
        `Random: can't afford ${card.companyName ?? card.ceoName} (need ${minBid}, have ${myPlayer.cash})`,
        round,
      );
      return 0;
    }

    // Portfolio cap (not a random choice — it's a hard rule)
    if (card.cardType === 'ASSET' && (myPlayer.assets ?? []).length >= 3) {
      this.logDecision('PASS', 'Random: portfolio full', round);
      return 0;
    }

    // T3 hard gate
    if (card.tier === 3 && (myPlayer.ceo?.maxAssetTier ?? 2) < 3) {
      this.logDecision('PASS', `Random: no T3 access for ${card.companyName}`, round);
      return 0;
    }

    // Random bid in [minBid, maxBid]
    const span      = maxBid - minBid;
    const bidAmount = minBid + Math.floor(this._rand() * (span + 1));

    this.logDecision(
      'BID',
      `Random: bids ${bidAmount} on ${card.companyName ?? card.ceoName} (range ${minBid}–${maxBid})`,
      round,
    );
    return bidAmount;
  }

  // ── choosePersonalEventAction ──────────────────────────────────────────────

  choosePersonalEventAction(card, myPlayer, state) {
    const round = state.round ?? 0;

    if (card.playTiming === 'HOLD') {
      // Random choice among HOLD, SELL, PLAY
      const choice = this._pick(['HOLD', 'SELL', 'PLAY']);
      this.logDecision(choice, `Random: random action ${choice} for ${card.eventName}`, round);
      return choice;
    }

    // IMMEDIATE cards: play or sell
    const choice = this._pick(['PLAY', 'SELL']);
    this.logDecision(choice, `Random: random action ${choice} for ${card.eventName}`, round);
    return choice;
  }

  // ── chooseSellAsset ────────────────────────────────────────────────────────

  chooseSellAsset(myPlayer, state) {
    const round  = state.round ?? 0;
    const assets = myPlayer.assets ?? [];

    if (assets.length === 0) return null;

    // 50 % chance to sell something
    if (this._rand() < 0.5) {
      this.logDecision('HOLD_ALL', 'Random: random hold', round);
      return null;
    }

    const chosen = this._pick(assets);
    if (!chosen) return null;

    this.logDecision('SELL', `Random: randomly sells ${chosen.companyName}`, round);
    return chosen.companyName;
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
      this.logDecision('NO_LOAN', 'Random: no loan capacity available', round);
      return 0;
    }

    // Draw a random integer in [0, available]
    const draw = Math.floor(this._rand() * (available + 1));

    this.logDecision(
      draw === 0 ? 'NO_LOAN' : 'DRAW_LOAN',
      `Random: randomly draws ${draw} of ${available} available loan(s)`,
      round,
    );
    return draw;
  }
}
