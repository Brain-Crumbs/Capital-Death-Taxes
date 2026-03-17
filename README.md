# Borrow & Die — Simulator

Deterministic card-game simulator for **Borrow & Die**, a board game about wealth-building through asset leverage. Players buy assets, borrow against them, offset taxable income with loan draws, and try to maximise net asset value before they die.

```
Final Score = Total Asset Value – Total Taxes Paid
```

---

## Setup

**Requirements:** Node.js 18+

```bash
npm install
node cli/run.js --help
```

---

## Run a simulation

```bash
# 100 runs of the standard 4-player scenario (results saved to output/runs/)
node cli/run.js --scenario default-4p --runs 100

# Single run with step-by-step output (press Enter each round)
node cli/run.js --scenario default-4p --runs 1 --step

# List all available scenarios
node cli/run.js --list-scenarios
```

Output JSON is saved to `output/runs/<scenario>-<timestamp>-<seed>.json`.

---

## Run the smoke tests

```bash
npm test
# or
node test/smoke.js
```

Runs 110 games total (10 for basic sanity + 100 for d6 coverage) and prints `PASS`/`FAIL` per assertion.

---

## Open the dashboard

> The dashboard is a work in progress. The `dashboard/` folder is a placeholder.

Once `dashboard/index.html` exists:
1. Run a simulation to generate a JSON file in `output/runs/`
2. Open `dashboard/index.html` in a browser
3. Load the JSON file via the file picker

---

## How to add a new scenario

1. Copy an existing scenario file:
   ```bash
   cp scenarios/default-4p.json scenarios/my-scenario.json
   ```

2. Edit `scenarios/my-scenario.json`:
   ```json
   {
     "scenarioName": "my-scenario",
     "seed": "my-unique-seed",
     "runs": 100,
     "players": [
       { "id": "p1", "agentType": "conservative", "ceoBid": 0 },
       { "id": "p2", "agentType": "aggressive",   "ceoBid": 2 }
     ],
     "industries": ["TECHNOLOGY", "REAL_ESTATE", "ENERGY", "FINANCE", "MANUFACTURING", "MEDIA"],
     "startingCash": 3,
     "globalEventDeckBias": null,
     "marketSeed": null
   }
   ```

   | Field | Description |
   |-------|-------------|
   | `seed` | Base RNG seed; each run gets `${seed}-run${i}` |
   | `agentType` | One of: `conservative`, `aggressive`, `tech-stack`, `income`, `random` |
   | `ceoBid` | Fixed bid for CEO auction (overrides agent strategy) |
   | `globalEventDeckBias` | e.g. `{ "DEPRESSION": 3 }` weights depression cards ×3 |
   | `marketSeed` | Optional separate seed to fix market card layout |

3. Run it:
   ```bash
   node cli/run.js --scenario my-scenario
   ```

---

## How to add a new agent

1. Create `agents/my-agent.js` extending `BaseAgent`:

   ```js
   import { BaseAgent } from './base-agent.js';

   export class MyAgent extends BaseAgent {
     constructor(id, opts = {}) {
       super(id, opts);
     }

     // Required: return bid amounts keyed by companyName (or ceoName for CEOs)
     // Return 0 or omit to pass. Bid must be >= card.baseValue for market cards.
     bidOnAsset(card, player, state) {
       return card.baseValue;  // always bid exactly baseValue
     }

     // Required: 'PLAY', 'HOLD', or 'SELL'
     choosePersonalEventAction(card, player, state) {
       return 'HOLD';
     }

     // Required: return assetId to sell, or null
     chooseSellAsset(player, state) {
       return null;
     }

     // Required: return number of loan tokens to draw this year
     chooseLoanDraw(player, state) {
       return 0;
     }
   }
   ```

2. Register it in `scenarios/scenario-runner.js`:

   ```js
   import { MyAgent } from '../agents/my-agent.js';

   const AGENT_CLASSES = {
     // ... existing entries ...
     'my-agent': MyAgent,
   };
   ```

3. Use `"agentType": "my-agent"` in a scenario file.

Agent decisions are logged to `agent.decisions[]` automatically by `BaseAgent`. See `agents/base-agent.js` for the full interface including optional hooks (`lobbyistDirection`, `gamblerWantsReroll`, `beforeAuction`).

---

## Tracked metrics

All metrics are extracted by `metrics/collector.js` after each game and returned in `results[].metrics`.

### Tier A — Game Health

