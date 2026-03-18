# Borrow & Die — Card Viewer: Feature Documentation

## Purpose

A standalone HTML/JS card viewer for all cards in the Borrow & Die card game. Loads card data from local JSON files, renders each card type with its correct visual layout, and lets the user browse, filter, and search the full card library. Intended for use during playtesting and development — not a rulebook, not a game engine. Just a clean, fast, browse-everything viewer.

---

## Data Sources

All JSON files live in the same directory as the HTML file. The viewer loads them on page load via `fetch()`.

| File | Card type(s) |
|---|---|
| `technology-cards.json` | ASSET (TECHNOLOGY) |
| `energy-cards.json` | ASSET (ENERGY) |
| `real-estate-cards.json` | ASSET (REAL_ESTATE) |
| `finance-cards.json` | ASSET (FINANCE) |
| `manufacturing-cards.json` | ASSET (MANUFACTURING) |
| `media-cards.json` | ASSET (MEDIA_ENTERTAINMENT) |
| `hybrid-cards.json` | ASSET (mixed industries) |
| `ceo-cards.json` | CEO |
| `global-event-cards.json` | GLOBAL_EVENT |
| `personal-event-cards.json` | PERSONAL_EVENT |

All files are JSON arrays. Each element is a single card object conforming to `card_schema.json`.

---

## Navigation Structure

Top-level tabs (always visible):

```
ASSETS | CEOs | GLOBAL EVENTS | PERSONAL EVENTS
```

### ASSETS tab

Secondary filter bar beneath the tab:

```
ALL | TECHNOLOGY | ENERGY | REAL ESTATE | FINANCE | MANUFACTURING | MEDIA | HYBRID
```

Tertiary filter (visible when an industry is selected, or always for ALL):

```
ALL TIERS | TIER 1 | TIER 2 | TIER 3
```

And a placement filter:

```
ALL | UPSTREAM | MIDSTREAM | DOWNSTREAM
```

Cards render in a responsive grid. Default sort: industry → tier → placement.

### CEOs tab

No sub-filters. Render all CEO cards in a single grid sorted by `annualIncome` ascending.

### GLOBAL EVENTS tab

Filter bar:

```
ALL | BOOM | BUST | DEPRESSION | SUPPLY_SHOCK | REGULATORY | NEUTRAL | MARKET_DISRUPTION
```

### PERSONAL EVENTS tab

Filter bar:

```
ALL | IMMEDIATE | HOLD | PASSIVE
```

---

## Search

A single search input appears above all tabs. It filters across all loaded cards in real time. Matching is case-insensitive and searches:
- `companyName` / `ceoName` / `eventName`
- `industry`
- `flavourText`
- All `description` fields in effects and abilities

Matching cards highlight the matched text. Non-matching cards are hidden. Switching tabs while a search is active shows only matching cards in the active tab.

---

## Card Layouts

Each card type has its own layout. All layouts share a base card shell:

```
┌──────────────────────────────────┐
│  HEADER ROW                      │
│  (card type badge + name)        │
├──────────────────────────────────┤
│  BODY                            │
│  (type-specific content)         │
├──────────────────────────────────┤
│  FLAVOUR TEXT                    │
└──────────────────────────────────┘
```

Card dimensions: 280px wide × auto height. Fixed width, variable height. Cards do not truncate content — they expand to show everything.

---

### ASSET Card Layout

```
┌──────────────────────────────────┐
│  [INDUSTRY badge]   [TIER badge] │
│  Company Name                    │
│  PLACEMENT                       │
├──────────────────────────────────┤
│  Base Value: $X  Stress: X       │
│  Income: $X/yr  Loan Cap: X      │
│  LTV: ~XX%                       │
├──────────────────────────────────┤
│  VALUE UPDATE ROLL               │
│  [d6 outcome table]              │
│  Industry mechanic (if any)      │
├──────────────────────────────────┤
│  LOAN REPAYMENT ROLL             │
│  [d6 outcome table]              │
├──────────────────────────────────┤
│  VERTICAL INTEGRATION            │
│  [each rule as a labeled block]  │
├──────────────────────────────────┤
│  CROSS-INDUSTRY SYNERGY          │
│  [if present]                    │
├──────────────────────────────────┤
│  "Flavour text here."            │
└──────────────────────────────────┘
```

