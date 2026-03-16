/**
 * scenarios/scenario-runner.js
 *
 * Loads a scenario config, instantiates all required objects, then runs the
 * game loop for the requested number of independent runs.
 *
 * Usage:
 *   import { runScenario } from './scenarios/scenario-runner.js';
 *   const results = await runScenario(config, { onYearEnd });
 *
 * Each run gets a unique seed derived from config.seed + run index so that
 * runs are deterministic but vary between one another.
 *
 * Scenario config format
 * ──────────────────────
 * {
 *   "scenarioName": "default-4p",
 *   "seed": "borrow-and-die-v1",
 *   "runs": 100,
 *   "players": [
 *     { "id": "p1", "agentType": "conservative", "ceoBid": 0 },
 *     ...
 *   ],
 *   "industries": ["TECHNOLOGY","REAL_ESTATE","ENERGY","FINANCE","MANUFACTURING","MEDIA"],
 *   "startingCash": 3,
 *   "globalEventDeckBias": null,   // or e.g. { "DEPRESSION": 3 }
 *   "marketSeed": null             // optional separate seed for market deck only
 * }
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { join, dirname } from 'path';

import { Dice }                                            from '../engine/dice.js';
import { GameState, createPlayer }                         from '../engine/state.js';
import { buildMarketDeck, buildGlobalEventDeck,
         buildPersonalEventDeck }                          from '../engine/deck.js';
import { initMarket }                                      from '../engine/market.js';
import { runYear }                                         from '../engine/turn.js';
import { collect }                                         from '../metrics/collector.js';
import { AggressiveAgent }                                 from '../agents/aggressive-agent.js';
import { ConservativeAgent }                               from '../agents/conservative-agent.js';
import { TechStackAgent }                                  from '../agents/tech-stack-agent.js';
import { IncomeAgent }                                     from '../agents/income-agent.js';
import { RandomAgent }                                     from '../agents/random-agent.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ─── Constants ───────────────────────────────────────────────────────────────

/** Safety cap — prevents infinite loops if endTriggered never fires. */
const MAX_ROUNDS = 50;

