# Capital-Death-Taxes
 Borrow &amp; Die is a strategy board game in active design. The core theme is wealth-building through asset leverage: players buy assets, borrow against them, offset taxable income with loan draws, and try to maximise their net asset value before they die.
# Borrow & Die — Simulation Architecture & Claude Code Agent Prompts

# Borrow & Die — Project Description

## What this project is

Borrow & Die is a strategy board game in active design. The core theme is wealth-building through asset leverage: players buy assets, borrow against them, offset taxable income with loan draws, and try to maximise their net asset value before they die. The game is a teaching tool as much as a game — it simulates the financial dynamics used by the ultra-wealthy to grow wealth without ever realising (and therefore taxing) gains.

The project consists of a complete card game design including all card data in JSON schema format, card visual mockups in HTML, and a full design rationale developed through iterative conversation. It is ready for physical playtesting.

---

## Core scoring formula

```
Final Score = Total Asset Value – Total Taxes Paid
```

Players win by owning the most paper wealth while paying the least tax. Income is the enemy. Leverage is the strategy.

---

## Game arc

**Labor phase** — no assets owned. Players earn CEO income ($0–$3/yr) and try to buy their first asset.

**Growth phase** — 1–2 assets. Building loan capacity, managing stress, minimising taxable income.

**Legacy phase** — 3 assets owned and/or stress reaches death roll threshold. Death rolls begin (d6, 1–2 = death, 3–6 = survive).

**End trigger** — first player death triggers one final round for all remaining players, then final scoring.

---

## Key mechanics

### Asset Value
`Asset Value = running total, updated each year by: GMI delta + deltaLocalValue (d6 roll)`

Base Value is fixed at purchase (the IPO price). Local Value accumulates from annual d6 rolls. GMI is a shared annual delta applied to every asset.

### Loans and loan capacity
- Loan capacity tracked with a red peg per asset. Grows by `loanCapacityIncreasePer10AssetValue` each time asset value crosses a +10 boundary.
- Loans drawn tracked with a black peg. Cannot exceed red peg position.
- Collateral violation: black peg exceeds red peg → must resolve immediately (repay, restructure, or forced sale).
- Annual settlement: roll d6 per 10 loan units. Trigger = pay $1 + remove 1 loan. Roll of 6 = remove 1 loan free.

### Taxes
- Flat 50% rate on net taxable income.
- First $1 always tax-free.
- Every $1 borrowed this year offsets $1 of income before tax calculation.
- Never reset through bankruptcy. Permanent score penalty.

### Stress and death
- Stress accumulates from: acquiring assets (printed stress value on card), bankruptcy (+2), global/personal event cards.
- Stress removed by: selling assets, integration bonuses, held personal event cards.
- Death roll triggers when stress ≥ threshold (default 6, Bureaucrat CEO = 8).
- Death roll: d6. 1–2 = death. 3–6 = survive.

### GMI (Global Market Index)
- Shared delta applied to all assets every year.
- Set by global event card drawn at year start.
- Categories: Bull Run (+4 base, d6 modifier), Boom (+2 flat), Normal (+1), Flat (0 base, d6 modifier), Correction (–1), Recession (–2), Depression (–2 persistent face-up card).
- d6 modifier rule where applicable: 1–2 = –1, 3–4 = 0, 5–6 = +1.

### Bankruptcy
- Triggered when loans cannot be resolved and no assets remain.
- Cash resets to `max(5, GMI + 5)`.
- All assets and loans wiped. Stress +2. Taxes paid remain.
- Player must reselect a CEO card from available options.

---

## Turn sequence (per year)

```
YEAR START (shared, once)
  1. Draw global event card → apply GMI to all assets
  2. Market refresh if applicable

ROUND ROBIN (rotating starting player each year)
  3. Auction — 4 market cards exposed, min bid = Base Value
  4. Personal actions — draw personal event card, roll value updates per asset
  5. Settlement (free-form within turn):
       sell assets · take out loans · repayment roll · repay loans
       pay taxes · death roll check if stress ≥ threshold
```

---

## Card inventory