**D6 outcome table** — rendered as a compact table:

| Roll | Outcome |
|---|---|
| 1 | −3 |
| 2 | −1 |
| 3–4 | +1 |
| 5 | +3 |
| 6 | +5 |

For the loan repayment table, the columns are Roll / Trigger / Relief. A ✓ or ✗ symbol in each column. The roll-of-6 relief row is visually highlighted (green tint or bold border).

**LTV display:** compute from `loanCapacityIncreasePer10AssetValue` using the reference table:
- 7 → ~70%, 6 → ~60%, 5 → ~50%, 4 → ~40%, 3 → ~30%, 2 → ~20%

**Integration blocks:** each `verticalIntegrationRule` and `crossIndustrySynergy` renders as a labeled pill row:

```
[REQUIRES: TECHNOLOGY MIDSTREAM]
+4 loan capacity if you own a TECHNOLOGY MIDSTREAM asset. Lenders gain confidence in the stack.
```

Cross-industry synergies use a different accent color to visually distinguish from same-industry integrations.

---

### CEO Card Layout

```
┌──────────────────────────────────┐
│  [CEO badge]                     │
│  CEO Name                        │
│  Archetype                       │
├──────────────────────────────────┤
│  Annual Income: $X               │
│  Starting Stress: X              │
│  Death Roll Threshold: X         │
├──────────────────────────────────┤
│  T3 ACCESS                       │
│  [t3AccessRule text]             │
├──────────────────────────────────┤
│  ABILITIES                       │
│  [each ability as a block]       │
│  Type: PASSIVE/ACTIVE  Freq: X   │
│  Stress effect: X (if non-zero)  │
├──────────────────────────────────┤
│  LABOR PHASE RULE                │
│  [bonusIncomeRoll details]       │
├──────────────────────────────────┤
│  STARTER ASSET                   │
│  [mini asset card — same layout  │
│   as ASSET card but inset]       │
├──────────────────────────────────┤
│  Selection: [selectionRule]      │
│  Replacement: [replacementRule]  │
├──────────────────────────────────┤
│  "Flavour text here."            │
└──────────────────────────────────┘
```

The starter asset is rendered as a nested, visually inset card using the same ASSET layout but at slightly reduced scale (90% or with an inset border). It should not look like a separate top-level card.

---

### GLOBAL EVENT Card Layout

```
┌──────────────────────────────────┐
│  [GLOBAL EVENT badge]            │
│  Event Name                      │
│  [eventCategory badge]           │
├──────────────────────────────────┤
│  GMI:  +X / −X  [gmiDescription]│
│  Die roll: d6 or None            │
│  Duration: X year(s)             │
│  [durationRoll if present]       │
├──────────────────────────────────┤
│  EFFECTS                         │
│  [each effect as a block]        │
│  Type badge + description text   │
│  Target industry (if any)        │
│  Magnitude (if any)              │
├──────────────────────────────────┤
│  "Flavour text here."            │
└──────────────────────────────────┘
```

GMI delta is displayed as a large, color-coded number: green for positive, red for negative, grey for zero.

Depression cards (persistent) get a distinct visual treatment: a "PERSISTENT — stays face-up" warning strip at the top of the card.

---

### PERSONAL EVENT Card Layout

```
┌──────────────────────────────────┐
│  [PERSONAL EVENT badge]          │
│  Event Name                      │
│  [playTiming badge: IMMEDIATE /  │
│   HOLD / PASSIVE]                │
├──────────────────────────────────┤
│  EFFECT                          │
│  Type badge + description        │
│  Magnitude (if any)              │
│  Target scope                    │
├──────────────────────────────────┤
│  DEATH ROLL EFFECT (if present)  │
│  Type badge + description        │
├──────────────────────────────────┤
│  Sale Value: $X  (HOLD only)     │
├──────────────────────────────────┤
│  "Flavour text here."            │
└──────────────────────────────────┘
```

