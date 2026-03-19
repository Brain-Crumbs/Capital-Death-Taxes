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
import { checkDeathRoll, applyBankruptcy, removeAssetStress } from './stress.js';

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
 * score = sum(asset.currentValue) + floor(cash × 0.5)
 *
 * Taxes are paid in-year as a cash drain and are not subtracted here.
 * Cash held at death is taxed 50% (rounded down) per §3 and §7.
 *
 * @param {object} state
 * @returns {{ [playerId]: { assetValue: number, cashAfterTax: number, score: number } }}
 */
export function computeScores(state) {
  const scores = {};
  for (const player of state.players) {
    const assetValue   = portfolioValue(player);
    const cashAfterTax = Math.floor((player.cash ?? 0) * 0.5);
    scores[player.id] = {
      assetValue,
      cashAfterTax,
      score: assetValue + cashAfterTax,
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
      id:         p.id,
      alive:      p.alive,
      cash:       p.cash,
      loans:      p.loans,
      stress:     p.stress,
      assetValue: portfolioValue(p),
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

  // §5: If the event card requires a market refresh, replace all 4 market cards now.
  const requiresRefresh = (eventCard.effects ?? []).some(
    e => e.effectType === 'MARKET_REFRESH',
  );
  if (requiresRefresh) {
    const deck      = state.discardPiles.marketDeck ?? [];
    const discarded = state.marketCards.filter(Boolean).map(c => c.companyName);
    state.marketCards             = deck.splice(0, 4);
    state.discardPiles.marketDeck = deck;
    appendLog(state, [{
      type:      'MARKET_REFRESH',
      source:    eventCard.eventName,
      discarded,
      newCards:  state.marketCards.map(c => c?.companyName ?? null),
    }]);
  }

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
 * PRE-AUCTION SWAP PHASE: agents with a full portfolio (3 assets) may sell
 * one asset before bidding to free a slot and raise cash for a new purchase.
 *
 * Proceeds (asset.currentValue) are credited to cash immediately and tracked
 * in player.swapProceeds.  Any portion not spent on a new asset during the
 * following auction is taxed as ordinary income at settlement.
 *
 * The sold asset is returned to the market draw pile at a random position so
 * it can resurface in a future round (with appreciation reset to baseValue).
 */
function runSwapPhase(state, agentMap) {
  for (const player of rotatedLivingPlayers(state)) {
    const agent = agentMap[player.id];
    if (!agent?.chooseSwapSale) continue;

    // Swap only makes sense when the portfolio is full (can't bid otherwise)
    if ((player.assets ?? []).length < 3) continue;

    const assetId = agent.chooseSwapSale(player, state);
    if (!assetId) continue;

    const idx = (player.assets ?? []).findIndex(a => a.companyName === assetId);
    if (idx === -1) continue;

    const asset     = player.assets[idx];
    const saleValue = asset.currentValue ?? asset.baseValue;

    // Remove from portfolio
    player.assets.splice(idx, 1);

    // Restore stress contributed by this asset
    removeAssetStress(player, asset);

    // Credit proceeds
    player.cash         = (player.cash ?? 0) + saleValue;
    player.swapProceeds = (player.swapProceeds ?? 0) + saleValue;

    // Return asset to market deck at a random position (appreciation reset)
    const returnCard = { ...asset };
    delete returnCard.currentValue;
    const deck     = state.discardPiles.marketDeck ?? [];
    const insertAt = Math.floor(Math.random() * (deck.length + 1));
    deck.splice(insertAt, 0, returnCard);
    state.discardPiles.marketDeck = deck;

    appendLog(state, [{
      type:      'ASSET_SWAP_SOLD',
      playerId:  player.id,
      assetId:   asset.companyName,
      saleValue,
      newCash:   player.cash,
      newStress: player.stress,
    }]);
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

    const { winner, winningBid, logEvent } = auctionAsset(card, livePlayers, agentBids, state);
    // Track swap proceeds spent so settlement can tax only the unspent excess
    if (winner && (winner.swapProceeds ?? 0) > 0) {
      winner.swapSpent = (winner.swapSpent ?? 0) + winningBid;
    }
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

      // Apply Gambler reroll if agent wants it (ONCE_PER_YEAR).
      // Pass the new roll back into rollValueUpdate so the outcome table is
      // re-evaluated from scratch with the replacement die (§4, CEO table).
      let finalValue = result.newValue;
      if (player.ceo?.ceoName === 'The Gambler') {
        const wants = agent?.gamblerWantsReroll?.(result.roll, asset, player, state) ?? false;
        if (wants) {
          const reroll = useGamblerReroll(player, result.roll, dice);
          if (reroll.logEvent) {
            appendLog(state, [reroll.logEvent]);
            // Re-run the full value update using the new roll.
            const rerolledResult = rollValueUpdate(
              asset, dice, state.gmiDelta, player.id, state.round,
              reroll.newRoll,
            );
            finalValue = rerolledResult.newValue;
          }
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
        finalValue = Math.max(0, finalValue + bubbleBonus);
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
    // ── a. CEO LABOR phase abilities (e.g. The Worker bonus income roll) ──
    const { logEvents: laborLog } = applyCEOAbilities(
      player, 'LABOR', state, dice,
      { gmiDelta: state.gmiDelta },
    );
    appendLog(state, laborLog);

    // ── a2. CEO SETTLEMENT phase abilities ────────────────────────────────
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

    // Any swap proceeds not spent on a new asset are taxed as ordinary income
    const swapExcess = Math.max(
      0,
      (player.swapProceeds ?? 0) - (player.swapSpent ?? 0),
    );

    let grossIncome, loanOffset, netTaxable, taxDue;

    if (isTaxAttorney) {
      // Tax Attorney: first $2 of income is always tax-free (instead of $1)
      const assetIncome   = (player.assets ?? []).reduce((s, a) => s + (a.income ?? 0), 0);
      const starterIncome = player.starterAsset?.income ?? 0;
      const ceoIncome     = player.ceo?.annualIncome ?? 0;
      grossIncome         = assetIncome + starterIncome + ceoIncome + swapExcess;
      loanOffset        = Math.min(
        Math.max(0, grossIncome - 2),
        Math.max(0, loansDrawnThisYear),
      );
      netTaxable        = Math.max(0, grossIncome - 2 - loanOffset);
      taxDue            = Math.floor(netTaxable * 0.5);
    } else {
      ({ grossIncome, loanOffset, netTaxable, taxDue } =
        computeTaxableIncome(player, loansDrawnThisYear, swapExcess));
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

    // ── c. Loan repayment rolls — §8: "for every 10 total loan units on an
    //    asset, roll one d6. An asset with 23 loans rolls twice."
    // Loans are a pool; distribute them evenly across assets (round up per
    // asset so that all loans are accounted for), then roll floor(share/10)
    // times per asset.
    if (player.loans > 0 && player.assets.length > 0) {
      const assetsWithRule = player.assets.filter(a => a.loanRepaymentRule);
      if (assetsWithRule.length > 0) {
        const sharePerAsset = Math.ceil(player.loans / assetsWithRule.length);

        for (const asset of assetsWithRule) {
          const rollCount = Math.floor(sharePerAsset / 10);
          if (rollCount === 0) continue;

          for (let r = 0; r < rollCount; r++) {
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
      }
    }

    // ── d. Collateral violation check (§8, §13) ───────────────────────────
    // Resolution order: (1) cash repayment, (2) forced sale, (3) bankruptcy.
    {
      let cv = checkCollateralViolation(player);
      appendLog(state, [cv.logEvent]);

      if (cv.violated) {
        // Step 1: repay excess with cash ($1 per excess loan unit; §8).
        let excess = cv.totalLoans - cv.totalCapacity;
        if (excess > 0 && (player.cash ?? 0) > 0) {
          const repaid   = Math.min(excess, player.cash);
          player.loans  -= repaid;
          player.cash   -= repaid;
          excess        -= repaid;
          appendLog(state, [{
            type:       'COLLATERAL_CASH_REPAYMENT',
            playerId:   player.id,
            repaid,
            newLoans:   player.loans,
            newCash:    player.cash,
          }]);
        }
        // Remaining excess after cash: shortfall stress (§12).
        if (excess > 0) {
          player.stress += excess;
          appendLog(state, [{
            type:      'STRESS_CHANGE',
            playerId:  player.id,
            delta:     excess,
            newStress: player.stress,
            reason:    'COLLATERAL_SHORTFALL',
          }]);
        }

        // Re-check after cash repayment.
        cv = checkCollateralViolation(player);
        appendLog(state, [cv.logEvent]);

        if (cv.violated) {
          // Step 2: forced sale — auction the most over-leveraged asset (§13).
          // Find the asset with the most loans relative to capacity and sell it.
          const livePlayers = rotatedLivingPlayers(state);
          const assetToSell = player.assets.reduce((worst, a) => {
            const cap  = computeLoanCapacity(a, player.assets);
            const debt = cv.totalLoans / Math.max(1, player.assets.length);
            const wCap = computeLoanCapacity(worst, player.assets);
            const wDebt = cv.totalLoans / Math.max(1, player.assets.length);
            return (debt - cap) > (wDebt - wCap) ? a : worst;
          });

          // Collect bids from all other living players (min $0).
          const forcedBids = {};
          for (const p of livePlayers) {
            if (p.id === player.id) continue;
            const agent       = agentMap[p.id];
            const bids        = agent?.bid([assetToSell], p, state) ?? {};
            forcedBids[p.id]  = bids[assetToSell.companyName] ?? 0;
          }

          // Find highest bidder (min bid $0 — any non-negative bid is valid).
          let forcedWinner = null;
          let forcedBid    = -1;
          for (const p of livePlayers) {
            if (p.id === player.id) continue;
            const b = forcedBids[p.id] ?? 0;
            if (b > forcedBid) { forcedWinner = p; forcedBid = b; }
          }

          if (forcedWinner) {
            forcedWinner.cash  -= forcedBid;
            player.cash        += forcedBid;
            forcedWinner.assets.push({ ...assetToSell, currentValue: assetToSell.currentValue ?? assetToSell.baseValue });
            const { logEvent: stressLog } = removeAssetStress(player, assetToSell);
            appendLog(state, [stressLog]);
          }

          // Remove from seller's portfolio; all loans on it are cleared.
          player.assets = player.assets.filter(a => a.companyName !== assetToSell.companyName);
          // Reduce global loan pool by the asset's proportional share.
          const loanShare = Math.min(player.loans, Math.ceil(cv.totalLoans / Math.max(1, (player.assets.length + 1))));
          player.loans    = Math.max(0, player.loans - loanShare);

          appendLog(state, [{
            type:       'FORCED_SALE',
            playerId:   player.id,
            assetId:    assetToSell.companyName,
            buyer:      forcedWinner?.id ?? 'BANK',
            salePrice:  forcedBid < 0 ? 0 : forcedBid,
            newCash:    player.cash,
            newLoans:   player.loans,
          }]);

          // Step 3: if still violated, go bankrupt (§8).
          const finalCv = checkCollateralViolation(player);
          if (finalCv.violated) {
            const { logEvent: bkLog } = applyBankruptcy(player, state.gmiDelta ?? 0);
            appendLog(state, [bkLog]);
          }
        }
      }
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
 * Per §3: all other players complete *their settlement phase for that year*
 * (already handled inside runSettlementPhase which iterates all living
 * players in order), then final scoring occurs immediately — no extra year.
 *
 * @param {object}   state   — GameState (mutated in-place)
 * @param {object[]} agents  — agent objects (see interface at top of file)
 * @param {import('./dice.js').Dice} dice
 * @returns {{ state: object, metrics: object }}
 */
export function runYear(state, agents, dice) {
  state.round        += 1;
  state.endTriggered  = state.endTriggered ?? false;

  const agentMap = buildAgentMap(agents);

  appendLog(state, [{ type: 'YEAR_START', round: state.round }]);

  // ── Phases ────────────────────────────────────────────────────────────────
  runYearStart(state, agentMap, dice);
  runSwapPhase(state, agentMap);
  runAuctionPhase(state, agentMap, dice);
  runActionPhase(state, agentMap, dice);
  runSettlementPhase(state, agentMap, dice);

  // ── Year-end cleanup ──────────────────────────────────────────────────────
  for (const player of state.players) {
    if (player.alive) resetCEOYearlyAbilities(player);
    player.loansDrawnThisYear = 0;
    player.swapProceeds       = 0;
    player.swapSpent          = 0;
  }

  appendLog(state, [{ type: 'YEAR_END', round: state.round }]);

  // ── End check ─────────────────────────────────────────────────────────────
  // A death was flagged during settlement this year. All living players already
  // completed their settlements in the same runSettlementPhase call (§3), so
  // score immediately without running another year.
  let scores = null;
  if (state.endTriggered) {
    scores = computeScores(state);
    appendLog(state, [{ type: 'GAME_OVER', scores }]);
  }

  return { state, metrics: buildMetrics(state, scores) };
}
