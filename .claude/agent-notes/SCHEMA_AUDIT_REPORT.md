# Schema Reference Audit Report

**Date:** 2026-03-19
**Scope:** Comparison of `.claude/SCHEMA_REFERENCE.md` and `data/schema/card.schema.json` against actual card data files and engine enforcement code.

---

## Executive Summary

There are **significant discrepancies** between the schema reference/JSON schema and what the engine code and card data actually use. The schema appears to represent an earlier or idealized spec, while the engine and card data have evolved independently with different category systems, extra fields, and partial effect implementation.

**Critical mismatches found: 15 categories**
- Global event categories completely diverged (schema has 7, engine uses 10 — only 3 overlap)
- Personal event cards use a `category` field the schema doesn't define
- CEO cards have extra fields and archetypes not in the schema
- Engine only implements a subset of schema-defined effect types

---

## 1. Global Event Categories — CRITICAL MISMATCH

### Schema defines (`card.schema.json` → `globalEventCard.eventCategory`):
| Category | In Schema |
|---|---|
| BOOM | Yes |
| BUST | Yes |
| DEPRESSION | Yes |
| SUPPLY_SHOCK | Yes |
| REGULATORY | Yes |
| NEUTRAL | Yes |
| MARKET_DISRUPTION | Yes |

### Engine uses (`engine/deck.js` → `GLOBAL_EVENT_CATEGORY_RATIOS`):
| Category | Count | In Schema? |
|---|---|---|
| BOOM | 6 | Yes |
| BULL_RUN | 2 | **NO** |
| NEUTRAL | 10 | Yes |
| FLAT | 6 | **NO** |
| CORRECTION | 8 | **NO** |
| RECESSION | 6 | **NO** |
| DEPRESSION | 3 | Yes |
| BUBBLE | 3 | **NO** |
| STRESS_EVENT | 3 | **NO** |
| WILDCARD | 3 | **NO** |

### Missing from engine (defined in schema but not used):
- `BUST`, `SUPPLY_SHOCK`, `REGULATORY`, `MARKET_DISRUPTION`

### Action needed:
Either update the schema to match the engine's 10-category system, or reconcile the card data and engine to use the schema's 7 categories. The engine categories appear to be the **actual, implemented** system.

---

## 2. Personal Event Categories — CRITICAL MISMATCH

### Schema defines:
The schema does **not** define a `category` field on `personalEventCard`. Instead it defines `immediateEffect.effectType` with values:
- STRESS_CHANGE, CASH_CHANGE, DEATH_PREVENTION, DICE_MODIFIER, LOAN_RELIEF, MARKET_ACCESS, TAX_RELIEF, ASSET_VALUE_CHANGE, FORCE_SALE, SPECIAL

### Engine uses (`engine/deck.js` → `PERSONAL_EVENT_CATEGORY_RATIOS`):
The engine validates personal events by a **`category` field** not present in the schema:

| Category | Count | Maps to schema effectType? |
|---|---|---|
| STRESS_RELIEF | 16 | ~STRESS_CHANGE |
| DEATH_PREVENTION | 8 | ~DEATH_PREVENTION |
| CASH_WINDFALL | 6 | ~CASH_CHANGE (positive) |
| CASH_DRAIN | 4 | ~CASH_CHANGE (negative) |
| TAX_EVENT | 5 | ~TAX_RELIEF |
| LOAN_EVENT | 6 | ~LOAN_RELIEF |
| MARKET_MANIPULATION | 5 | ~MARKET_ACCESS |
| DICE_MODIFIER | 4 | ~DICE_MODIFIER |
| ASSET_EVENT | 2 | ~ASSET_VALUE_CHANGE |
| INFORMATION_SOCIAL | 4 | ~SPECIAL |
| LEGACY_EFFECT | 2 | ~SPECIAL |

### Card data (`data/cards/personal-event-cards.json`):
- Cards include a `"category"` field (e.g., `"STRESS_RELIEF"`, `"DEATH_PREVENTION"`) — **not in schema**
- Some cards use `"playTiming": "PASSIVE"` — schema only allows `IMMEDIATE` or `HOLD`

