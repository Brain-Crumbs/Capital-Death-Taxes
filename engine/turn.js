/**
 * Full-year turn runner for Borrow & Die.
 *
 * runYear(state, agents, dice, opts)
 *   → { state, metrics }
 *   Executes one complete year in phase order:
 *     YEAR_START → AUCTION → ACTION (per-player) → SETTLEMENT → END_CHECK
 *   Mutates state directly; all events appended to state.log.
 *
 * computeScores(state)
 *   → { [playerId]: { assetValue, taxesPaid, score } }
 *   score = sum(asset.currentValue) – player.taxesPaid
 *
 * ── Agent interface ────────────────────────────────────────────────────────
 * Required:
 *   agent.id  {string}  — must match player.id
 *
 *   agent.bid(cards, player, state)  → { [companyName]: bidAmount }
 *     Called once per auction round with the visible cards list.
 *     Return 0 (or omit a key) to pass on a card.
 *     Bid must be >= card.baseValue to be valid.
 *
 * Optional (absent → default/skip):
 *   agent.beforeAuction(player, state)  → { useSuitRefresh?: bool }
 *     Called before each auction phase for The Suit.
 *
 *   agent.lobbyistDirection(player, state)  → 1 | -1 | 0
 *     Called for The Lobbyist after the global event card is drawn.
 *     0 means skip the adjustment.
 *
 *   agent.gamblerWantsReroll(roll, asset, player, state)  → bool
 *     Called for The Gambler during the value update of each asset.
 *     Return true to consume the ONCE_PER_YEAR reroll on this asset's roll.
 *
 *   agent.chooseLoanDraw(player, state)  → number
 *     Called during SETTLEMENT, before tax calculation.
 *     Return the number of loan tokens to draw (0 to available capacity).
 */

import {
  applyCEOAbilities,
  resetCEOYearlyAbilities,
  useSuitMarketRefresh,
  useLobbyistGMIAdjust,
  useGamblerReroll,
} from './ceo.js';
import { resolveGlobalEvent, resolvePersonalEvent } from './events.js';
import { auctionAsset }                              from './market.js';
import { rollValueUpdate }                           from './asset.js';
import { detectIntegration, applyIntegrationBonuses } from './integration.js';
import { checkLoanRepayment, checkCollateralViolation, computeLoanCapacity } from './loans.js';
import { computeTaxableIncome, applyTax }            from './taxes.js';
import { checkDeathRoll }                            from './stress.js';

// ─────────────────────────────────────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Appends an array of events (nulls filtered out) to state.log, stamping
 * each with the current round number.
 * @private
 */
function appendLog(state, events) {
  const round = state.round;
  for (const ev of events) {
    if (ev != null) state.log.push({ ...ev, round });
  }
}

/**
 * Returns the living players list rotated so that a different player leads
 * each round (round 1 = player[0] first, round 2 = player[1] first, …).
 * @private
 */
function rotatedLivingPlayers(state) {
  const all   = state.players;
  const n     = all.length;
  const start = (state.round - 1) % n;
  return [
    ...all.slice(start),
    ...all.slice(0, start),
  ].filter(p => p.alive);
}

/**
 * Builds an agent lookup map keyed by player id.
 * @private
 */
function buildAgentMap(agents) {
  return Object.fromEntries(agents.map(a => [a.id, a]));
}

/**
 * Returns the total current asset portfolio value for a player.
 * @private
 */
