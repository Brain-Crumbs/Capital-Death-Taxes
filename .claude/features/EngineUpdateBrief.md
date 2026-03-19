# Borrow & Die — Rules Update Brief

## For: Simulation Engine Agent

 

This document summarises the mechanical changes made across industry cards and CEO cards in v2. Use it alongside the attached card JSON files to update the engine. Changes are grouped by category. Where a mechanic is new, the rule text on the card is authoritative.

 

---

 

## 1. New Industry: DEFENCE

 

Add `DEFENCE` as a valid `industry` enum value.

 

Add `classifiedBonusCapacity` as an optional integer field on asset cards. When a player owns **2 or more Defence placements simultaneously**, this bonus is permanently added to the `baseLoanCapacity` of all their Defence assets. Until then it is hidden.

 

**GMI behaviour (all Defence cards):** Negative GMI → apply absolute value as a positive delta. Positive GMI → apply at half magnitude, rounded toward zero.

 

**Prior-year loan terms:** Defence repayment trigger ranges shift based on the *previous* year's GMI. After a negative GMI year: improve by 1 face. After a positive GMI year: worsen by 1 face. The base table on each card represents the neutral/first-year starting position.

 

**Crisis stress reduction:** The T1 Midstream Defence card (Ironmark Systems) reduces the owner's stress by 1 whenever the GMI event is a DEPRESSION or STRESS\_EVENT.

 

---

 

## 2. New Special Rules on Existing Industry Cards

 

These rules are embedded in `industryMechanic` on the relevant cards. The engine needs to handle each as a distinct trigger.

 

| Card | Rule | Trigger |

|---|---|---|

| Duskfield Extraction (Energy T1 UP) | **Foresight** — once/yr, owner may look at top GMI card before reveal, return to top or bottom | Before GMI draw each year |

| Solace Utility (Energy T2 DN) | **GMI Protection** — reduce all owner's assets' GMI delta by 1; on CORRECTION or worse, extend to one named other player | Before GMI resolves |

| Meridian Power Grid (Energy T2 MID) | **Cleric synergy** — both this owner and any RE MIDSTREAM asset owner reduce stress by 1 once per game | On activation |

| Irongate Fabrication (Mfg T1 MID) | **The Blessing** — once/yr, improve loan repayment trigger by 1 face on any named asset | During settlement phase |

| Caldron Consolidated (Mfg T3 MID) | **Permanent Upgrade** — once per game, permanently +1 baseLoanCapacity on any owned asset | During settlement phase |

| Caldermere Regional Bank (Finance T1 MID) | **Tax Reclassification** — taxable income –1/yr without a loan draw | Always active |

| Dunmore Consumer Credit (Finance T1 DN) | **Distressed Acquisition** — bid $1 below forced-sale price before auction opens | On any forced sale |

| Axiom Asset Management (Finance T2 DN) | **Distressed Acquisition (T2)** — same as above; stacks with T1 DN for a second use/yr | On any forced sale |

| Meridian Institutional Bank (Finance T2 MID) | **Market Preview** — once/yr, look at top 2 market cards and reorder | Before auction phase |

| Vantage Sovereign Fund (Finance T3 UP) | **Pact Dividend** — gain $1 when GMI double-hit triggers on this card | On double-hit trigger |

| Greenvale Bear Fund (Finance T1 UP) | **Inverted position** — delta table is fully reversed; GMI double-hit does NOT apply | Always |

| Meridian Live Events (Media T1 DN) | **Scandal** — once/yr, force bad buzz on one other player's asset (declared before buzz die) | Player's value update turn |

| Nexus Broadcast (Media T2 MID) | **Inspiration** — once/yr, grant good buzz to any player's asset (declared before buzz die) | Before buzz die roll |

| Colosseum Sports & Live (Media T2 DN) | **Card-Sale Premium** — held event cards sell for $2 instead of $1 | Always active |

| Pantheon Global Media (Media T3 UP) | **Scandal Immunity** — cannot be targeted by Scandal | Always |

| Hartfield Toll Road (Hybrid T1) | **Terrain Bonus** — if owner holds 3+ different industries, each asset gains +1 baseLoanCapacity (dynamic) | Checked each turn |

 

---

 

## 3. GMI Mechanic Clarifications

 

- **Finance (all cards):** On negative GMI, roll d6 — on 1–3, apply the negative delta a second time. This is unchanged.

- **Energy (all cards):** Apply GMI delta twice. T3 applies three times.

- **Manufacturing (all cards):** Halve GMI delta, round toward zero.