IMMEDIATE cards are visually tagged in red/orange. HOLD cards in amber. PASSIVE cards in blue/teal. Death prevention cards get an additional "☠ DEATH PREVENTION" indicator in a distinct color.

---

## Visual Design System

Match the existing mockup aesthetic:

- **Background:** `#f5f4f0` (warm off-white)
- **Text:** `#1a1a18` (near-black)
- **Card background:** `#ffffff`
- **Card border:** `0.5px solid #c8c6bc`
- **Card shadow:** `0 1px 3px rgba(0,0,0,0.07)`
- **Font:** System font stack: `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`
- **Border radius:** 10px for cards, 99px for pills/badges
- **Nav active state:** `background #2c2c2a, color #fff`

### Industry accent colors

| Industry | Accent |
|---|---|
| TECHNOLOGY | `#4a7c9e` (steel blue) |
| ENERGY | `#b5651d` (burnt orange) |
| REAL_ESTATE | `#5a7a5a` (moss green) |
| FINANCE | `#5a5a8a` (slate purple) |
| MANUFACTURING | `#7a6a5a` (warm brown) |
| MEDIA_ENTERTAINMENT | `#8a5a7a` (dusty rose) |
| HYBRID | `#5a7a7a` (teal) |

### Tier badges

- Tier 1: grey background
- Tier 2: amber/gold background
- Tier 3: deep red/crimson background (stress warning implied)

### Stress indicator

Render stress as filled/unfilled pips (●/○), not just a number:
- 0 stress: `○○○`
- 1 stress: `●○○`
- 2 stress: `●●○`
- 3 stress: `●●●`

At stress 3, pip color turns red.

### GMI color coding

- Positive delta: `#2a7a2a` (green)
- Zero: `#888780` (grey)
- Negative: `#9a2a2a` (red)

---

## State Management

All state lives in JavaScript (no backend, no localStorage). On load:

1. Fetch all 10 JSON files in parallel via `Promise.all`
2. Concatenate into a single `allCards` array
3. Derive filter state from default values (tab = ASSETS, industry = ALL, tier = ALL, placement = ALL)
4. Render

Filter changes re-run the filter function over `allCards` and re-render the card grid. Search input debounced 150ms.

---

## Error Handling

- If a JSON file fails to load: show a non-blocking banner "Failed to load [filename] — some cards may be missing" and continue rendering with the cards that did load.
- If a card has an unexpected shape (missing required field): skip it silently but log a `console.warn` with the card name and missing field.
- Empty filter results: show a "No cards match these filters" message in the grid area with a "Clear filters" link.

---

## Card Count Display

Show a count label next to the active filter, e.g.:

```
Showing 7 cards  ·  TECHNOLOGY · TIER 2
```

This updates live as filters change.

---

## Expand / Collapse (optional enhancement)

For ASSET cards with long integration rule lists, consider a "Show more" toggle that initially shows only the first integration rule and reveals the rest on click. Not required for v1 — implement only if the card height becomes unwieldy in testing.

---

## Print Considerations (out of scope for v1)

Do not implement print layout in v1. A separate print stylesheet will be designed after the digital viewer is validated. Cards are not designed to be print-accurate in this viewer — they are for reference and playtesting communication only.

---

## File Structure

```
/
├── card-viewer.html        ← single file, all CSS + JS inline
├── card_schema.json
├── technology-cards.json
├── energy-cards.json
├── real-estate-cards.json
├── finance-cards.json
├── manufacturing-cards.json
├── media-cards.json
├── hybrid-cards.json
├── ceo-cards.json
├── global-event-cards.json
└── personal-event-cards.json
```

The viewer is a single self-contained HTML file. No build step. No external dependencies except Google Fonts (optional, falls back to system stack). Open in any modern browser from a local filesystem — `fetch()` calls will require either a local HTTP server or the `--allow-file-access-from-files` browser flag, which should be documented in a comment at the top of the HTML file.

---

## Out of Scope

The following are explicitly not part of this viewer:

- Game state tracking (stress levels, owned assets, loans)
- GMI simulation
- Turn sequence or year resolution
- CEO auction mechanics
- Death roll simulation
- Any multiplayer or networked features
- Mobile-optimised layout (desktop-first is fine for a dev tool)