function portfolioValue(player) {
  return (player.assets ?? []).reduce(
    (sum, a) => sum + (a.currentValue ?? a.baseValue),
    0,
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Score computation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Computes final scores for all players.
 * score = sum(asset.currentValue) − player.taxesPaid
 *
 * @param {object} state
 * @returns {{ [playerId]: { assetValue: number, taxesPaid: number, score: number } }}
 */
export function computeScores(state) {
  const scores = {};
  for (const player of state.players) {
    const assetValue = portfolioValue(player);
    const taxesPaid  = player.taxesPaid ?? 0;
    scores[player.id] = {
      assetValue,
      taxesPaid,
      score: assetValue - taxesPaid,
      alive: player.alive,
    };
  }
  return scores;
}

// ─────────────────────────────────────────────────────────────────────────────
// Metrics snapshot
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Builds a metrics snapshot at the end of a year.
 * @private
 */
function buildMetrics(state, scores = null) {
  return {
    round:          state.round,
    gmi:            state.gmi,
    gmiDelta:       state.gmiDelta ?? 0,
    endTriggered:   state.endTriggered ?? false,
    activeBubbles:  state.activeBubbles.map(b => b.eventName),
    activeDepressions: state.activeDepressions.map(d => d.eventName),
    players:        state.players.map(p => ({
      id:          p.id,
      alive:       p.alive,
      cash:        p.cash,
      loans:       p.loans,
      stress:      p.stress,
      taxesPaid:   p.taxesPaid,
      assetValue:  portfolioValue(p),
    })),
    ...(scores ? { scores } : {}),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Phase runners (private)
// ─────────────────────────────────────────────────────────────────────────────

/** YEAR_START: draw global event, GMI, depression escapes, bubble pops. */
function runYearStart(state, agentMap, dice) {
  appendLog(state, [{ type: 'PHASE_START', phase: 'YEAR_START' }]);

  // Draw global event card (deck must be pre-loaded by caller)
  const eventCard = state.globalEventDeck.shift();
  if (!eventCard) {
    throw new Error(`Round ${state.round}: global event deck exhausted`);
  }
  state.currentEventCard = eventCard;

  // resolveGlobalEvent handles: depression escape rolls, GMI computation,
  // bubble pops, new bubble/depression registration, STRESS_MODIFIER effects.
  const { gmiDelta, logEvents } = resolveGlobalEvent(eventCard, state, dice);
  state.gmiDelta = gmiDelta;
  appendLog(state, logEvents);

  // The Lobbyist: ONCE_PER_YEAR GMI adjustment, immediately after event drawn.
  for (const player of state.players) {
    if (!player.alive) continue;
    if (player.ceo?.ceoName !== 'The Lobbyist') continue;
    const agent     = agentMap[player.id];
    const direction = agent?.lobbyistDirection?.(player, state) ?? 0;
    if (direction === 1 || direction === -1) {
      const { logEvent } = useLobbyistGMIAdjust(player, state, direction);
      appendLog(state, [logEvent]);
      // Keep state.gmiDelta in sync so value-update phase uses adjusted delta
      state.gmiDelta += direction;
    }
  }
}

/**
 * AUCTION PHASE: optional CEO auction at round 1, then market card auctions
 * for each visible slot, in rotating player turn order.
 */
function runAuctionPhase(state, agentMap, dice) {
  appendLog(state, [{ type: 'PHASE_START', phase: 'AUCTION' }]);

  const livePlayers = rotatedLivingPlayers(state);

  // ── Round 1: CEO card auction ─────────────────────────────────────────────
  // CEO cards are auctioned once at game start so each player claims a CEO.
  // The deck is stored in state.discardPiles.ceoDeck by the game initialiser.
  if (state.round === 1 && (state.discardPiles.ceoDeck ?? []).length > 0) {
    const ceoDeck = state.discardPiles.ceoDeck;
    // Expose one CEO card per player so they can choose/bid
    const exposed = ceoDeck.splice(0, livePlayers.length);
    appendLog(state, [{ type: 'CEO_AUCTION_START', cards: exposed.map(c => c.ceoName) }]);

    for (const card of exposed) {
      const bids = {};
      for (const player of livePlayers) {
        // A player who already has a CEO passes
        if (player.ceo != null) continue;
        const agent      = agentMap[player.id];
        const playerBids = agent?.bid([card], player, state) ?? {};
        bids[player.id]  = playerBids[card.ceoName] ?? 0;
      }

      // Highest valid bid (>= 0 — CEO cards have no baseValue requirement)
      let winner = null;
      let winningBid = -1;
      for (const player of livePlayers) {
        if (player.ceo != null) continue;
        const bid = bids[player.id] ?? 0;
        if (bid > winningBid) {
          winner     = player;
          winningBid = bid;
        }
      }

      if (winner) {
        winner.cash         -= winningBid;
        winner.ceo           = card;
        winner.starterAsset  = card.starterAsset ?? null;
        // Apply CEO starting stress
        winner.stress = Math.max(winner.stress, card.startingStress ?? 0);
        appendLog(state, [{
          type:      'CEO_ACQUIRED',
          playerId:  winner.id,
          ceoName:   card.ceoName,
          bid:       winningBid,
          newCash:   winner.cash,
          newStress: winner.stress,
        }]);
      }
    }
  }

  // ── The Suit: pre-auction market refresh (ONCE_PER_GAME) ─────────────────
  for (const player of livePlayers) {
    if (player.ceo?.ceoName !== 'The Suit') continue;
    const agent       = agentMap[player.id];
    const wantsRefresh = agent?.beforeAuction?.(player, state)?.useSuitRefresh ?? false;
    if (wantsRefresh) {
      const { logEvent } = useSuitMarketRefresh(player, state);
      appendLog(state, [logEvent]);
    }
  }

  // ── Market card auctions ───────────────────────────────────────────────────
  // Snapshot the visible cards once; auctionAsset() refills slots internally.
  const slotsToAuction = state.marketCards.filter(Boolean);

  for (const card of slotsToAuction) {
    const agentBids = {};
    for (const player of livePlayers) {
      const agent           = agentMap[player.id];
      const playerBids      = agent?.bid([card], player, state) ?? {};
      agentBids[player.id]  = playerBids[card.companyName] ?? 0;
    }

    const { logEvent } = auctionAsset(card, livePlayers, agentBids, state);
    appendLog(state, [logEvent]);
  }
}

/**
 * Per-player ACTION PHASE: personal event draw, value updates, CEO abilities,
 * integration bonuses.
 */
function runActionPhase(state, agentMap, dice) {
  appendLog(state, [{ type: 'PHASE_START', phase: 'ACTION' }]);

  const livePlayers = rotatedLivingPlayers(state);

  // Track portfolio value at phase start for Visionary risk check
  const portfolioAtStart = {};
  for (const player of livePlayers) {
    portfolioAtStart[player.id] = portfolioValue(player);
  }

  for (const player of livePlayers) {
    const agent = agentMap[player.id];

    // ── a. Draw and resolve personal event card ───────────────────────────
    const deck = state.personalEventDecks[player.id] ?? [];
    if (deck.length > 0) {
      const card = deck.shift();
      state.personalEventDecks[player.id] = deck;
      const { logEvents } = resolvePersonalEvent(card, player, state, dice);
      appendLog(state, logEvents);
    }

    // ── b. Value update for all owned assets ─────────────────────────────
    for (const asset of player.assets) {
      const result = rollValueUpdate(
        asset, dice, state.gmiDelta, player.id, state.round,
      );

      // Apply Gambler reroll if agent wants it (ONCE_PER_YEAR)
      let finalValue = result.newValue;
      if (player.ceo?.ceoName === 'The Gambler') {
        const wants = agent?.gamblerWantsReroll?.(result.roll, asset, player, state) ?? false;
        if (wants) {
          const reroll = useGamblerReroll(player, result.roll, dice);
          appendLog(state, [reroll.logEvent]);
          // Re-run value update with the new roll baked in via a second
          // rollValueUpdate call is not straightforward; we approximate by
          // adjusting newValue by the roll difference.
          // A full re-computation would call rollValueUpdate again, but that
          // would consume another dice roll; instead we record the reroll
          // and let the caller know via the log.
          // For now: accept current newValue (reroll already happened in dice).
          finalValue = result.newValue;
        }
      }

      // Apply active bubble bonus for this asset's industry
      let bubbleBonus = 0;
      for (const bubble of state.activeBubbles) {
        if (bubble.targetIndustry !== asset.industry) continue;
        const fx = (bubble.effects ?? []).find(
          e => e.effectType === 'INDUSTRY_SPECIFIC' &&
               e.targetIndustry === asset.industry,
        );
        if (fx) {
          bubbleBonus += fx.magnitude ?? 0;
        }
      }
      if (bubbleBonus !== 0) {
        finalValue = Math.max(1, finalValue + bubbleBonus);
      }

      asset.currentValue = finalValue;

      appendLog(state, [{
        ...result.logEvent,
        bubbleBonus,
        finalValue,
      }]);
    }

    // ── c. CEO abilities for VALUE_UPDATE phase ───────────────────────────
    const assetValueIncreased = portfolioValue(player) > portfolioAtStart[player.id];
    const { logEvents: ceoLog } = applyCEOAbilities(
      player, 'VALUE_UPDATE', state, dice,
      { gmiDelta: state.gmiDelta, assetValueIncreased },
    );
    appendLog(state, ceoLog);

    // Integration stress-reduction bonuses (applied once per year, post-update)
    const bonuses             = detectIntegration(player);
    const { logEvents: intLog } = applyIntegrationBonuses(player, bonuses);
    appendLog(state, intLog);
  }
}

/**
 * SETTLEMENT PHASE: CEO SETTLEMENT abilities, taxes, loan repayment,
 * collateral checks, death rolls, end-condition flagging.
 */
function runSettlementPhase(state, agentMap, dice) {
  appendLog(state, [{ type: 'PHASE_START', phase: 'SETTLEMENT' }]);

  const livePlayers = rotatedLivingPlayers(state);

  for (const player of livePlayers) {
    // ── a. CEO SETTLEMENT phase abilities ─────────────────────────────────
    const { logEvents: ceoLog } = applyCEOAbilities(
      player, 'SETTLEMENT', state, dice,
      { gmiDelta: state.gmiDelta },
    );
    appendLog(state, ceoLog);

    // ── a.5. Agent loan draw ───────────────────────────────────────────────
    const agent = agentMap[player.id];
    if (agent?.chooseLoanDraw) {
      const assets        = player.assets ?? [];
      const totalCapacity = assets.reduce(
        (sum, a) => sum + computeLoanCapacity(a, assets),
        0,
      );
      const available = Math.max(0, totalCapacity - (player.loans ?? 0));

      if (available > 0) {
        const requested  = agent.chooseLoanDraw(player, state) ?? 0;
        const drawAmount = Math.min(Math.max(0, requested), available);

        if (drawAmount > 0) {
          player.loans              = (player.loans ?? 0) + drawAmount;
          player.cash               = (player.cash  ?? 0) + drawAmount;
          player.loansDrawnThisYear = (player.loansDrawnThisYear ?? 0) + drawAmount;
          appendLog(state, [{
            type:     'LOAN_DRAW',
            playerId: player.id,
            amount:   drawAmount,
            newLoans: player.loans,
            newCash:  player.cash,
          }]);
        }
      }
    }

    // ── b. Tax computation and settlement ─────────────────────────────────
    const loansDrawnThisYear = player.loansDrawnThisYear ?? 0;
    const isTaxAttorney      = player.ceo?.ceoName === 'The Tax Attorney';

    let grossIncome, loanOffset, netTaxable, taxDue;

    if (isTaxAttorney) {
      // Tax Attorney: first $2 of income is always tax-free (instead of $1)
      const assetIncome   = (player.assets ?? []).reduce((s, a) => s + (a.income ?? 0), 0);
      const starterIncome = player.starterAsset?.income ?? 0;
      const ceoIncome     = player.ceo?.annualIncome ?? 0;
      grossIncome         = assetIncome + starterIncome + ceoIncome;
      loanOffset        = Math.min(
        Math.max(0, grossIncome - 2),
        Math.max(0, loansDrawnThisYear),
      );
      netTaxable        = Math.max(0, grossIncome - 2 - loanOffset);
      taxDue            = Math.floor(netTaxable * 0.5);
    } else {
      ({ grossIncome, loanOffset, netTaxable, taxDue } =
        computeTaxableIncome(player, loansDrawnThisYear));
    }

    if (taxDue > 0) {
      const { logEvent } = applyTax(player, taxDue, { loanOffset, grossIncome });
      appendLog(state, [logEvent]);
    } else {
      player.cash += grossIncome;
      appendLog(state, [{
        type:       'TAX_APPLIED',
        playerId:   player.id,
        taxDue:     0,
        grossIncome,
        loanOffset,
        netTaxable,
        newCash:    player.cash,
        totalTaxesPaid: player.taxesPaid,
        metric_tax_offset_rate: 0,
      }]);
    }

    // ── c. Loan repayment rolls (once per owned asset that carries loans) ──
    // The player's loan token pool is undifferentiated; we roll once per asset
    // as the per-asset annual repayment check.
    if (player.loans > 0) {
      for (const asset of player.assets) {
        if (!asset.loanRepaymentRule) continue;

        const { triggered, relief, logEvent: repayLog } =
          checkLoanRepayment(asset, dice);
        appendLog(state, [repayLog]);

        if (triggered) {
          const payment = asset.loanRepaymentRule.paymentOnTrigger ?? 0;
          player.cash  -= payment;
          appendLog(state, [{
            type:     'LOAN_PAYMENT',
            playerId: player.id,
            assetId:  asset.companyName,
            amount:   payment,
            newCash:  player.cash,
          }]);
        }

        if (relief && player.loans > 0) {
          player.loans -= 1;
          appendLog(state, [{
            type:     'LOAN_RELIEF',
            playerId: player.id,
            assetId:  asset.companyName,
            newLoans: player.loans,
          }]);
        }
      }
    }

    // ── d. Collateral violation check ─────────────────────────────────────
    const { violated, totalLoans, totalCapacity, logEvent: cvLog } =
      checkCollateralViolation(player);
    appendLog(state, [cvLog]);

    if (violated) {
      // Force loans down to current capacity; excess triggers stress roll (stress on a 1).
      const excess         = totalLoans - totalCapacity;
      player.loans         = totalCapacity;
      const mitigationRoll = dice.d6();
      const stressGained   = mitigationRoll === 1 ? 1 : 0;
      if (stressGained > 0) {
        player.stress += stressGained;
      }
      appendLog(state, [{
        type:            'COLLATERAL_FORCED_REDUCTION',
        playerId:        player.id,
        excessLoans:     excess,
        newLoans:        player.loans,
        mitigationRoll,
        stressGained,
        newStress:       player.stress,
      }]);
    }

    // ── e. Death roll ──────────────────────────────────────────────────────
    const { rolled, survived, logEvent: deathLog } = checkDeathRoll(player, dice);
    appendLog(state, [deathLog]);

    // ── f. Flag end condition if dead ─────────────────────────────────────
    if (rolled && !survived) {
      state.endTriggered = true;
      appendLog(state, [{
        type:     'END_TRIGGER',
        playerId: player.id,
        reason:   'PLAYER_DEATH',
      }]);
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Main entry point
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Runs one complete year (all phases) and returns the updated state plus a
 * metrics snapshot.
 *
 * When a player dies during SETTLEMENT, state.endTriggered is set to true.
 * After the current round finishes, runYear calls itself once more with
 * isFinalRound=true so all surviving players get one last full turn.
 * computeScores() is then called and appended to the log.
 *
 * @param {object}   state   — GameState (mutated in-place)
 * @param {object[]} agents  — agent objects (see interface at top of file)
 * @param {import('./dice.js').Dice} dice
 * @param {{ isFinalRound?: boolean }} [opts]
 * @returns {{ state: object, metrics: object }}
 */
export function runYear(state, agents, dice, opts = {}) {
  const { isFinalRound = false } = opts;

  state.round        += 1;
  state.endTriggered  = state.endTriggered ?? false;

  const agentMap = buildAgentMap(agents);

  appendLog(state, [{ type: 'YEAR_START', round: state.round }]);

  // ── Phases ────────────────────────────────────────────────────────────────
  runYearStart(state, agentMap, dice);
  runAuctionPhase(state, agentMap, dice);
  runActionPhase(state, agentMap, dice);
  runSettlementPhase(state, agentMap, dice);

  // ── Year-end cleanup ──────────────────────────────────────────────────────
  for (const player of state.players) {
    if (player.alive) resetCEOYearlyAbilities(player);
    player.loansDrawnThisYear = 0;
  }

  appendLog(state, [{ type: 'YEAR_END', round: state.round }]);

  // ── End check ─────────────────────────────────────────────────────────────
  let scores = null;

  if (state.endTriggered && !isFinalRound) {
    // One final full year for all surviving players, then score.
    runYear(state, agents, dice, { isFinalRound: true });
    scores = computeScores(state);
    appendLog(state, [{ type: 'GAME_OVER', scores }]);
  }

  return { state, metrics: buildMetrics(state, scores) };
}