- **Media (all cards):** Buzz die (d6) rolled before every value update. 1–2 = bad buzz (take lower of two rolls). 3–6 = good buzz (take higher of two rolls).

- **Defence (all cards):** As described in section 1.

- **Pharma hybrids (pre-trial):** GMI does not apply until the trial die has been rolled.

 

---

 

## 4. Hybrid Cards — New Additions

 

Three new infrastructure hybrids. All are GMI-immune or GMI-halved, stress 0, income 2. They count as two industry types simultaneously for integration/synergy purposes.

 

| Card | Filed as | Dual eligibility |

|---|---|---|

| Hartfield Toll Road Network (T1) | RE MIDSTREAM | Also Mfg MIDSTREAM |

| Caldwell International Airport (T2) | Energy DOWNSTREAM | Also RE DOWNSTREAM |

| Meridian Water Authority (T1) | Energy MIDSTREAM | Also Mfg MIDSTREAM |

 

Two Healthcare hybrid cards with **stress-linked loan capacity**: effective capacity = printed base –1 per 2 stress above 2. Unbankable at stress 8+.

 

| Card | Filed as |

|---|---|

| Ashford Community Health System (T1) | Mfg MIDSTREAM hybrid |

| Hargreave Insurance Conglomerate (T2) | Finance UPSTREAM hybrid |

 

Two Pharma hybrid cards with the **trial die mechanic** (one-time permanent bifurcation per card, d6, success on 4–6). Filed under TECHNOLOGY. GMI-immune pre-trial; GMI-sensitive (success) or GMI-resistant (failure) post-trial.

 

| Card | Filed as |

|---|---|

| Vantara Drug Discovery (T1) | Tech UPSTREAM |

| Nexbridge Clinical Platform (T2) | Tech MIDSTREAM |

 

---

 

## 5. CEO Cards — Full Replacement

 

All 12 existing CEO names are replaced. Mechanics are carried over with the changes below. The new JSON file is authoritative.

 

| New name | Replaces | Class | Key change |

|---|---|---|---|

| The Trustee | The Heir | Knight | Identical mechanics, new name and flavour |

| The Chairman | The Suit | Knight | Identical mechanics, new name and flavour |

| The Founder | The Visionary | Wizard | Identical mechanics, new name and flavour |

| The Foreman | The Worker | Paladin / Ranger | Identical mechanics, new name and flavour |

| The Compliance Officer | The Bureaucrat | Paladin | Identical mechanics, new name and flavour |

| The Engineer | The Operator | Artificer | Identical mechanics, new name and flavour |

| The Quant | The Short Seller | Warlock | Identical mechanics, new name and flavour |

| The Trader | The Gambler | Warlock / Druid | Identical mechanics, new name and flavour |

| The Publicist | The Influencer | Bard | Identical mechanics, new name and flavour |

| The Geologist | The Lobbyist | Druid | **GMI adjustment changed from once/year to once/game** |

| The Receiver | The Raider | Rogue | Identical mechanics, new name and flavour |

| The Structurer | The Tax Attorney | Rogue | Identical mechanics, new name and flavour |

 

Three entirely new CEOs with no prior equivalent:

 

| New name | Class | Core ability summary |

|---|---|---|

| **The General** | Commander | $1 on negative GMI years. Classified collateral reveals on single Defence card (instead of 2-of-3). Stress –1 when depression/stress event resolves while holding any Defence asset. |

| **The Actuary** | Monk | Starts at stress 0. +2 effective loan capacity on Healthcare hybrid assets at stress 0; +1 at stress 1 (stacks with printed stress-linked capacity). Once/game: double any stress-reduction integration bonus (–1 becomes –2). |

| **The Researcher** | Alchemist | Once/game: reroll a Pharma trial die immediately after rolling (new result is final). Once/game: trigger a trial die on any non-Pharma asset at a 5–6 success threshold (vs standard 4–6). On success: +2 to all positive deltas permanently. On failure: –1 baseLoanCapacity permanently. |

 

---

 

## 6. One Mechanic Change

 

**The Geologist (formerly The Lobbyist):** GMI adjustment ability changed from **once per year** to **once per game**. All other mechanics unchanged.

 

---

 

## Schema Changes Required

 

1. Add `"DEFENCE"` to the `industry` enum.

2. Add `classifiedBonusCapacity` (optional integer) to the asset card schema.

3. No other schema changes are required — all new mechanics are expressed through existing field types (`SPECIAL` effectType, `industryMechanic` text, CEO `abilities` array).