| Card type | Count | Notes |
|---|---|---|
| Asset cards | 50 | 20 T1, 23 T2, 7 T3 across 6 industries + 8 hybrids |
| CEO cards (original) | 6 | Worker, Suit, Gambler, Visionary, Bureaucrat, Raider |
| CEO cards (expansion) | 6 | Tax Attorney, Lobbyist, Influencer, Operator, Heir, Short Seller |
| Global event cards | 50 | 10 drawn per game |
| Personal event cards | 50 | ~40 drawn per 4-player game |

---

## Industries (asset cards)

Each industry has a unique mechanical identity:

| Industry | Identity | Unique mechanic |
|---|---|---|
| Technology | Paper wealth engine | Weak loans; integration unlocks lender confidence |
| Energy | GMI-sensitive income trap | GMI applied double (or triple for T3) |
| Real Estate | The floor — stable, high LTV | Highest base loan capacity; once-per-game refinancing |
| Finance | Meta-industry — manipulates loans | Modifies repayment rules on other assets; asymmetric depression mechanic |
| Manufacturing | GMI-resistant grinder | GMI halved; full-stack ignores one depression delta |
| Media & Entertainment | Wild card — buzz die | Roll twice per year, take higher or lower based on buzz die |

**Hybrid cards (8)** span two industries simultaneously, enabling cross-sector combos.

---

## Vertical integration

Owning 2 of 3 placements (Upstream/Midstream/Downstream) in one industry activates one integration bonus. All 3 activates both. Bonuses include: loan capacity increases, crash floors, repayment relief, stress reduction, income offset, free loan restructuring.

Cross-industry synergies also exist — e.g. Real Estate + Finance unlocks leveraged property fund mechanics; Technology + Media unlocks streaming platform loan capacity.

---

## CEO cards

All 12 CEOs are permanent identities — no upgrading. Selected at game start by auction (min $0 bid). Replaced only on bankruptcy or via specific card effects.

Each CEO has:
- Base annual income ($0–$3)
- Starting stress (0–3)
- Death roll threshold (6 for most, 8 for Bureaucrat)
- T3 access rule (standard: requires owning one T2; Visionary: unrestricted)
- 2 abilities (passive, triggered, once-per-year, once-per-game, or risk)
- A starter asset (flat, weak, does not occupy an asset slot — discarded on first market purchase; passive reassignment transfers one ability to first purchased asset)

**Exception:** The Heir's starter asset is permanent, occupies a full asset slot from game start, and is only removed by voluntary sale.

---

## Global event cards

50 cards, 10 drawn per game. Categories:
- Boom (×6) — GMI +2, one industry gets +1 to all value update rolls
- Bull Run (×2) — GMI +4 base with d6 modifier, strong secondary effects
- Normal (×10) — GMI +1, minor secondary effects
- Flat (×6) — GMI 0 with d6 modifier, friction effects
- Correction (×8) — GMI –1, sector pressure
- Recession (×6) — GMI –2, systemic effects
- Depression (×3) — GMI –2 persistent face-up; roll to escape each year; failed escape = all players +1 stress
- Bubble (×3) — industry-specific; raises delta floor while active; pops on next negative GMI, dealing –3 immediate value + collateral pressure
- Stress Event (×3) — all players +1 stress immediately; rarest category
- Wildcard (×3) — unusual effects (turn order reversal, player-set GMI, forced CEO replacement)

---

## Personal event cards

50 cards, ~40 drawn per 4-player game. Timings: IMMEDIATE (resolves on draw), HOLD (player decides when to play or sell for $1), PASSIVE (always-on, auto-discards on trigger).

Categories: Stress Relief (×8), Death Prevention (×4), Cash Windfall (×6), Cash Drain (×4), Tax Event (×5), Loan Event (×6), Market Manipulation (×5), Dice Modifier (×4), Asset Event (×2), Information & Social (×4), Legacy Effect (×2).

---

## Files in this project

