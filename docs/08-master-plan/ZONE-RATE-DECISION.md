# Delivery pricing decision brief — flat fee vs delivery zones (2026-11-07)

**Status: DECISION REQUIRED (owner). Nothing in this document is implemented.**
**Companion doc:** `docs/08-master-plan/ANTI-ABUSE-DECISION.md` (same decision-brief format;
arrives on main via the anti-abuse docs PR).

---

## 1. Current state (as of `arena/ee488920-woodex-reimagined`)

- **Checkout display** (`src/config/shipping.ts`): `FLAT_DELIVERY_FEE_PKR = 2500`,
  `FREE_DELIVERY_AT_PKR = 50000`. `deliveryFeeFor(subtotal)` = 0 at/above the threshold,
  else Rs 2,500. `Checkout.tsx` imports this for display; `grandTotal` shown to the buyer.
- **Server authority** (`order_submit`, migration 0005): the SAME rule re-computed in
  Postgres — client-sent shipping is ignored. This dual-source arrangement is deliberate
  (client = display only; server = authority) and is documented in both files.
- **Quote-converted orders** (migration 0004) carry the *quote's own* negotiated
  shipping and never pass through `deliveryFeeFor` — any fee change here does not
  retroactively touch them.
- **Cities today:** the checkout dropdown hardcodes 12 cities (Lahore, Karachi,
  Islamabad, Rawalpindi, Faisalabad, Multan, Peshawar, Quetta, Sialkot, Gujranwala,
  Hyderabad, Bahawalpur). Nothing about fees varies by city.
- **COD reality:** most storefront orders are cash-on-delivery with WhatsApp verification;
  the fee is quoted flat regardless of distance, deadhead cost, or item bulk (a 3-seater
  sofa freights nothing like an executive desk, yet both ship at Rs 2,500 or FREE).

## 2. Why decide now

Every real delivery cost signal the business already has — courier quotes, rider
distances, volumetric weight surcharges — is invisible to a single flat fee. Two
obvious failures exist today: (a) remote cities are subsidized (Lahore and Quetta
pay the same), (b) heavy multi-piece orders that qualify for free shipping at Rs 50k
can erase margin entirely on long deadheads. The fee is mirrored in two places
(`shipping.ts` ↔ 0005) so any change is a coordinated slice, not a constant tweak.

## 3. Options

### A. Keep the flat rule (launch posture)
Leave Rs 2,500 / FREE ≥ Rs 50,000 for the first operational month; measure real order
mix and freight invoices; revisit with data.
- **Pros:** zero code change; checkout copy, WhatsApp confirmations, and server logic
  all stay consistent; cheapest possible failure mode.
- **Cons:** margin leakage on remote/heavy orders persists; no upside case to close on.
- **When it's right:** if 90% of orders are Lahore/Karachi/Islamabad with average
  order value comfortably above Rs 50k, complexity isn't bought for much.

