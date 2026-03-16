# Borrow & Die — Card Schema Reference Guide v2

## Overview

There are four card types in the game:

| Type | File key | Purpose |
|---|---|---|
| `ASSET` | `assetCard` | Companies players own, borrow against, and score with |
| `CEO` | `ceoCard` | Player identity — income, stress floor, special abilities |
| `GLOBAL_EVENT` | `globalEventCard` | Shared annual events affecting all players and GMI |
| `PERSONAL_EVENT` | `personalEventCard` | Per-player annual draws — held, played, or sold |

All cards are validated against `card.schema.json`.

---

## Key Design Rules (must be followed when generating cards)

### Asset cards

1. `baseValueUpdateRule.outcomes` must cover 1–6 exactly once across all ranges.
2. `loanRepaymentRule.outcomes` must cover 1–6 exactly once. Range [6,6] MUST have `relief: true` (core rule).
3. `stress` must match tier: Tier 1 = 0–1, Tier 2 = 1–2, Tier 3 = 2–3.
4. `income` must match growth profile: Tier 3 high-growth = 0. Stable/infrastructure = 1–2.
5. `loanCapacityIncreasePer10AssetValue` approximates LTV: 5 ≈ 50%, 3 ≈ 30%, 7 ≈ 70%.
6. `verticalIntegrationRules` may have 0–2 entries. Each references an adjacent placement in the same industry.
7. `crossIndustrySynergies` max 1 per card.

### CEO cards

1. `ceoTier` 0 = starter (no upgrade requirement). 1 = requires owning 1 Tier 1 asset. 2 = requires owning 1 Tier 2 asset.
2. `maxAssetTier` is 2 for all Tier 0–1 CEOs. Only Tier 2 CEOs unlock Tier 3 assets.
3. `deathRollThreshold` defaults to 6. Only modified by specific archetypes (e.g. Bureaucrat = 8).
4. `laborPhaseRule.bonusIncomeRoll` trigger range [4,6] is the default per core rules.

### Global event cards

1. `gmiDelta` range: -5 (severe depression year) to +5 (exceptional boom).
2. `duration.years` > 1 only for DEPRESSION category cards.
3. Effects must apply to ALL players equally unless `effectType` is `INDUSTRY_SPECIFIC`.

### Personal event cards

1. `playTiming: IMMEDIATE` cards cannot be held or sold.
2. `playTiming: HOLD` cards may be played for effect or sold for `saleValue` (default $1).
3. Death prevention cards must have `deathRollEffect` defined.
4. `targetScope` must be explicit on every `immediateEffect`.

---

## Annotated Examples

### ASSET — Technology Tier 1 (starter, volatile, no income)

```json
{
  "cardType": "ASSET",
  "companyName": "GridRoot Systems",
  "industry": "TECHNOLOGY",
  "placement": "UPSTREAM",
  "tier": 1,
  "baseValue": 5,
  "stress": 1,
  "income": 0,
  "baseLoanCapacity": 1,
  "loanCapacityIncreasePer10AssetValue": 3,
  "baseValueUpdateRule": {
    "outcomes": [
      { "range": [1, 1], "delta": -3 },
      { "range": [2, 2], "delta": -1 },
      { "range": [3, 4], "delta": 1 },
      { "range": [5, 5], "delta": 3 },
      { "range": [6, 6], "delta": 5 }
    ],
    "industryMechanic": "Banks distrust standalone tech infrastructure. baseLoanCapacity is low until vertical integration is achieved."
  },
  "loanRepaymentRule": {
    "paymentOnTrigger": 1,
    "outcomes": [
      { "range": [1, 2], "trigger": true,  "relief": false },
      { "range": [3, 5], "trigger": false, "relief": false },
      { "range": [6, 6], "trigger": false, "relief": true  }
    ]
  },
  "verticalIntegrationRules": [
    {
      "requiresIndustry": "TECHNOLOGY",
      "requiresPlacement": "MIDSTREAM",
      "effectType": "LOAN_CAPACITY_BONUS",
      "effectMagnitude": 4,
      "effectDescription": "If you also own a TECHNOLOGY MIDSTREAM asset, this asset's loan capacity increases by 4. Lenders gain confidence in the stack.",
      "stressReduction": 0
    }
  ],
  "crossIndustrySynergies": [],
  "flavourText": "The pipes nobody sees. The margin nobody envies."
}
```

---

### ASSET — Real Estate Tier 1 (stable, high loan, income-generating)

