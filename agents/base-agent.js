/**
 * BaseAgent — abstract base class for all Borrow & Die agents.
 *
 * Subclasses override the four decision methods:
 *   bidOnAsset(card, myPlayer, state)            → integer bid (0 = pass)
 *   choosePersonalEventAction(card, myPlayer, state) → "HOLD" | "PLAY" | "SELL"
 *   chooseSellAsset(myPlayer, state)             → assetId (companyName) | null
 *   chooseLoanDraw(myPlayer, state)              → integer tokens to draw (0 = none)
 *
 * The base class also implements the turn.js agent interface by wrapping
 * bidOnAsset inside bid(cards, player, state).
 *
 * Logging: every decision is appended to this.decisions as:
 *   { type: "AGENT_DECISION", agentType, playerId, action, reasoning, round }
 */
export class BaseAgent {
  /**
   * @param {string} playerId  — must match the player.id in game state
   * @param {object} [config]  — optional agent-specific configuration
   */
  constructor(playerId, config = {}) {
    this.playerId  = playerId;
    this.config    = config;
    this.decisions = [];             // audit log of every decision
    this.agentType = 'base';         // overridden by subclasses
  }

  // ── turn.js interface ──────────────────────────────────────────────────────

  /** turn.js reads agent.id to build its agentMap. */
  get id() {
    return this.playerId;
  }

  /**
   * Called once per auction slot with a one-element cards array.
   * Delegates to bidOnAsset() and packages the result for turn.js.
   *
   * @param {object[]} cards   — visible market cards (usually one at a time)
   * @param {object}   player  — current player state
   * @param {object}   state   — full game state
   * @returns {{ [companyName|ceoName]: number }}
   */
  bid(cards, player, state) {
    const bids = {};
    for (const card of cards) {
      const amount = this.bidOnAsset(card, player, state);
      if (amount > 0) {
        // CEO cards use ceoName; asset cards use companyName
        const key = card.companyName ?? card.ceoName;
        if (key) bids[key] = amount;
      }
    }
    return bids;
  }

  // ── Abstract decision methods (override in subclasses) ────────────────────

  /**
   * Returns the bid amount for a single card.
   * Return 0 to pass. Bid must be >= card.baseValue to be accepted by the engine.
   *
   * @param {object} card      — the card being auctioned
   * @param {object} myPlayer  — current player state
   * @param {object} state     — full game state
   * @returns {number}
   */
  // eslint-disable-next-line no-unused-vars
  bidOnAsset(card, myPlayer, state) {
    return 0;
  }

  /**
   * Decides what to do with a personal event card.
   *   "PLAY" — resolve the card's immediate effect now
   *   "HOLD" — keep for later use (only valid if card.playTiming === "HOLD")
   *   "SELL" — discard for $1 cash
   *
   * @param {object} card
   * @param {object} myPlayer
   * @param {object} state
   * @returns {"HOLD"|"PLAY"|"SELL"}
   */
  // eslint-disable-next-line no-unused-vars
  choosePersonalEventAction(card, myPlayer, state) {
    return card.playTiming === 'HOLD' ? 'HOLD' : 'PLAY';
  }

  /**
   * Optionally sells one owned asset during the settlement phase (voluntary).
   * Return the asset's companyName to sell it, or null to hold everything.
   *
   * @param {object} myPlayer
   * @param {object} state
   * @returns {string|null}
   */
  // eslint-disable-next-line no-unused-vars
  chooseSellAsset(myPlayer, state) {
    return null;
  }

  /**
   * Returns how many loan tokens to draw this turn.
   * Return 0 to draw nothing.
   *
   * @param {object} myPlayer
   * @param {object} state
   * @returns {number}
   */
  // eslint-disable-next-line no-unused-vars
  chooseLoanDraw(myPlayer, state) {
    return 0;
  }

  // ── Logging helper ─────────────────────────────────────────────────────────

  /**
   * Records a decision to this.decisions and returns the log entry.
   *
   * @param {string} action    — short label, e.g. "BID", "PASS", "HOLD"
   * @param {string} reasoning — human-readable explanation
   * @param {number} round     — current game round (state.round)
   * @returns {object}
   */
  logDecision(action, reasoning, round) {
    const entry = {
      type:      'AGENT_DECISION',
      agentType: this.agentType,
      playerId:  this.playerId,
      action,
      reasoning,
      round,
    };
    this.decisions.push(entry);
    return entry;
  }
}