### B. City-tiered zones (recommended shape)
Three tiers keyed off the checkout `city` value (case-insensitive, trimmed; unknown
cities fall back to a `default` tier equal to today's rule):
- Tier 1 — hub cities (Lahore, Karachi, Islamabad, Rawalpindi): fee F1, FREE ≥ Rs 50,000
- Tier 2 — listed major cities (the other 8 in the dropdown): F2, FREE ≥ configurable
- Tier 3 — `default` (anything else): F3, FREE at a higher threshold or never
- **Data model:** `public.delivery_zones (city text primary key, tier text, fee numeric
  not null check (fee >= 0), free_at_subtotal numeric, active boolean not null default true,
  payload jsonb, updated_at timestamptz)` seeded with all 12 cities matching CURRENT
  behavior exactly (F = 2500, free_at = 50000 for every row, plus the `default` row) →
  deploy is behavior-preserving; owner then edits rates.
- **Server:** migration re-defines `order_submit` (0005 semantics preserved byte-for-byte
  except the shipping expression) to look the city up in `delivery_zones`
  (`coalesce(fee, default)`; `free_at_subtotal` null → never free or inherit global —
  decision asked). Replay (`client_ref`) unchanged. Rehearsed: fresh DB, seed parity,
  each tier, unknown-city fallback, threshold boundary, replay idempotency.
- **Client:** `src/config/shipping.ts` stays the display mirror but becomes a small
  typed table (city → fee/free_at) loaded from a generated constant — **or** stays a
  two-constant default until the owner supplies rates. Keep-in-sync comment remains.
- **Admin (optional, second slice):** Delivery zones screen under Operations
  (list + edit fee/free_at/active). Not required for launch — SQL edits are viable
  at this volume; the admin screen is the Wave 2/3-quality follow-on.
- **Pros:** preserves the proven threshold UX, closes the margin leak, small blast
  radius, replay/idempotency untouched, rollback = one UPDATE per row.
- **Cons:** one more RPC re-definition to maintain (0005 → 0006-equivalent numbering:
  would be migration 0007); dual-source parity continues; zones need a rates sheet
  from ops before they can be anything but all-2500.

### C. Threshold-only simplification
Remove the fee entirely; FREE delivery ≥ Rs 75,000, otherwise flat Rs 3,500.
- **Pros:** simplest possible copy ("Free delivery over Rs 75k"); pushes AOV up.
- **Cons:** unlisted-city cost problem persists; raising the free threshold may hurt
  conversion; same dual-source machinery as B with less upside.

### D. True freight calculation (courier API / volumetric weight)
Charge actual courier cost at checkout via SLA APIs (PostEx/Leopards/TCS et al.).
- **Reject at this stage:** every Pakistan courier integration is a contract + API +
  reconciliator project; checkout UX must stay instant; not verifiable in this
  environment. Revisit only with real freight invoice data in hand.

### E. Hybrid: keep checkout flat, freight-collect on remote/heavy
Fee logic stays as today; orders above an item count or to `default` tier are flagged
`freight_collect = true` and confirmed manually on WhatsApp before dispatch.
- **Pros:** zero math change at intake; honest for rare heavy remote orders.
- **Cons:** two order-pricing regimes in admin; support burden; not enforceable
  server-side without the same 0007 machinery.

## 4. Recommendation (input to the decision, not the decision)

**Option B with all-2500 seed** — i.e., ship the *machinery* with behavior identical
to today, under an additive migration, and let the owner flip rates once ops produces
the per-city cost sheet. This converts an open "future decision" into a one-command
data change, keeps launch risk at zero, and keeps the door open to option A’s
simplification later (delete the rows, keep the lookup). Reject D now; treat C/E as
fallbacks if B’s ops data never materializes.

## 5. Owner decisions requested

1. **Adopt B, and when?** (Or explicitly keep A until launch data exists.)
2. **Tier boundaries & seed rates** — ops to supply the rate sheet (per-city fee;
   per-tier or global free threshold; `default`-tier policy).
3. **Free-shipping threshold:** keep global Rs 50,000, or per-tier (hub free at 50k,
   others 75k/100k/never)?
4. **Admin screen:** now (screen + adapter wiring + rehearsal) or later (SQL-only
   edits acceptable at this volume)?
5. **Rollout parity for quotes:** quote-converted orders stay quote-shipping (confirm),
   unaffected by zones.
6. **Name the rate owner** (who updates `delivery_zones` and how often).

## 6. What each approval unlocks (my side)

- **"B with all-2500 seed" approved:** one slice — migration `0007` (`delivery_zones` +
  seed rows cloning today's behavior, including a `default` row), `order_submit`
  re-definition with the lookup, rehearsal extended (fresh-DB apply; every tier;
  unknown-city fallback; threshold boundaries 49,999/50,000 per tier; replay
  idempotency; `client_ref` replay unchanged), `src/config/shipping.ts` comment
  re-seeded from the same snapshot, runbook §1/§6/§8 updates. Nothing hosted — same
  caveat as everything else.
- **Admin screen approved:** second slice — Delivery zones screen (list + inline edit
  fee/free_at/active) wired through the AdminApi capability matrix (`catalog.manage`
  or a new `settings.manage` — needs the caps-model call).
- **"A until data exists" chosen:** nothing to build; this brief closes the open item
  in the runbook (§8 pointer updated to say "flat rule retained by decision").

## 7. Constraints that shape any implementation

- **Dual-source parity is mandatory** (client display ↔ 0005/0007 RPC). Any slice must
  update both in one commit, with the keep-in-sync comments refreshed.
- **Replay must stay idempotent** — `client_ref` calls must not re-charge a different
  fee if rates changed mid-replay. (The RPC reads rates at insert time inside the
  same transaction as today; replay short-circuits before fee math, so this holds.)
- **Backfill:** orders written before a rates change keep their stored shipping; no
  migration touches historical rows.
- **Hosted verification stays impossible** from the authoring sandbox — the slice is
  rehearsal-verified only; the hosted flip is owner-side via the runbook.
- **Migration numbering:** next free slot is `20261107000007_*.sql`.

*Figures, tiers, and boundaries are proposals — the rate sheet comes from ops, not
from this document. Nothing here has been executed.*
