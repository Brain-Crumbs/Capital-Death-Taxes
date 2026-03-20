# Borrow & Die — Project Description

## Key Information References
.claude - folder where all files below are located
CONSOLIDATED_RULE_SET.md - source of truth for rules
SCHEMA_REFERENCE.md - source of truth for json schemas
Features - folder containing all feature documentation

All planning documentation created by Claude should be in a folder .claude/agent-docs

## What this game is

Borrow & Die is a 2–5 player strategy board game about wealth accumulation through asset leverage. Players buy companies, borrow against them, manage a stress-based mortality clock, and score by final portfolio value at game end. The core thesis: **income is bad; leverage offsets income; paper wealth is the goal.**

The game runs for approximately 10 rounds. A full game takes 90–120 minutes. The first player death roll typically occurs around rounds 6–8. Target bankruptcy frequency is roughly one per game.

---

## Core loop

Each year (round):

1. A global GMI event card is drawn, shifting all asset values up or down by an amplified or modified amount depending on industry.
2. Players auction market cards, roll asset value updates, draw personal event cards, and manage their loan and tax positions.
3. Players with high stress risk a death roll. Players who go bankrupt are eliminated.
4. The game ends when only one player remains, or after a set number of rounds — the surviving player with the highest net portfolio value wins.

---

## The mortality mechanic

Stress is the game's mortality clock. It accumulates through asset purchases, bad GMI years, and personal event draws. When a player's stress meets or exceeds their CEO's death roll threshold (default 6), they roll d6 at year end. On a 1, they die — assets are liquidized to cover any outstanding loans. Death tax of 50% of any cash held at the end of this process. Final score is value of remaining assets plus cash held after the death tax. Players have the option to continue until all players die or one turn after first player dies (see scoring rules)

Death is expected. The game is balanced around the assumption that not everyone survives.

---

## The income trap

Income is taxable at 50% above $1 per year (the personal tax-free threshold). To offset income, players must draw loans against their assets. Industries with more 'depreciable' assets can be leveraged this way to offset income more than other industries which can not do this (Some CEO classes can manipulate this to their advantage)— this increases leverage and reduces net cash. High-income assets are a trap unless the player has sufficient loan capacity to offset them. The Leverage Tax (see Rules) creates additional pressure on players who accumulate too much outstanding debt.

---

## Industries (7)

Each industry has a distinct GMI relationship and a distinct class identity.

| Industry | GMI relationship | Class(es) |
|---|---|---|
| Real Estate | Neutral | Knight |
| Technology | Immune (suppressed loans until integration) | Wizard |
| Manufacturing | Halved | Paladin, Artificer |
| Finance | Sensitive — double-hit on 1–3 in negative GMI years | Warlock (UP), Rogue (MID/DN) |
| Energy | Amplified ×2 (×3 at T3) | Druid |
| Media/Entertainment | Buzz die overrides GMI | Bard |
| Defence | Counter-cyclical — negative GMI produces positive delta | Commander |

Hybrid cards exist for the Ranger (breadth play), Monk (Healthcare), and Alchemist (Pharma). These are filed under the nearest aligned industry and count as dual-industry for integration purposes.

---

## Classes (12)

Each class corresponds to one or two CEO identities and a primary industry or industry subset.

| Class | Industry focus | CEO(s) | Identity |
|---|---|---|---|
| Knight | Real Estate | The Trustee, The Chairman | Highest LTV, highest income, most tax pressure |
| Wizard | Technology | The Founder | Zero income, explosive ceiling, loan suppression until vertical integration |
| Paladin | Manufacturing (wide) | The Foreman, The Compliance Officer | GMI-resistant, party support, The Blessing |
| Artificer | Manufacturing (deep) | The Engineer | Integration bonuses doubled, permanent asset upgrade |
| Warlock | Finance Upstream | The Quant, The Trader | Asymmetric downside, inverted positions, pact dividend |
| Rogue | Finance Mid/Down | The Tax Attorney| Deck manipulation, tax reclassification, distressed acquisition |
| Bard | Media/Entertainment | The Publicist | Buzz die, scandal, inspiration, card-sale premium |
| Druid | Energy | The Geologist, The Trader | GMI amplified, foresight, GMI protection for allies |
| Commander | Defence | The General | Counter-cyclical, classified collateral, crisis stress reduction |
| Ranger | Hybrid / Multi-industry | The Foreman | Breadth play, terrain bonus at 3+ industries |
| Monk | Healthcare hybrid | The Actuary | Stress-linked loan capacity — staying alive is the strategy |
| Alchemist | Pharma hybrid | The Researcher | Trial die — one-time permanent asset bifurcation |