```json
{
  "cardType": "ASSET",
  "companyName": "Terrace Holdings",
  "industry": "REAL_ESTATE",
  "placement": "DOWNSTREAM",
  "tier": 1,
  "baseValue": 6,
  "stress": 0,
  "income": 2,
  "baseLoanCapacity": 4,
  "loanCapacityIncreasePer10AssetValue": 6,
  "baseValueUpdateRule": {
    "outcomes": [
      { "range": [1, 1], "delta": -1 },
      { "range": [2, 3], "delta": 0 },
      { "range": [4, 5], "delta": 1 },
      { "range": [6, 6], "delta": 2 }
    ]
  },
  "loanRepaymentRule": {
    "paymentOnTrigger": 1,
    "outcomes": [
      { "range": [1, 1], "trigger": true,  "relief": false },
      { "range": [2, 5], "trigger": false, "relief": false },
      { "range": [6, 6], "trigger": false, "relief": true  }
    ]
  },
  "verticalIntegrationRules": [
    {
      "requiresIndustry": "REAL_ESTATE",
      "requiresPlacement": "MIDSTREAM",
      "effectType": "VALUE_GROWTH_BOOST",
      "effectMagnitude": 1,
      "effectDescription": "If you also own a REAL_ESTATE MIDSTREAM asset, add +1 to all positive delta outcomes on this asset's update roll.",
      "stressReduction": 0
    }
  ],
  "crossIndustrySynergies": [
    {
      "requiresIndustry": "FINANCE",
      "requiresPlacement": "MIDSTREAM",
      "effectType": "LOAN_CAPACITY_BONUS",
      "effectMagnitude": 3,
      "effectDescription": "If you also own a FINANCE MIDSTREAM asset, this asset's loan capacity increases by 3. Leveraged property fund unlocked."
    }
  ],
  "flavourText": "Cash flow is for people who haven't discovered equity."
}
```

---

### CEO — The Worker (starter)

```json
{
  "cardType": "CEO",
  "ceoName": "The Worker",
  "archetype": "STARTER",
  "ceoTier": 0,
  "annualIncome": 1,
  "startingStress": 0,
  "maxAssetTier": 2,
  "deathRollThreshold": 6,
  "laborPhaseRule": {
    "bonusIncomeRoll": {
      "triggerRange": [4, 6],
      "bonusAmount": 1
    },
    "heldCardSaleValue": 1
  },
  "abilities": [
    {
      "abilityType": "PASSIVE",
      "frequency": "ALWAYS",
      "description": "During the labor phase, roll d6 at year end. On 4–6, earn +$1 bonus income.",
      "stressEffect": 0
    },
    {
      "abilityType": "PASSIVE",
      "frequency": "ALWAYS",
      "description": "Held personal event cards may be sold for $1 each at any time.",
      "stressEffect": 0
    }
  ],
  "flavourText": "Still figuring out how money works."
}
```

---

### GLOBAL_EVENT — Depression

```json
{
  "cardType": "GLOBAL_EVENT",
  "eventName": "Credit Freeze",
  "eventCategory": "DEPRESSION",
  "gmiDelta": -3,
  "duration": {
    "years": 2,
    "durationRoll": {
      "die": "d3",
      "resultMapping": "1: 1 year, 2: 2 years, 3: 3 years"
    }
  },
  "effects": [
    {
      "effectType": "DICE_MODIFIER",
      "magnitude": -1,
      "description": "All asset value update rolls treat their result as 1 lower this year (minimum 1)."
    },
    {
      "effectType": "LOAN_PRESSURE",
      "description": "Any player whose total loans exceed 75% of their total asset value must immediately pay $1 or remove 1 loan token of their choice."
    }
  ],
  "flavourText": "The music stopped. Most people didn't have a chair."
}
```

---

### PERSONAL_EVENT — Death prevention (hold)

```json
{
  "cardType": "PERSONAL_EVENT",
  "eventName": "Green Juice Cleanse",
  "playTiming": "HOLD",
  "immediateEffect": {
    "effectType": "STRESS_CHANGE",
    "magnitude": -1,
    "description": "When played, reduce your stress by 1.",
    "targetScope": "SELF"
  },
  "deathRollEffect": {
    "effectType": "NEGATE_DEATH_ROLL",
    "description": "Discard this card instead of making a death roll. You survive this year automatically. Quip: 'Not today. I just started a new wellness routine.'"
  },
  "saleValue": 1,
  "flavourText": "Cold-pressed. Small-batch. Completely ineffective against leveraged debt."
}
```

---

### PERSONAL_EVENT — Immediate negative event

```json
{
  "cardType": "PERSONAL_EVENT",
  "eventName": "Audited",
  "playTiming": "IMMEDIATE",
  "immediateEffect": {
    "effectType": "TAX_RELIEF",
    "magnitude": -2,
    "description": "Immediately pay $2 in taxes (cannot be offset by loans this turn). If you cannot pay, gain +1 stress instead.",
    "targetScope": "SELF"
  },
  "saleValue": 1,
  "flavourText": "Turns out 'aggressive tax planning' has a legal definition."
}
```

---

## LTV Reference Table

| `loanCapacityIncreasePer10AssetValue` | Approximate LTV | Typical use |
|---|---|---|
| 7 | ~70% | Real estate Tier 1, infrastructure |
| 6 | ~60% | Real estate Tier 2, energy |
| 5 | ~50% | Manufacturing, finance |
| 4 | ~40% | Media, energy Tier 3 |
| 3 | ~30% | Technology Tier 1–2 |
| 2 | ~20% | Technology standalone Tier 3 |

## Stress Reference Table

| Tier | Stress range | Effect |
|---|---|---|
| Tier 1 | 0–1 | Safe. Can hold indefinitely. |
| Tier 2 | 1–2 | Manageable. Monitor carefully. |
| Tier 3 | 2–3 | Dangerous. Full T3 stack risks death roll at acquisition. |

## Income Reference Table

| Industry profile | Typical income | Tax pressure |
|---|---|---|
| Technology (all tiers) | 0 | None |
| Media (volatile years) | 0–1 | Low |
| Manufacturing | 1 | Moderate |
| Finance | 1–2 | Moderate |
| Energy | 1–2 | High |
| Real estate | 2 | High |