### Action needed:
Add `category` field to schema's `personalEventCard` definition with the engine's 11-value enum. Add `PASSIVE` to the `playTiming` enum if PASSIVE cards are intentional.

---

## 3. CEO Cards — CRITICAL MISMATCH

### 3a. Missing/extra archetypes

**Schema defines** (`archetype` enum):
- STARTER, HIGH_INCOME, DICE_MODIFIER, LOW_STRESS, MARKET_MANIPULATOR, AGGRESSIVE, PREDATOR

**Card data uses archetypes not in schema:**
| CEO Name | Archetype in Data | In Schema? |
|---|---|---|
| The Tax Attorney | TAX_SPECIALIST | **NO** |
| The Influencer | FAME_ENGINE | **NO** |
| The Operator | INTEGRATOR | **NO** |
| The Heir | OLD_MONEY | **NO** |
| The Short Seller | CONTRARIAN | **NO** |

### 3b. Extra fields on CEO cards (not in schema)

All CEO cards in `data/cards/ceo-cards.json` contain these fields that are **not defined** in `card.schema.json` and would fail `additionalProperties: false` validation:

| Field | Description |
|---|---|
| `t3AccessRule` | Rule for Tier 3 asset access |
| `selectionRule` | Rule for CEO selection/upgrade |
| `replacementRule` | Rule for CEO replacement after bankruptcy |
| `starterAsset` | Embedded starter asset object given to player on CEO selection |

### 3c. Missing required field: `ceoTier`

The schema marks `ceoTier` as **required**, but the card data may encode tier information differently or omit it.

### Action needed:
- Add `TAX_SPECIALIST`, `FAME_ENGINE`, `INTEGRATOR`, `OLD_MONEY`, `CONTRARIAN` to the archetype enum
- Add `t3AccessRule`, `selectionRule`, `replacementRule`, and `starterAsset` to the schema's `ceoCard` definition
- Verify `ceoTier` is present in all CEO card data

---

## 4. Global Event Cards — Extra Fields Not in Schema

### Fields present in card data but missing from schema:

| Field | Found In | Description |
|---|---|---|
| `gmiBase` | All global event cards | Base GMI value before die roll — schema uses `gmiDelta` instead |
| `gmiDieRoll` | Many cards | Die type for GMI calculation (e.g., `"d6"`) |
| `gmiDieMapping` | Some cards | Mapping of die results to GMI modifiers |
| `gmiDescription` | Many cards | Human-readable GMI effect description |
| `persistent` | Depression/Bubble cards | Boolean flag for multi-year persistence |
| `persistenceRule` | Depression/Bubble cards | Rules for how persistence works |
| `playerSetGMI` | Wildcard cards | Boolean — player sets GMI |
| `playerSetGMIRange` | Wildcard cards | Range for player-set GMI |
| `targetIndustry` | Some cards | Root-level industry targeting (schema only allows this inside `effects[]`) |

### Field name mismatch:
- **Schema requires:** `gmiDelta` (a single integer)
- **Data provides:** `gmiBase` + `gmiDieRoll` + optional `gmiDieMapping` (a calculated system)

### Action needed:
Replace `gmiDelta` in schema with `gmiBase`/`gmiDieRoll`/`gmiDieMapping` system, or add alongside. Add `persistent`, `persistenceRule`, `playerSetGMI`, `playerSetGMIRange`, and `targetIndustry` fields.

---

## 5. Personal Event Cards — Duplicate Cards

The following 12 cards appear **twice** (exact duplicates) in `data/cards/personal-event-cards.json`:

1. Therapist Session
2. Green Juice Cleanse
3. Weekend in Tuscany
4. Bought a Boat
5. Meditation App Subscription
6. Ignored All News
7. Personal Trainer
8. Early Retirement Consultant
9. Bribed the Right Doctor
10. Miracle Supplement Regimen
11. Found God Momentarily
12. The Numbers Looked Wrong

### Action needed:
Determine if duplicates are intentional (higher draw frequency) or a data error. If unintentional, remove duplicates and adjust deck ratios.

---

## 6. Engine Effect Type Implementation Gaps

### 6a. Vertical Integration / Cross-Industry Synergy effect types