| File | Contents |
|---|---|
| `card.schema.json` | Full JSON schema for all card types |
| `SCHEMA_REFERENCE.md` | Annotated schema guide with examples and design rules |
| `CONSOLIDATED_RULE_SET` | Core rules reference |
| `Turn_Sequence` | Formal turn sequence |
| `ceo-cards.json` | Original 6 CEO cards with starter assets |
| `ceo-cards-new-6.json` | Expansion 6 CEO cards with starter assets |
| `energy-cards.json` | 7 Energy sector asset cards |
| `technology-cards.json` | 7 Technology sector asset cards |
| `real-estate-cards.json` | 7 Real Estate sector asset cards |
| `finance-cards.json` | 7 Finance sector asset cards |
| `manufacturing-cards.json` | 7 Manufacturing sector asset cards |
| `media-cards.json` | 7 Media & Entertainment sector asset cards |
| `hybrid-cards.json` | 8 hybrid/cross-industry asset cards |
| `global-event-cards.json` | 50 Global Event cards |
| `personal-event-cards.json` | 50 Personal Event cards |
| `*-card-mockup.html` | Interactive card viewer for each sector |

 
## Technical Overview
 
This document contains everything needed to spin up a Claude Code-powered playtest simulator in a GitHub repo. It covers:
 
1. **Repo architecture** — folder structure and module responsibilities
2. **Priority metrics** — what to measure and why
3. **Agent prompts** — copy-paste instructions for Claude Code across each build phase
4. **Dashboard spec** — how metrics are visualized and recorded
 
---
 
## 1. Repo Architecture
 
```
borrow-and-die-sim/
├── data/
│   ├── cards/                  # Copy all JSON card files here
│   │   ├── energy-cards.json
│   │   ├── finance-cards.json
│   │   ├── manufacturing-cards.json
│   │   ├── media-cards.json
│   │   ├── real-estate-cards.json
│   │   ├── technology-cards.json
│   │   ├── hybrid-cards.json
│   │   ├── ceo-cards.json
│   │   ├── global-event-cards.json
│   │   └── personal-event-cards.json
│   └── schema/
│       └── card_schema.json
├── engine/
│   ├── state.js                # GameState class — single source of truth
│   ├── deck.js                 # Deck builders and shufflers
│   ├── dice.js                 # Deterministic dice module (seeded RNG)
│   ├── gmi.js                  # GMI computation and application
│   ├── asset.js                # Asset value update logic per industry mechanic
│   ├── loans.js                # Loan capacity, draw, repayment check
│   ├── taxes.js                # Tax computation and offset calculation
│   ├── stress.js               # Stress tracking, death roll, bankruptcy
│   ├── market.js               # Market auction simulation
│   ├── events.js               # Global and personal event resolution
│   ├── ceo.js                  # CEO ability application
│   ├── integration.js          # Vertical integration and cross-industry synergy detection
│   └── turn.js                 # Full year turn runner — orchestrates all phases
├── agents/
│   ├── base-agent.js           # Abstract player agent interface
│   ├── conservative-agent.js   # Buys RE/Mfg, manages stress, rarely T3
│   ├── aggressive-agent.js     # Chases T3, leverages hard, accepts death risk
│   ├── tech-stack-agent.js     # Tries to complete vertical tech integration
│   ├── income-agent.js         # Maximizes income (tests the income trap thesis)
│   └── random-agent.js         # Uniformly random legal moves (baseline/chaos)
├── scenarios/
│   ├── scenario-runner.js      # Loads a scenario config, runs N games, returns metrics
│   ├── default-4p.json         # Standard 4-player game
│   ├── tech-only-market.json   # Market seeded with only tech cards (stress test)
│   ├── depression-heavy.json   # Global event deck weighted toward depression cards
│   └── max-leverage.json       # All agents play aggressive (collateral pressure test)
├── metrics/
│   ├── collector.js            # Attaches hooks to engine events, records every state change
│   ├── aggregator.js           # Aggregates raw event log into metric summaries
│   └── metrics-spec.json       # Canonical list of tracked metrics (see Section 2)
├── dashboard/
│   ├── index.html              # Single-page dashboard (no framework, vanilla JS)
│   ├── charts.js               # Chart.js chart builders
│   ├── run-table.js            # Per-run results table
│   └── replay.js               # Step-through replay viewer
├── cli/
│   └── run.js                  # CLI: `node cli/run.js --scenario default-4p --runs 100`
├── output/
│   └── runs/                   # JSON run logs auto-saved here
├── README.md
└── package.json
```
 