---

## CEO selection

CEOs are auctioned at game start with a minimum bid of $0. Each CEO comes with a starter asset — a low-value card that provides minimal income and loan capacity, discarded when the player's first market asset is purchased. On discard, the starter asset transfers one ability to the first purchased asset.

The Trustee's starter (Family Trust) is permanent — it occupies a full asset slot and is never discarded.

---

## Card types

| Type | Purpose |
|---|---|
| Asset cards | Companies players own. 7 industries, 3 tiers, 3 placements (UP/MID/DN). |
| CEO cards | Player identity. Determines income, starting stress, death threshold, and special abilities. |
| Global event cards | Annual GMI-shifting events. Affect all players. Includes bull runs, recessions, depressions, and bubbles. |
| Personal event cards | Per-player draws. Immediate (resolve now), Hold (play when useful, or sell for $1–$2), or Passive (always active). |

---

## New mechanics (v2 — current design)

### Loan capacity synergy bonuses — conditional only

Flat `+X to baseLoanCapacity` with no condition is **prohibited**. All loan capacity bonuses from vertical integration and cross-industry synergies must be conditional or scaling. Valid structures include:

- **Portfolio breadth:** "+X for each [industry] asset you own"
- **Asset growth:** "+X, and an additional +X if this asset's value exceeds [threshold]"
- **Stability over time:** "+X after N consecutive years without a downturn"
- **Long-term compounding:** "+X to loanCapacityIncreasePer10AssetValue instead of a flat bonus"

The structure must be thematically motivated. A stable utility earns lender trust over time. A diversified portfolio signals creditworthiness. A high-value asset unlocks a new financing tier. The condition should explain itself.

### The Leverage Tax

During the settlement phase, players count their total outstanding loan tokens across all assets. For every 10 loans held, one loan token is generated — the Leverage Tax.

The player may:
- Place each generated token on any asset with remaining capacity, or
- Pay $1 cash per token instead

Cash paid this way offsets taxable income dollar-for-dollar for the current year — it is not a net loss, but it does consume liquidity.

**Scaling:** 10 loans = +1 token. 20 loans = +2 tokens. 30 loans = +3 tokens. And so on. All card types can synergize with this value including a dice roll mechanic for how many tokens per 10 loans you get

**Sequencing:** The Leverage Tax resolves during settlement phase. 

**Design intent:** The Leverage Tax penalises maximum leverage without making leverage unviable. Players who borrow to the limit pay a compounding cost. Players who stay within manageable debt levels are unaffected. This reinforces the game's thesis that unchecked borrowing has systemic consequences — while preserving the strategic value of leverage as the primary tool for offsetting income.

---

## Scoring

Final portfolio value = sum of all owned asset values at game end + all cash held on hand - sum of all held loans (net worth).  When a Player dies their family estate must settle all debts - liquidizing as necessary to cover costs. Then any cash held on hand is taxed at 50% (death tax). The Player who dies final score is then just sum of all owned assets (that were not liquidized) + 50% of cash held 
---

## What is not in this document

- Physical component list 
- Starting cash confirmation ($3 — needs playtesting)
- Tie-breaking rules for auctions and final scoring
- CEO reselection rules after bankruptcy
- Print-ready card layout and dimensions
- Formal player-facing rulebook (rules currently exist as card text and this reference)