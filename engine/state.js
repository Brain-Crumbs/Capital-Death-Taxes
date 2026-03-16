/**
 * Creates a blank player object with all required fields.
 *
 * @param {string} id
 * @param {object|null} ceo
 * @returns {object}
 */
export function createPlayer(id, ceo = null) {
  return {
    id,
    ceo,            // CEO card object
    assets: [],     // array of asset card objects, max 3
    cash: 0,
    loans: 0,       // integer token count
    stress: 0,
    taxesPaid: 0,
    alive: true,
    starterAsset: null,  // nullable; discarded on first market purchase (except The Heir)
  };
}

/**
 * Represents the complete game state at any point in time.
 * Supports deep-clone via clone() and serialization via toJSON()/fromJSON().
 */
export class GameState {
  constructor() {
    this.round = 0;
    this.gmi = 0;                    // Global Market Index delta (starts 0)
    this.players = [];               // array of player objects
    this.marketCards = [];           // visible market row, max 4
    this.globalEventDeck = [];       // remaining global event cards
    this.personalEventDecks = {};    // map: playerId → array of cards
    this.discardPiles = {};          // map: pileName → array of cards
    this.activeBubbles = [];         // active bubble modifiers
    this.activeDepressions = [];     // active depression modifiers
    this.log = [];                   // array of event objects (audit trail)
  }

  /** Returns a deep copy of this state (needed for replay/branching). */
  clone() {
    return GameState.fromJSON(this.toJSON());
  }

  /** Serializes to a plain JSON-safe object. */
  toJSON() {
    return JSON.parse(JSON.stringify({
      round: this.round,
      gmi: this.gmi,
      players: this.players,
      marketCards: this.marketCards,
      globalEventDeck: this.globalEventDeck,
      personalEventDecks: this.personalEventDecks,
      discardPiles: this.discardPiles,
      activeBubbles: this.activeBubbles,
      activeDepressions: this.activeDepressions,
      log: this.log,
    }));
  }

  /** Deserializes a plain object produced by toJSON() into a GameState instance. */
  static fromJSON(obj) {
    const state = new GameState();
    state.round = obj.round ?? 0;
    state.gmi = obj.gmi ?? 0;
    state.players = obj.players ?? [];
    state.marketCards = obj.marketCards ?? [];
    state.globalEventDeck = obj.globalEventDeck ?? [];
    state.personalEventDecks = obj.personalEventDecks ?? {};
    state.discardPiles = obj.discardPiles ?? {};
    state.activeBubbles = obj.activeBubbles ?? [];
    state.activeDepressions = obj.activeDepressions ?? [];
    state.log = obj.log ?? [];
    return state;
  }
}