---
 
## 2. Priority Metrics
 
These are the metrics that matter most for validating the design thesis. Each has a **health target**, a **red flag threshold**, and the **design question it answers**.
 
### Tier A — Game Health (must be in v1 dashboard)
 
| Metric ID | What it measures | Health target | Red flag | Design question |
|---|---|---|---|---|
| `first_asset_round` | Round number when first asset is purchased (per player) | ≤ 4 | > 6 | Is the labor phase too long? |
| `first_death_roll_round` | Round of first death roll across all players | 6–8 | < 4 or > 10 | Is stress accumulation calibrated? |
| `game_length_rounds` | Total rounds until end trigger fires | ~10 | < 6 or > 14 | Is the end trigger working? |
| `bankruptcy_count` | Bankruptcies per game | ~1 | 0 or > 3 | Is bankruptcy a real threat or inevitable? |
| `collateral_violation_count` | Times black peg exceeded red peg | 1–3 | 0 or > 6 | Is leverage dangerous enough but not punishing? |
| `death_count` | Deaths per game | 1 | 0 or > 2 | Does the mortality mechanic fire? |
 
### Tier B — Economic Balance (should be in v1 dashboard)
 
| Metric ID | What it measures | Health target | Red flag | Design question |
|---|---|---|---|---|
| `final_score_by_ceo` | Net score (asset value – taxes) per CEO archetype | No archetype > 20% win rate advantage | One archetype wins > 40% | Are CEOs balanced? |
| `final_score_by_industry` | Net asset value per industry in winning portfolio | No single industry dominates | One industry in 3+ consecutive wins | Is any strategy dominant? |
| `income_trap_rate` | % of players with high income who score below median | Should be > 50% | < 30% | Is income actually a trap? |
| `tax_offset_rate` | % of income successfully offset via loans | 40–80% | < 20% or > 90% | Is the tax system engaging or trivially solved? |
| `integration_achieved_rate` | % of games where at least one player completes a vertical stack | 40–60% | < 20% or > 80% | Is integration achievable but not trivial? |
| `t3_acquisition_rate` | % of players who buy at least one T3 card | 30–60% | < 10% or > 80% | Is Tier 3 accessible but not default? |
 
### Tier C — Asset Dynamics (useful for deeper balance analysis)
 
| Metric ID | What it measures | Health target | Red flag | Design question |
|---|---|---|---|---|
| `asset_value_trajectory` | Mean asset value curve per industry over rounds | Divergent curves per industry | All industries converge to same trajectory | Do industries feel different? |
| `loan_capacity_utilization` | Mean (loans drawn / max capacity) at game end | 50–80% | < 20% or > 95% | Are loans being used? Is LTV meaningful? |
| `gmi_distribution` | Histogram of GMI deltas across simulated games | Roughly bell-shaped, centered near 0 | Persistent positive bias | Is the market neutral? |
| `stress_at_death_roll` | Stress level when first death roll fires | 6–8 (per threshold) | Always exactly 6 | Do players accumulate stress from multiple sources or just from assets? |
| `personal_event_sell_rate` | % of HOLD cards sold vs played for effect | Target: < 60% sold | > 80% sold | Are HOLD cards worth keeping? |
| `buzz_die_impact` | Media asset value variance vs other industries | Higher variance than others | Same variance as RE | Is the buzz die creating meaningful volatility? |
 
### Tier D — Synergy Validation (post-playtest focus)
 
| Metric ID | What it measures | Health target | Red flag | Design question |
|---|---|---|---|---|
| `integration_bonus_stress_relief` | Mean stress reduction from integration bonuses | Noticeable but not game-breaking | Integration makes stress go negative | Are integration bonuses survivability tools, not win buttons? |
| `cross_industry_synergy_rate` | How often cross-industry synergies are active | Present in ~30% of games | Never active | Are synergies discoverable? |
| `tech_loan_unlock_rate` | How often tech stack achieves integration-unlocked loan capacity | Meaningful but slow | Tech players always cash-poor | Is tech's loan constraint felt but solvable? |
 
---
