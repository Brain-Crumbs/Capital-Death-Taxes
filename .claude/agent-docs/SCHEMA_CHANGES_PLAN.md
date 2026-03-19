# Schema Audit Implementation Plan

**Branch:** `claude/implement-schema-changes-4JanX`

This plan implements all changes from the Schema Audit Report (P0 + P1 + P2).

---

## Phase 1: P0 — Schema Alignment (card.schema.json)

### Step 1.1: Update global event categories
**File:** `data/schema/card.schema.json` → `globalEventCard.eventCategory`

Replace the 7-value enum:
```
BOOM, BUST, DEPRESSION, SUPPLY_SHOCK, REGULATORY, NEUTRAL, MARKET_DISRUPTION
```
With the engine's 10-category system:
```
BOOM, BULL_RUN, NEUTRAL, FLAT, CORRECTION, RECESSION, DEPRESSION, BUBBLE, STRESS_EVENT, WILDCARD
```

### Step 1.2: Replace `gmiDelta` with `gmiBase`/`gmiDieRoll` system
**File:** `data/schema/card.schema.json` → `globalEventCard`

Remove `gmiDelta` from required and properties. Add:
- `gmiBase` (integer, required) — base GMI value before die roll
- `gmiDieRoll` (string or null, enum: [null, "d3", "d6"]) — optional die type
- `gmiDieMapping` (string, optional) — human-readable mapping of die results
- `gmiDescription` (string, required) — human-readable GMI effect description

### Step 1.3: Add persistence fields to global event schema
**File:** `data/schema/card.schema.json` → `globalEventCard`

Add optional fields:
- `persistent` (boolean, default false) — multi-year event flag
- `persistenceRule` (string, optional) — rules for how persistence works
- `playerSetGMI` (boolean, default false) — player sets GMI flag
- `playerSetGMIRange` (array [min, max], optional) — range for player-set GMI
- `targetIndustry` (ref to industry, optional) — root-level industry targeting

### Step 1.4: Add `category` to personal event card schema
**File:** `data/schema/card.schema.json` → `personalEventCard`

Add required `category` field with 11-value enum:
```
STRESS_RELIEF, DEATH_PREVENTION, CASH_WINDFALL, CASH_DRAIN, TAX_EVENT,
LOAN_EVENT, MARKET_MANIPULATION, DICE_MODIFIER, ASSET_EVENT,
INFORMATION_SOCIAL, LEGACY_EFFECT
```

### Step 1.5: Add `PASSIVE` to `playTiming` enum
**File:** `data/schema/card.schema.json` → `personalEventCard.playTiming`

Change enum from `["IMMEDIATE", "HOLD"]` to `["IMMEDIATE", "HOLD", "PASSIVE"]`.

Add optional `passiveRule` field (string) for PASSIVE timing cards.

### Step 1.6: Update CEO card schema
**File:** `data/schema/card.schema.json` → `ceoCard`

**6a. Add missing archetypes to enum:**
```
STARTER, HIGH_INCOME, DICE_MODIFIER, LOW_STRESS, MARKET_MANIPULATOR,
AGGRESSIVE, PREDATOR, TAX_SPECIALIST, FAME_ENGINE, INTEGRATOR,
OLD_MONEY, CONTRARIAN
```

**6b. Add missing fields:**
- `t3AccessRule` (string, required) — rule for Tier 3 asset access
- `selectionRule` (string, required) — rule for CEO selection/upgrade
- `replacementRule` (string, required) — rule for CEO replacement after bankruptcy
- `starterAsset` (object, required) — embedded starter asset object (ref to assetCard or inline object)

**6c. Remove `ceoTier`, `maxAssetTier`, `upgradeRequirement` from required:**
These fields are not present in the actual card data. Remove from `required` array and mark as optional, or remove entirely. Since the card data doesn't use them and `t3AccessRule`/`selectionRule` provide the same information in text form, remove from required but keep as optional for backwards compatibility.

---

## Phase 2: P1 — Engine Effect Implementations

### Step 2.1: Implement integration effect types in `engine/integration.js`
Currently only LOAN_CAPACITY_BONUS and STRESS_REDUCTION are implemented. Add handlers for:

- **REPAYMENT_RELIEF** — Skip one loan repayment trigger per year on the integrated asset
- **CRASH_FLOOR** — Set a minimum delta floor during value updates (prevent value dropping below threshold)
- **INCOME_OFFSET** — Reduce taxable income from this asset by effectMagnitude
- **GMI_RESISTANCE** — Reduce GMI delta impact on this asset by effectMagnitude
- **LOAN_RESTRUCTURE_FREE** — Allow one free loan restructure (move tokens between assets) per year
- **VALUE_GROWTH_BOOST** — Add effectMagnitude bonus to positive deltas during value updates
- **SPECIAL** — Log and flag for manual resolution (these are unique per-card effects)

### Step 2.2: Implement global event effect handlers
**File:** `engine/events.js` and/or `engine/turn.js`

Currently STRESS_MODIFIER, MARKET_REFRESH, and INDUSTRY_SPECIFIC (bubble) are implemented. Add:

- **DICE_MODIFIER** — Modify all asset value roll results by magnitude this year
- **LOAN_PRESSURE** — Add magnitude loan tokens across player's most-leveraged assets
- **TAX_MODIFIER** — Modify tax rate or threshold by magnitude for this year
- **REPAYMENT_MODIFIER** — Shift loan repayment trigger ranges by magnitude
- **COLLATERAL_TRIGGER** — Force immediate collateral check on all assets

### Step 2.3: Implement personal event effect handlers
**File:** `engine/events.js`

Currently only CASH_CHANGE and STRESS_CHANGE have real logic. Implement:

- **DEATH_PREVENTION** — Mark player as having death prevention active (checked during death roll)
- **DICE_MODIFIER** — Modify player's next die roll by magnitude
- **LOAN_RELIEF** — Remove magnitude loan tokens from target asset
- **MARKET_ACCESS** — Grant player priority or extra auction access
- **TAX_RELIEF** — Reduce player's tax liability by magnitude this year
- **ASSET_VALUE_CHANGE** — Directly modify target asset's value by magnitude
- **FORCE_SALE** — Force target player to sell their lowest/highest value asset
- **SPECIAL** — Log and flag for manual resolution

### Step 2.4: Implement death roll interception
**File:** `engine/stress.js` → `checkDeathRoll()`

Add checks for held personal event cards with `deathRollEffect`:
- **NEGATE_DEATH_ROLL** — Auto-survive, consume the card
- **REROLL_DEATH** — Roll again, take better result, consume the card
- **REDUCE_DEATH_THRESHOLD** — Temporarily reduce stress by magnitude before roll, consume the card

---

## Phase 3: P2 — Data Cleanup & Documentation

### Step 3.1: Remove duplicate personal event cards
**File:** `data/cards/personal-event-cards.json`

Remove the 12 duplicate cards (entries 2 of each pair):
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

Update `engine/deck.js` → `PERSONAL_EVENT_CATEGORY_RATIOS` counts if needed to match remaining card counts.

### Step 3.2: Update SCHEMA_REFERENCE.md
**File:** `.claude/SCHEMA_REFERENCE.md`

Update to reflect all schema changes:
- Global event category list (10 categories)
- CEO archetype list (12 archetypes)
- Personal event card structure (add `category` field, `PASSIVE` timing, `passiveRule`)
- Global event GMI fields (`gmiBase`/`gmiDieRoll` system replacing `gmiDelta`)
- CEO fields (`t3AccessRule`, `selectionRule`, `replacementRule`, `starterAsset`)
- Remove/mark-optional `ceoTier`, `maxAssetTier`, `upgradeRequirement`

### Step 3.3: Update deck ratio validation
**File:** `engine/deck.js`

Ensure `PERSONAL_EVENT_CATEGORY_RATIOS` counts match the actual card counts after duplicate removal. Verify `GLOBAL_EVENT_CATEGORY_RATIOS` matches the 54 global event cards.

---

## Execution Order

1. **Phase 1** first — schema alignment is the foundation
2. **Phase 3.1** (duplicate removal) — clean data before implementing effects
3. **Phase 2** — engine implementations against clean schema and data
4. **Phase 3.2-3.3** — documentation and validation updates last

## Files Modified

| File | Changes |
|---|---|
| `data/schema/card.schema.json` | Major: categories, fields, enums, structure |
| `data/cards/personal-event-cards.json` | Remove 12 duplicate cards |
| `engine/integration.js` | Add 7 effect type handlers |
| `engine/events.js` | Add 8 personal event effect handlers |
| `engine/turn.js` | Add 5 global event effect handlers |
| `engine/stress.js` | Add death roll interception (3 types) |
| `engine/deck.js` | Update category ratio counts |
| `.claude/SCHEMA_REFERENCE.md` | Full documentation update |
