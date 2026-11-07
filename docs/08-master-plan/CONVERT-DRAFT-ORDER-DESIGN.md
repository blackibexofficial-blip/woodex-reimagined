# Convert draft → order — design (owner sign-off REQUIRED; not implemented)

*Purpose: make the owner gate concrete. Nothing in this document is wired; the adapter still
rejects `convertDraftOrder` with a deterministic `SupabaseUnsupportedError`. This doc exists so the
sign-off decision is informed, and so implementation (when approved) starts from a spec, not a blank
page. Written 2026-11-07 against `main` = `474787c` (0001–0009 merged; hosted project has NOT executed
0001–0009 anywhere — no Supabase egress in this environment).*

## Goal

Let an authorised staff actor turn a staff-held **draft order** (`public.draft_orders`, Wave 2 / migration
0008, identity 1001, `DRF-####` refs) into a **real order** through the same server-authoritative path a
public checkout uses — so a draft can never become an order carrying client-invented prices, bad stock,
or double conversion.

## Non-negotiables (carried from the 2026-11-07 decisions)

1. **No client prices are ever authoritative.** Recompute every line from the catalogue inside the
   server path; the draft's `subtotal`/`total` remain display caches. The one allowed exception —
   **negotiated line price for staff holding `order.manage`** — is a decision point for you (see below),
   and where allowed it is an explicit, audited line override, never a silently trusted row.
2. **Stock is checked and reserved inside one transaction** (same pattern as `order_submit` in 0003/0005/0007):
   `FOR UPDATE` on the product rows, `inventory_apply`-style decrement with reason `'order submit'`, full
   rollback on any shortfall — **no partial conversion** ever persists.
3. **Replay-safe.** `DRF-####` flips `status: 'draft' → 'converted'` and stamps `converted_order_id` with the
   new order's ref **inside the same transaction**. A second call for the same draft is a hard no-op
   returning the original order ref (not an error storm on a double-clicked button).
4. **Cap check first.** `require_cap('order.manage')` inside the RPC (same pattern as 0004 `quote_convert`).
   No order.manage → `42501` and nothing happens.
5. **Timeline.** `record_order_event(order_id, 'converted from DRF-#### by <actor>', 'note')` appended in the
   same transaction — the exchange/claims surfaces built in Wave 2b (0009) already depend on this exact
   `order_events` trail, and reusing it keeps one audit surface.
6. **Shipping is zone-authoritative.** Shipping comes from the same delivery-zone machinery as `order_submit`
   (0007): normalized city lookup (`default` fallback → constants), `free_at_subtotal = NULL` = never FREE.
   Draft `shipping` is ignored.
7. **Draft→order traceability.** `converted_order_id` stores the new order ref (e.g. `WDX-####`); the
   `draft_orders` row is retained forever (audit), never deleted by the conversion path.

## Shape of the implementation (when approved)

- **Migration 0010** `convert_draft_order` RPC, `security definer`, `order.manage`-gated, short transaction:
  1. Load draft row `FOR UPDATE`; reject unless `status = 'draft'` (return existing `converted_order_id`
     otherwise — idempotent).
  2. Recompute line prices from current catalogue (reuse the exact repricing path inside `order_submit`;
     extract shared PL/pgSQL or mirror the body — decide in review).
  3. Apply (optional) staff-negotiated price override per line iff caller had explicit `order.manage`.
  4. Recompute zone shipping from draft `city`; build the totals server-side.
  5. Stock transaction (`FOR UPDATE` products, decrement, reason `'draft convert'`).
  6. `insert into orders (...)` — same columns/defaults as `order_submit`.
  7. `update draft_orders set status='converted', converted_order_id=<new ref>, updated_at=now() where id=$1`.
  8. `record_order_event(...)` for the new order (+ a note on the draft row itself if we want one).
  9. Return the created order (or its ref + total recomputed) to the caller.
- **Adapter** (`src/api/supabase.ts`): `convertDraftOrder` stops rejecting and calls the RPC; demo adapter
  already implements its local-conversion flow — align outputs, keep optimistic UI.
- **Admin UI** (`src/admin/pages/Drafts.tsx` … wherever the convert button lives): before confirm, show a
  **reprice preview** modal: per-line catalogue vs draft price, recomputed totals, zone shipping line
  ("Dispatch-confirmed"), delta arrow, and the stock-shortfall list if any. Explicitly label: *totals will
  reprice to current catalogue on confirm*.
- **Verification**: extend the pglite rehearsal (identity/caps/idempotency/stock-failure/reprice deltas) —
  which is why the "commit the rehearsal into the repo" item is coupled to this; e2e admin smoke covering the
  convert path (button → preview → confirm → order opens in Orders workspace, draft marked converted).

## Explicit decision points for the owner (cannot be designed away)

1. **Negotiated line prices for staff:** honoured (audited per-line override, `order.manage`), or reprice
   everything to catalogue without exception?
2. **Reprice delta policy:** if catalogue moved since the draft was made, is staff confirmation expected
   regardless (preview shows delta), or must delta be zero / within a threshold / require re-enter?
3. **Stock shortfall:** hard fail all-or-nothing (current rule), or allow partial convert with backorder?
   (Recommended: all-or-nothing — matches `order_submit`.)
4. **Frontend preview modal:** required before confirm (recommended) or power-user skip?
5. **Commit the rehearsal into the repo** (`test:rehearsal` npm script) — effectively a prerequisite for
   trusting 0010; now is the natural time to decide.

## Effort & risk

Small–medium: one migration (RPC ~120 lines PL/pgSQL), adapter wiring (~30 lines), preview modal in Drafts UI,
rehearsal extension (+~30 asserts), e2e addition (+1 scenario). Risk profile mirrors `order_submit`/`quote_convert`
(both already live and rehearsed); money-path behaviour stays server-side. **No client value is ever trusted.**

## What remains impossible regardless

- Client-supplied prices influencing the order total (never, by this design).
- Converting the same draft twice (idempotent by construction).
- Converting without `order.manage` (42501).
- Partial stock writes (single transaction, rollback on any shortfall).
