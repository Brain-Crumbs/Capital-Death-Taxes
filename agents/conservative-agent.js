/**
 * ConservativeAgent
 *
 * Strategy:
 *   - Only bids on Real Estate and Manufacturing assets
 *   - Never bids on Tier 3 cards if current stress >= 4
 *   - Draws loans only to offset taxable income (tax minimisation)
 *   - Sells HOLD personal event cards if cash < 2
 *   - Never bids more than baseValue + 2
 */

import { BaseAgent }          from './base-agent.js';
import { computeLoanCapacity } from '../engine/loans.js';

const PREFERRED_INDUSTRIES = new Set(['REAL_ESTATE', 'MANUFACTURING']);
const MAX_OVERBID           = 2;   // never bid above baseValue + this
const STRESS_T3_BLOCK       = 4;   // skip T3 if stress is at or above this
const CASH_SELL_THRESHOLD   = 2;   // sell HOLD cards when cash is below this

export class ConservativeAgent extends BaseAgent {
  constructor(playerId, config = {}) {
    super(playerId, config);
    this.agentType = 'conservative';
  }

  // ── bidOnAsset ─────────────────────────────────────────────────────────────

  bidOnAsset(card, myPlayer, state) {
    const round = state.round ?? 0;

    // CEO cards: pass (let other agents fight for them)
    if (card.cardType === 'CEO') {
      this.logDecision('PASS', 'Conservative: ignores CEO auction', round);
      return 0;
    }

    // Only bid on asset cards
    if (card.cardType !== 'ASSET') {
      this.logDecision('PASS', `Conservative: unknown card type ${card.cardType}`, round);
      return 0;
    }

    // Already at max portfolio size
    if ((myPlayer.assets ?? []).length >= 3) {
      this.logDecision('PASS', 'Conservative: portfolio full (3 assets)', round);
      return 0;
    }

    // Industry filter: only RE and Manufacturing
    if (!PREFERRED_INDUSTRIES.has(card.industry)) {
      this.logDecision(
        'PASS',
        `Conservative: skips ${card.industry} (only RE/Manufacturing)`,
        round,
      );
      return 0;
    }

    // Tier 3 block: skip if stress is already high
    if (card.tier === 3 && myPlayer.stress >= STRESS_T3_BLOCK) {
      this.logDecision(
        'PASS',
        `Conservative: skips T3 ${card.companyName} — stress ${myPlayer.stress} >= ${STRESS_T3_BLOCK}`,
        round,
      );
      return 0;
    }

    // Must be able to afford the minimum valid bid
    if ((myPlayer.cash ?? 0) < card.baseValue) {
      this.logDecision(
        'PASS',
        `Conservative: can't afford ${card.companyName} (need ${card.baseValue}, have ${myPlayer.cash})`,
        round,
      );
      return 0;
    }

    // Bid = baseValue + 2, capped by available cash
    const bidAmount = Math.min(card.baseValue + MAX_OVERBID, myPlayer.cash);

    this.logDecision(
      'BID',
      `Conservative: bids ${bidAmount} on ${card.companyName} (T${card.tier} ${card.industry})`,
      round,
    );
    return bidAmount;
  }

  // ── choosePersonalEventAction ──────────────────────────────────────────────

  choosePersonalEventAction(card, myPlayer, state) {
    const round = state.round ?? 0;

    if (card.playTiming === 'HOLD') {
      if ((myPlayer.cash ?? 0) < CASH_SELL_THRESHOLD) {
        this.logDecision(
          'SELL',
          `Conservative: sells HOLD card for cash (cash=${myPlayer.cash} < ${CASH_SELL_THRESHOLD})`,
          round,
        );
        return 'SELL';
      }
      this.logDecision('HOLD', `Conservative: holds ${card.eventName}`, round);
      return 'HOLD';
    }

    this.logDecision('PLAY', `Conservative: plays immediate event ${card.eventName}`, round);
    return 'PLAY';
  }

  // ── chooseSellAsset ────────────────────────────────────────────────────────

  chooseSellAsset(myPlayer, state) {
    // Conservative never sells voluntarily
    this.logDecision('HOLD_ALL', 'Conservative: never voluntarily sells assets', state.round ?? 0);
    return null;
  }

  // ── chooseLoanDraw ─────────────────────────────────────────────────────────

  chooseLoanDraw(myPlayer, state) {
    const round = state.round ?? 0;

    // Compute gross income
    const assetIncome = (myPlayer.assets ?? []).reduce((s, a) => s + (a.income ?? 0), 0);
    const ceoIncome   = myPlayer.ceo?.annualIncome ?? 0;
    const grossIncome = assetIncome + ceoIncome;

    // First $1 is always tax-free; draw only enough to wipe out the rest
    const neededOffset  = Math.max(0, grossIncome - 1);
    const alreadyDrawn  = myPlayer.loansDrawnThisYear ?? 0;
    const stillNeeded   = Math.max(0, neededOffset - alreadyDrawn);

    if (stillNeeded === 0) {
      this.logDecision(
        'NO_LOAN',
        `Conservative: no loan needed (income=${grossIncome}, already offset=${alreadyDrawn})`,
        round,
      );
      return 0;
    }

    // Calculate available capacity
    const totalCapacity = (myPlayer.assets ?? []).reduce(
      (sum, asset) => sum + computeLoanCapacity(asset, myPlayer.assets),
      0,
    );
    const available = Math.max(0, totalCapacity - (myPlayer.loans ?? 0));
    const draw      = Math.min(stillNeeded, available);

    if (draw === 0) {
      this.logDecision(
        'NO_LOAN',
        `Conservative: wants ${stillNeeded} offset loans but capacity exhausted`,
        round,
      );
      return 0;
    }

    this.logDecision(
      'DRAW_LOAN',
      `Conservative: draws ${draw} loan(s) to offset taxable income (gross=${grossIncome})`,
      round,
    );
    return draw;
  }
}
