# Borrow & Die — Consolidated Rule Set

## 1. Overview

Borrow & Die is played over approximately 10 rounds (years). Each round follows the same sequence. Players accumulate stress over time. The game ends when one player remains or rounds expire. Final portfolio value minus total taxes paid determines the winner.

---

## 2. Turn Sequence

### Phase 1 — Year Start (shared, once)

1. Draw the top global event card. Apply the GMI delta to all asset values according to each industry's GMI mechanic.
2. Refresh the market if required by the event card, or per standard replacement rules.
3. Follow any special rules when Bubble or Depression cards are activated

### Phase 2 — Auction (rotating order)

- Eight market cards are face-up. Players bid in turn order. Cards are replaced as purchased.
- CEOs are auctioned at game start with a minimum bid of $0.

### Phase 3 — Per-Player Actions (rotating order)

In your turn slot:
- Draw one personal event card. Resolve IMMEDIATE cards now. Hold HOLD and PASSIVE cards. These may be sold (unlimited per turn) or played (once per turn)
- Roll value updates for all owned assets (apply base delta, then GMI modifier per industry mechanic).

### Phase 4 — Settlement (rotating order)

Within your turn slot, manage your cashflow in any order:

1. Sell assets voluntarily if desired (loans must be moved to other assets or paid down)
2. Take out loans against owned assets (up to each asset's current loan capacity).
4. **Loan Interest Payment** (see Section 8) — pay interest on your assets loans +1 interest payment per 10 loans can be used to offset income in some cases.
5. Pay taxes on net income.
6. Forced sales if a collateral violation exists (asset value dropped below outstanding loans without cash on hand to pay off loans).
7. Death roll check if stress ≥ CEO's death threshold.

---

## 3. Income and Tax

Each asset generates income each year per its printed `income` value. CEO base income also applies.

**Tax rule:** If you only have $1 in income, no taxes. Income above $1 is taxed at 50% (rounded down). To offset taxable income, players draw loans against assets — loans can offset income, but only for certain ceo classes up to a certain amount. Assets with depreciating underlying assets (like manufacturing) can roll a dice to offset up to 50% of loans (1 or 2 loans on successful dice roll is 1 tax offset, 3-4 is 2 offset, etc)

**Example:** Total income $5, no loans drawn → tax on $5 → pay $2 (50% of $5 rounded down). Total income $5, $2 borrowed → successful tax offset dice roll  → net taxable income $2 → $1 above free threshold → pay $0 (50% of $1, rounded down).

---

## 4. Loans and Collateral

Each asset has:
- `baseLoanCapacity` — the minimum number of loan tokens it can hold. baseLoanCapacity <= assetValue
- `loanCapacityIncreasePer10AssetValue` — additional capacity earned per 10 points of current asset value (approximates LTV)

**Total loan capacity** = `baseLoanCapacity` + floor(currentValue / 10) × `loanCapacityIncreasePer10AssetValue`

Loan tokens can be placed on any asset up to its current total capacity. Borrowing $1 places one loan token. Repaying removes one token.

**Collateral violation:** If an asset's value drops below its outstanding loan tokens (i.e. loans exceed capacity), the player must immediately repay or sell the asset in a forced sale. Forced sales go to auction at current value; other players may bid. The selling player receives the sale price minus any outstanding loans on that asset.

**Loan capacity synergy bonuses — conditional only:** Flat loan capacity bonuses from integration or cross-industry synergies are prohibited. All bonuses must be conditional or scaling. See Section 10 for valid structures.

---

## 5. Stress and Death

**Stress** accumulates through:
- Purchasing T2 assets (stress per card as printed)
- Purchasing T3 assets (stress per card as printed)
- Bad GMI events (specific cards)
- Certain personal event draws
- Certain CEO risk abilities (e.g. The Trader's downside on a lower reroll)

**Death roll threshold:** When stress ≥ CEO's `deathRollThreshold` (default 6), the player makes a death roll at year end: roll d6. On 1, the player is eliminated. Their assets are liquidized to cover any outstanding loans. Final score is remaining asset value + 50% rounded down of remaining cash held

**Stress reduction:** Some integration bonuses, cross-industry synergies, personal event cards, and CEO abilities reduce stress. Stress cannot go below 0.

**Bankruptcy:** A player who cannot pay a mandatory cost (forced repayment, tax, forced sale shortfall) and has no assets to sell is bankrupt. They exit immediately. The Compliance Officer CEO raises the death threshold to 8. They may choose a new CEO the next year with its starter asset.

---

## 6. Asset Value Updates

Each year, after the GMI event resolves, every player rolls d6 for each owned asset and applies the delta from the `baseValueUpdateRule.outcomes` table. Then the GMI modifier is applied per the industry mechanic.

**Industry GMI mechanics:**

| Industry | GMI application |
|---|---|
| Real Estate | Apply GMI delta once, unchanged |
| Technology | GMI does not apply until vertical integration is complete; suppressed until stack is built |
| Manufacturing | Halve GMI delta, round toward zero |
| Finance | Apply once normally. On negative GMI: roll d6 — on 1–3, apply the negative delta a second time |
| Energy | Apply GMI delta twice. T3 assets apply it three times |
| Media/Entertainment | Buzz die: before every value roll, roll d6. 1–2 = bad buzz (roll twice, take lower). 3–6 = good buzz (roll twice, take higher). GMI does not separately apply — buzz die governs the outcome |
| Defence | Negative GMI: apply absolute value as a positive delta. Positive GMI: apply at half magnitude, rounded toward zero |

---

## 7. Vertical Integration and Synergies

**Vertical integration:** Each asset card lists integration bonuses that activate when the player owns another asset in the same industry at a specific placement (UPSTREAM, MIDSTREAM, DOWNSTREAM). Bonuses are stated on the card and are always conditional.

**Cross-industry synergies:** Each asset card may list one cross-industry synergy — a bonus that activates when the player owns an asset in a different industry at a specific placement. Max one synergy per card.

**Operator CEO (The Engineer):** Doubles all vertical integration stress reductions and allows simultaneous activation of one cross-industry synergy alongside an integration bonus.

---

## 8. The Loan Interest Payment

After individual loan repayment checks resolve in the Settlement phase, count total outstanding loan tokens across all of the player's assets.

**For every 10 loans held, generate 1 additional loan token (the Loan Interest Payment).**

The player must then either:
- Place each generated token on any owned asset with remaining loan capacity, or
- Pay $1 cash per token

Cash paid this way offsets taxable income for the current year dollar-for-dollar. It is not a net loss, but it consumes current liquidity.

**Scaling examples:**
- 9 loans → no interest tokens
- 10 loans → +1 token
- 19 loans → +1 token
- 20 loans → +2 tokens
- 30 loans → +3 tokens

**Sequencing:** The loan repayment occurs before taxes are paid, any interest paid with cash reduces one for one the tax owed in that turn.

**Design intent:** The Loan Interest Payment penalizes maximum leverage without making leverage unviable. Players who stay within manageable debt levels are unaffected. Players who borrow to the limit pay a compounding cost that erodes their cash position and forces loan token placement, which may accelerate future collateral violations. However absorbing loans into capacity allows for players to hold on to more cash to buy more assets.

---

## 9. Defence Industry — Special Rules

**Classified collateral:** Each Defence asset card has a printed `baseLoanCapacity` and a hidden `classifiedBonusCapacity`. When a player owns 2 or more Defence placements simultaneously, the classified bonus is revealed and permanently added to the `baseLoanCapacity` of all their Defence assets. The General CEO reduces this condition to 1-of-3.

**Prior-year GMI loan terms:** Defence loan interest payment shifts based on the previous year's GMI. After a negative GMI year:  any loan interest payments are reduced by one, and any loans taken are tax deductible ). After a positive GMI year: loan interest payments remain neutral and no loans are tax deductible that year.

---

## 10. Loan Capacity Synergy Bonuses — Rules

Flat `+X to baseLoanCapacity` bonuses with no condition are **prohibited**. All loan capacity bonuses granted by vertical integration rules or cross-industry synergies must use one of the following conditional or scaling structures:

**Portfolio breadth:**
> "Gain +X loan capacity for each [industry] asset you own."

**Asset growth threshold:**
> "Gain +X loan capacity. Gain an additional +X if this asset's current value exceeds [Y]."

**Stability over time:**
> "Gain +X loan capacity after N consecutive years without a downturn for this asset"

**Long-term compounding:**
> "Gain +X to this asset's loanCapacityIncreasePer10AssetValue instead of a flat bonus."

The chosen structure must be thematically motivated. A stable regulated utility earns trust over time. A diversified portfolio signals creditworthiness to lenders. A high-value strategic asset unlocks a new tier of financing. The condition should explain itself without referencing game mechanics.

---

## 11. Hybrid Cards

Hybrid cards count as two industry types simultaneously for vertical integration and cross-synergy eligibility. They are filed under one primary industry for GMI purposes. Their GMI mechanic is stated in the card's `industryMechanic` field and overrides the default industry behaviour.

**Ranger — Terrain Bonus:** The Hartfield Toll Road Network hybrid card carries the Terrain Bonus: if the owner holds assets from three or more different industries simultaneously, each of their assets gains +1 loan capacity (dynamic — activates and deactivates with the condition).

**Monk — Stress-Linked Loan Capacity:** Healthcare hybrid cards have dynamic loan capacity. Effective capacity = printed `baseLoanCapacity` minus 1 for every 2 stress the owner carries above 2. At stress 8+, the asset cannot be used as collateral. The Actuary CEO adds further loan capacity bonuses at low stress.

**Alchemist — Trial Die:** Pharma hybrid cards carry a one-time permanent bifurcation. Once per game per card, during the Settlement phase, the owner may roll d6 (the trial die). On 4–6 (success): permanently add +3 to all positive delta outcomes and raise the card's loan capacity to its stated post-trial value. On 1–3 (failure): permanently reduce the card's `baseLoanCapacity` by 2. GMI-immune pre-trial. Post-trial: success = GMI-sensitive, failure = GMI-resistant. The result is permanent and cannot be reversed.

---

## 12. Buzz Die (Media/Entertainment)

Before every value update roll on a Media/Entertainment asset, roll the buzz die (d6 separate from the value die):
- On 1–2 (bad buzz): roll the value die twice, take the lower result.
- On 3–6 (good buzz): roll the value die twice, take the higher result.

Integration bonuses may allow the owner to lock in good buzz (take the higher result regardless of the buzz die outcome). Scandal (Meridian Live Events card ability) forces bad buzz on a target asset. Inspiration (Nexus Broadcast card ability) forces good buzz on a target asset. Both must be declared before the buzz die is rolled. Pantheon Global Media is immune to Scandal.

---

## 13. CEO Rules

- CEOs are permanent player identities selected at game start by auction.
- Replaced only on bankruptcy or via specific card effects.
- Each CEO comes with a starter asset. The starter asset does not occupy an asset slot. It is discarded when the player's first market asset is purchased. On discard, one stated ability transfers to the first purchased asset.
- Exception: The Trustee's starter asset (Family Trust) occupies a full asset slot and is never discarded.
- **T3 access (standard):** Players may bid on Tier 3 assets once they own at least one Tier 2 asset. The Founder CEO has unrestricted T3 access from game start.

---

## 14. Global Events

Each year, one global event card is drawn. It sets the GMI delta and may apply additional effects. Event categories:

| Category | GMI direction | Persistence |
|---|---|---|
| Bull Run | Positive (large) | Single year |
| Boom | Positive (moderate) | Single year |
| Normal | Positive (small) | Single year |
| Flat | Near zero | Single year |
| Correction | Negative (small) | Single year |
| Recession | Negative (moderate) | Single year |
| Depression | Negative (large) | Persistent — stays face-up |
| Bubble | Positive bias on one industry | Persistent — pops on negative GMI |
| Stress Event | Negative + direct stress | Single year |
| Regulatory Event | Industry-specific effect | Single year |

**Depression persistence:** Depression cards remain face-up. Each year, the active player rolls d6 to attempt escape. Failed escape: all players gain +1 stress. Escape thresholds vary by card (Great Depression: 4–6, Debt Crisis: 5–6, Systemic Collapse: 6 only).

**Foresight (Duskfield Extraction Co.):** Once per year, before the GMI event card is drawn, the owner of this Energy T1 Upstream card may look at the top event card and return it to either the top or bottom of the deck without revealing it.

---

## 15. Personal Events

Drawn once per player per year. Three timing types:

- **IMMEDIATE:** Resolves on draw. Cannot be held or sold.
- **HOLD:** Kept in hand. Played at will for effect, or sold during settlement for $1 (default). Certain CEO and card effects raise the sale value to $2 or $3.
- **PASSIVE:** Always active while held. States a trigger condition for discard.

Death prevention cards: when a death roll is required, the player may discard a held death prevention card to negate the roll (NEGATE_DEATH_ROLL), reroll and take the better result (REROLL_DEATH), or reduce stress before the roll (REDUCE_DEATH_THRESHOLD).

---

## 16. Scoring

At game end:

**Players Final score = total current asset value - total loans outstanding + cash held on hand**
(note that dead players can not have loans outstanding forcing liquidization)

The player with the highest score wins. Tiebreaker rules are pending playtesting.

Eliminated players do not score.

---

## 17. Open questions (pending playtesting)

- Starting cash: $3 proposed, unconfirmed
- Tiebreaker rules for auctions and final scoring
- CEO reselection order after bankruptcy
- Systemic Collapse depression card — may need maximum duration cap
- GMI buy/sell pressure on market cards (currently disabled for v1)
- Conditional loan capacity synergy bonuses — exact wording to be confirmed on individual cards during card layout phase