| Metric | What it measures | Health target | Red flag | Design question |
|--------|-----------------|---------------|----------|-----------------|
| `first_asset_round` | Round when first asset is purchased | ≤ 4 | > 6 | Is the labor phase too long? |
| `first_death_roll_round` | Round of first death roll | 6–8 | < 4 or > 10 | Is stress accumulation calibrated? |
| `game_length_rounds` | Total rounds until end trigger | ~10 | < 6 or > 14 | Is the end trigger working? |
| `bankruptcy_count` | Bankruptcies per game | ~1 | 0 or > 3 | Is bankruptcy a real threat or inevitable? |
| `collateral_violation_count` | Times loans exceeded capacity | 1–3 | 0 or > 6 | Is leverage dangerous enough but not punishing? |
| `death_count` | Deaths per game | 1 | 0 or > 2 | Does the mortality mechanic fire? |

### Tier B — Economic Balance

| Metric | What it measures | Health target | Red flag | Design question |
|--------|-----------------|---------------|----------|-----------------|
| `final_score_by_player` | Net score (asset value – taxes) per CEO archetype | No archetype > 20% win rate advantage | One archetype wins > 40% | Are CEOs balanced? |
| `income_vs_score` | Income vs final score correlation | High income players score below median > 50% | < 30% | Is income actually a trap? |
| `tax_offset_by_player` | % of income offset via loans | 40–80% | < 20% or > 90% | Is the tax system engaging or trivially solved? |
| `has_vertical_stack` | Any player completed full vertical integration | 40–60% of games | < 20% or > 80% | Is integration achievable but not trivial? |
| `t3_acquisitions` | Players who bought at least one T3 card | 30–60% | < 10% or > 80% | Is Tier 3 accessible but not default? |

### Tier C — Asset Dynamics

| Metric | What it measures | Health target | Red flag | Design question |
|--------|-----------------|---------------|----------|-----------------|
| `asset_value_trajectories` | Mean asset value curve per industry | Divergent curves per industry | All industries converge | Do industries feel different? |
| `loan_utilization_by_player` | Mean loans drawn / max capacity | 50–80% | < 20% or > 95% | Are loans being used? Is LTV meaningful? |
| `gmi_by_round` | GMI deltas across simulated games | Roughly bell-shaped near 0 | Persistent positive bias | Is the market neutral? |
| `stress_at_death_roll` | Stress level when first death roll fires | 6–8 (per threshold) | Always exactly 6 | Do players accumulate stress from multiple sources? |
| `personal_event_actions` | % of HOLD cards sold vs played | < 60% sold | > 80% sold | Are HOLD cards worth keeping? |
| `integration_bonuses_fired` | Integration bonus activations per game | Present but not dominant | Never or always active | Are bonuses survivability tools, not win buttons? |

---

## Known limitations

- **CEO abilities are approximated.** Complex ability chains (e.g. The Gambler's reroll adjusts the dice sequence but does not fully re-evaluate the outcome table). Multi-step CEO interactions may need manual review for edge cases.

- **No UI for live run monitoring.** The CLI prints progress every 10% for multi-run batches, but there is no real-time dashboard during a run. The `dashboard/` folder is a placeholder for a future viewer.

- **Players can accumulate negative cash.** The engine debits taxes and loan repayments even when a player has insufficient cash. Bankruptcy is only triggered by collateral violations (loans exceeding capacity), not by zero cash. A high-income player with no cash reserves will gradually accumulate a tax-debt deficit without triggering bankruptcy. The smoke test flags only catastrophic values (below `-(round × 5)`).

- **GMI buy/sell pressure is disabled (v1 simplification).** In the physical game, GMI movements are intended to create secondary buy/sell pressure on the market row. This pressure mechanic is not implemented in the v1 simulator per the original design doc. Asset value updates apply the GMI delta directly without modelling market sentiment flows.

---

## Project structure

```
├── agents/               # Agent implementations (conservative, aggressive, tech-stack, income, random)
├── cli/run.js            # CLI entry point
├── dashboard/            # Placeholder for browser-based visualiser
├── data/cards/           # Card definitions in JSON (assets, CEOs, events)
├── engine/               # Core game engine (state, turn, dice, assets, loans, taxes, stress …)
├── metrics/              # Per-game metric extraction and aggregation
├── output/runs/          # Auto-saved JSON run outputs
├── scenarios/            # Scenario configs + scenario runner
└── test/smoke.js         # Smoke test (npm test)
```