/** Maps scenario agentType strings to agent constructors. */
const AGENT_CLASSES = {
  aggressive:   AggressiveAgent,
  conservative: ConservativeAgent,
  'tech-stack': TechStackAgent,
  income:       IncomeAgent,
  random:       RandomAgent,
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Normalises an industry name from scenario format (e.g. REAL_ESTATE) to the
 * lowercase-hyphenated format used by deck.js (e.g. real-estate).
 */
function normaliseIndustry(name) {
  return name.toLowerCase().replace(/_/g, '-');
}

/**
 * Fisher-Yates shuffle using a Dice instance (does not use deck.js internals
 * so we can shuffle arbitrary arrays here too).
 * @private
 */
function shuffleArray(arr, dice) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = dice.roll(i + 1) - 1;
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Loads and shuffles the CEO deck from ceo-cards.json.
 * @param {Dice} dice
 * @returns {object[]}
 */
function buildCEODeck(dice) {
  const cards = JSON.parse(
    readFileSync(join(__dirname, '../data/cards/ceo-cards.json'), 'utf8'),
  );
  return shuffleArray(cards, dice);
}

/**
 * Builds a global event deck with optional per-category weight bias.
 *
 * bias format: { [eventCategory]: weightMultiplier }
 * e.g. { "DEPRESSION": 3 } causes every DEPRESSION card to appear 3× in the deck.
 *
 * @param {Dice}   dice
 * @param {object|null} bias
 * @returns {object[]}
 */
function buildEventDeckWithBias(dice, bias) {
  if (!bias) {
    return buildGlobalEventDeck(dice);
  }

  const cards = JSON.parse(
    readFileSync(join(__dirname, '../data/cards/global-event-cards.json'), 'utf8'),
  );

  const expanded = [];
  for (const card of cards) {
    const weight = bias[card.eventCategory] ?? 1;
    for (let w = 0; w < weight; w++) {
      expanded.push({ ...card });
    }
  }

  return shuffleArray(expanded, dice);
}

/**
 * Creates an agent instance for a player config entry.
 * The agent's CEO-card bid() is intercepted to enforce the scenario-level
 * ceoBid value, allowing reproducible CEO auction outcomes across agent types.
 *
 * @param {{ id, agentType, ceoBid }} playerConfig
 * @returns {BaseAgent}
 */
function createAgent(playerConfig) {
  const AgentClass = AGENT_CLASSES[playerConfig.agentType];
  if (!AgentClass) {
    throw new Error(`Unknown agentType: "${playerConfig.agentType}"`);
  }

  const agent = new AgentClass(playerConfig.id, { ceoBid: playerConfig.ceoBid ?? 0 });

  // Wrap bid() so CEO-card bids use the scenario-configured amount.
  const originalBid = agent.bid.bind(agent);
  agent.bid = (cards, player, state) => {
    const bids = originalBid(cards, player, state);
    for (const card of cards) {
      if (card.cardType === 'CEO') {
        bids[card.ceoName] = playerConfig.ceoBid ?? 0;
      }
    }
    return bids;
  };

  return agent;
}

/**
 * Builds a fresh, fully initialised GameState for a single game run.
 *
 * @param {object} config  — scenario config
 * @param {Dice}   dice    — seeded dice for this run
 * @returns {GameState}
 */
function initState(config, dice) {
  const state = new GameState();

  // ── Players ───────────────────────────────────────────────────────────────
  state.players = config.players.map(({ id }) => {
    const player = createPlayer(id);
    player.cash  = config.startingCash ?? 3;
    return player;
  });

  // ── Market deck ───────────────────────────────────────────────────────────
  // Use a separate Dice instance if marketSeed is provided so the market
  // layout can be fixed independently of other randomness.
  const marketDice = config.marketSeed ? new Dice(config.marketSeed) : dice;
  const industries = (
    config.industries ?? [
      'TECHNOLOGY', 'REAL_ESTATE', 'ENERGY',
      'FINANCE', 'MANUFACTURING', 'MEDIA',
    ]
  ).map(normaliseIndustry);

  const marketDeck = buildMarketDeck(industries, marketDice);
  initMarket(state, marketDeck);

  // ── Global event deck (with optional bias) ────────────────────────────────
  state.globalEventDeck = buildEventDeckWithBias(dice, config.globalEventDeckBias ?? null);

  // ── Personal event decks — one independently shuffled deck per player ─────
  for (const player of state.players) {
    state.personalEventDecks[player.id] = buildPersonalEventDeck(dice);
  }

  // ── CEO deck — stored for the round-1 CEO auction in turn.js ─────────────
  state.discardPiles.ceoDeck = buildCEODeck(dice);

  return state;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Runs all game iterations for a scenario config and returns an array of
 * per-run result objects.
 *
 * Each run is fully isolated: fresh state, fresh agents, fresh dice derived
 * from `${config.seed}-run${i}`.
 *
 * @param {object} config
 *   Parsed scenario JSON (see file header for format).
 *
 * @param {object} [opts]
 * @param {Function} [opts.onYearEnd]
 *   Optional async callback invoked after each year:
 *     async (state, yearMetrics, runIndex) => void
 *   Useful for step-mode printing, progress logging, etc.
 *
 * @returns {Promise<Array<{
 *   runIndex:     number,
 *   seed:         string,
 *   scenarioName: string,
 *   metrics:      object,
 * }>>}
 */
export async function runScenario(config, opts = {}) {
  const { onYearEnd } = opts;
  const runCount = config.runs ?? 1;
  const results  = [];

  for (let i = 0; i < runCount; i++) {
    const runSeed = `${config.seed}-run${i}`;
    const dice    = new Dice(runSeed);
    const state   = initState(config, dice);
    const agents  = config.players.map(p => createAgent(p));

    let rounds = 0;

    while (!state.endTriggered && rounds < MAX_ROUNDS) {
      const { metrics: yearMetrics } = runYear(state, agents, dice);
      rounds++;

      if (onYearEnd) {
        await onYearEnd(state, yearMetrics, i);
      }
    }

    const metrics = collect(state);
    results.push({
      runIndex:     i,
      seed:         runSeed,
      scenarioName: config.scenarioName,
      metrics,
    });
  }

  return results;
}
