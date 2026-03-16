/**
 * Market initialisation and auction resolution.
 *
 * initMarket(state, marketDeck)
 *   → populates state.marketCards (top 4) and state.discardPiles.marketDeck (remainder)
 *
 * auctionAsset(card, players, agentBids, state)
 *   → { winner, winningBid, logEvent }
 *   Resolves a single auction slot: highest bid >= baseValue wins.
 *   Tie-break: first player in the `players` array.
 *   Winning player's cash is deducted, asset is added to their portfolio,
 *   starter asset is discarded (unless The Heir), and the market slot is
 *   refilled from the remaining deck.
 */

/**
 * Populates the initial market state from a pre-shuffled deck.
 * The first 4 cards become the face-up market; the rest are stored as the
 * remaining draw pile in state.discardPiles.marketDeck.
 * Mutates state directly.
 *
 * @param {object}   state       — GameState
 * @param {object[]} marketDeck  — full shuffled market deck
 */
export function initMarket(state, marketDeck) {
  state.marketCards               = marketDeck.slice(0, 4);
  state.discardPiles.marketDeck   = marketDeck.slice(4);
}

/**
 * Resolves the auction for a single market card.
 *
 * Rules:
 *   - A bid is only valid when bid >= card.baseValue.
 *   - The player with the highest valid bid wins.
 *   - Tie-break: first player in the `players` array order.
 *   - On a win:
 *       • winner.cash  -= winningBid
 *       • asset is added to winner.assets (currentValue = baseValue)
 *       • winner.stress += asset.stress  (asset stress applied immediately)
 *       • starter asset discarded unless ceo === 'The Heir'
 *       • market slot refilled from state.discardPiles.marketDeck (if available)
 *   - Returns { winner: null, winningBid: 0, logEvent: null } if no valid bid.
 *
 * @param {object}   card       — market card being auctioned
 * @param {object[]} players    — all living players in turn order
 * @param {object}   agentBids  — { [playerId]: number }  bid amounts
 * @param {object}   state      — GameState (mutated for market slot refresh)
 * @returns {{ winner: object|null, winningBid: number, logEvent: object|null }}
 */
export function auctionAsset(card, players, agentBids, state) {
  let winner     = null;
  let winningBid = 0;

  for (const player of players) {
    if (!player.alive) continue;
    const bid = agentBids[player.id] ?? 0;
    if (bid >= card.baseValue && bid > winningBid) {
      winner     = player;
      winningBid = bid;
    }
  }

  if (!winner) {
    return { winner: null, winningBid: 0, logEvent: null };
  }

  // ── Deduct cash ───────────────────────────────────────────────────────────
  winner.cash -= winningBid;

  // ── Add asset (currentValue initialised to baseValue) ────────────────────
  const acquiredAsset = { ...card, currentValue: card.baseValue };
  winner.assets.push(acquiredAsset);

  // ── Apply asset stress ────────────────────────────────────────────────────
  winner.stress += card.stress ?? 0;

  // ── Discard starter asset (unless The Heir keeps it forever) ─────────────
  if (winner.starterAsset !== null && winner.ceo?.ceoName !== 'The Heir') {
    winner.starterAsset = null;
  }

  // ── Refill market slot ────────────────────────────────────────────────────
  const slotIndex = state.marketCards.findIndex(
    c => c && c.companyName === card.companyName,
  );
  const deck = state.discardPiles.marketDeck ?? [];

  if (slotIndex !== -1) {
    if (deck.length > 0) {
      state.marketCards[slotIndex]       = deck.shift();
      state.discardPiles.marketDeck      = deck;
    } else {
      state.marketCards[slotIndex]       = null;
    }
  }

  const logEvent = {
    type:        'ASSET_PURCHASED',
    playerId:    winner.id,
    assetId:     card.companyName,
    bid:         winningBid,
    newCash:     winner.cash,
    stressDelta: card.stress ?? 0,
    newStress:   winner.stress,
  };

  return { winner, winningBid, logEvent };
}
