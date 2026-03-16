import seedrandom from 'seedrandom';

export class Dice {
  constructor(seed) {
    this._seed = seed;
    this._rng = seedrandom(seed);
  }

  /** Returns an integer in [1, sides] using the seeded RNG. */
  roll(sides) {
    return Math.floor(this._rng() * sides) + 1;
  }

  /** Shorthand for roll(6). */
  d6() {
    return this.roll(6);
  }

  getSeed() {
    return this._seed;
  }
}