**Schema defines 9 effect types:**
| effectType | Implemented in Engine? |
|---|---|
| LOAN_CAPACITY_BONUS | Yes |
| STRESS_REDUCTION | Yes |
| REPAYMENT_RELIEF | **No** |
| CRASH_FLOOR | **No** |
| INCOME_OFFSET | **No** |
| GMI_RESISTANCE | **No** |
| LOAN_RESTRUCTURE_FREE | **No** |
| VALUE_GROWTH_BOOST | **No** |
| SPECIAL | **No** |

### 6b. Global event effect types

**Schema defines 8 effect types:**
| effectType | Implemented in Engine? |
|---|---|
| STRESS_MODIFIER | Yes |
| MARKET_REFRESH | Yes (in turn.js) |
| DICE_MODIFIER | **No** |
| LOAN_PRESSURE | **No** |
| TAX_MODIFIER | **No** |
| REPAYMENT_MODIFIER | **No** |
| COLLATERAL_TRIGGER | **No** |
| INDUSTRY_SPECIFIC | Partial (bubble effects) |

### 6c. Personal event effect types

**Schema defines 10 effect types:**
| effectType | Implemented in Engine? |
|---|---|
| CASH_CHANGE | Yes |
| STRESS_CHANGE | Yes |
| DEATH_PREVENTION | **Logged only** |
| DICE_MODIFIER | **Logged only** |
| LOAN_RELIEF | **Logged only** |
| MARKET_ACCESS | **Logged only** |
| TAX_RELIEF | **Logged only** |
| ASSET_VALUE_CHANGE | **Logged only** |
| FORCE_SALE | **Logged only** |
| SPECIAL | **Logged only** |

### Action needed:
Implement missing effect type handlers in the engine, or remove unimplemented types from the schema if they are not intended for the current version.

---

## 7. Minor Discrepancies

| Item | Schema Says | Engine/Data Does | Severity |
|---|---|---|---|
| Death roll threshold fallback | min 4, max 10, default 6 | Falls back to `Infinity` when no CEO | LOW |
| `paymentOnTrigger` | Must be `1` (enum) | Engine reads value but doesn't validate it equals 1 | LOW |
| CEO dispatch | By `archetype` enum | By hardcoded `ceoName` string matching | MEDIUM |
| `PASSIVE` playTiming | Not in schema enum | Used in card data and engine comments | MEDIUM |
| SCHEMA_REFERENCE examples | Show `"cardType"` on all cards | Schema requires it — confirmed consistent | OK |
| Asset cards | — | No discrepancies found in asset card data | OK |

---

## 8. SCHEMA_REFERENCE.md vs card.schema.json

The reference doc at `.claude/SCHEMA_REFERENCE.md` is **consistent** with `card.schema.json` — both define the same field names, types, and enums. The reference doc accurately reflects the schema file. The problem is that **both are out of date** relative to the actual card data and engine code.

### Reference doc items that need updating:
- Global event category list (Section: Global event cards, Rule 1–3)
- CEO archetype list (Section: CEO cards)
- Personal event card structure (missing `category` field, `PASSIVE` timing)
- Asset card examples are correct and match schema

---

## Recommended Priority

1. **P0 — Schema alignment:** Update `card.schema.json` global event categories to match engine's 10-category system
2. **P0 — Schema alignment:** Add `category` field to personal event card schema
3. **P0 — Schema alignment:** Add missing CEO fields (`t3AccessRule`, `selectionRule`, `replacementRule`, `starterAsset`) and archetypes
4. **P0 — Schema alignment:** Replace `gmiDelta` with `gmiBase`/`gmiDieRoll` system in schema
5. **P1 — Engine gaps:** Implement missing integration effect types (7 of 9 unimplemented)
6. **P1 — Engine gaps:** Implement missing global event effect handlers (5 of 8 unimplemented)
7. **P1 — Engine gaps:** Implement missing personal event effect handlers (8 of 10 only logged)
8. **P2 — Data cleanup:** Resolve 12 duplicate personal event cards
9. **P2 — Docs:** Update `.claude/SCHEMA_REFERENCE.md` to match corrected schema
10. **P2 — Validation:** Add `PASSIVE` to `playTiming` enum or reclassify those cards
