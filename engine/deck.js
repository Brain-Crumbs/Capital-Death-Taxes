import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { join, dirname } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '../data/cards');

/**
 * Maps industry names (lowercase) to their data filenames.
 * Note: manufacturing-cards intentionally has no .json extension in the repo.
 */
const INDUSTRY_FILES = {
  energy: 'energy-cards.json',
  finance: 'finance-cards.json',
  technology: 'technology-cards.json',
  media: 'media-cards.json',
  'real-estate': 'real-estate-cards.json',
  manufacturing: 'manufacturing-cards.json',
  hybrid: 'hybrid-cards.json',
};

/**
 * Fisher-Yates shuffle using a Dice instance for deterministic randomness.
 * Returns a new array; does not mutate the input.
 *
 * @param {Array} arr
 * @param {import('./dice.js').Dice} dice
 * @returns {Array}
 */
function shuffle(arr, dice) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = dice.roll(i + 1) - 1;
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Reads the JSON file for the given industry and returns the array of card objects.
 *
 * @param {string} industry  — e.g. "energy", "manufacturing", "real-estate"
 * @returns {Array<object>}
 */
export function loadCards(industry) {
  const filename = INDUSTRY_FILES[industry.toLowerCase()];
  if (!filename) throw new Error(`Unknown industry: "${industry}"`);
  return JSON.parse(readFileSync(join(DATA_DIR, filename), 'utf8'));
}

/**
 * Combines all ASSET cards from the given industries, then shuffles them.
 *
 * @param {string[]} industries
 * @param {import('./dice.js').Dice} dice
 * @returns {Array<object>}
 */
export function buildMarketDeck(industries, dice) {
  const cards = industries.flatMap(ind =>
    loadCards(ind).filter(c => c.cardType === 'ASSET')
  );
  return shuffle(cards, dice);
}

/**
 * Loads global-event-cards.json and returns a shuffled deck.
 *
 * @param {import('./dice.js').Dice} dice
 * @returns {Array<object>}
 */
export function buildGlobalEventDeck(dice) {
  const cards = JSON.parse(
    readFileSync(join(DATA_DIR, 'global-event-cards.json'), 'utf8')
  );
  return shuffle(cards, dice);
}

/**
 * Loads personal-event-cards.json and returns a shuffled deck.
 * Call once per player — each receives their own independently shuffled copy.
 *
 * @param {import('./dice.js').Dice} dice
 * @returns {Array<object>}
 */
export function buildPersonalEventDeck(dice) {
  const cards = JSON.parse(
    readFileSync(join(DATA_DIR, 'personal-event-cards.json'), 'utf8')
  );
  return shuffle(cards, dice);
}
