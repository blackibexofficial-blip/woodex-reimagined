# Phase 1 — Order → production job linkage (design, not implemented)

**Status: implemented locally as candidate `20261108000024_project_order_linkage.sql`
plus adapter/UI changes; not applied to any hosted database.** The defaults below were
chosen so the feature could be built and tested; each is reversible and the owner can
overrule it before staging.

## Why

Today a production job is a free-standing row in `projects` (`payload.practice` holds
the stages, QC and dispatch). An order (`orders`, status
`pending → processing → shipped → delivered / cancelled`) knows its courier and
tracking number. Nothing connects the two:

- the workshop can build a job that no order asked for, and an order can ship with no
  production record;
- dispatch data recorded in the project does not update the order, and the order's
  courier fields are unrelated to the project's dispatch block;
- no page lets staff answer "which job is this order?" or "which order is this job?".

## What exists (checked in code)

| Fact | Where |
|---|---|
| `AdminOrder` has no project reference; status is a five-value union; lifecycle notes live in `AdminOrderEvent` | `src/api/types.ts` |
| `AdminProject` is identified by a text `id`; the sales channel has only a free-text `client` | `src/api/types.ts` |
| Practice/BOQ/milestones/stages/QC/dispatch all ride `projects.payload` | `src/api/demo/db.ts`, `src/api/supabase.ts` |
| Capabilities in use: `page.manage`, `crm.manage`, `quote.manage`, `order.manage`, `finance.manage`, … | migration grants |
| Candidate 00022 already writes an append-only `project_production_events` trail | `supabase/migrations/20261108000022_project_qc_records.sql` |

## Proposed shape

1. **Column, not payload.** `projects.order_id text null` with a partial unique index
   (`where order_id is not null`) so one order links to at most one job by default.
   A project without an order stays valid (legacy and internal jobs).
2. **Explicit link RPC.** `project_link_order(p_project_id, p_order_id)`:
   `page.manage` required; refuses when the project already has a different order,
   when the order does not exist or is `cancelled`, and reports a clear error instead
   of silently re-pointing. `project_unlink_order` clears it and records an event.
3. **Server-side guard.** A trigger rejects changing `order_id` from one non-null
   value to another without the RPC, so a payload patch cannot steal a job.
4. **Order-side view.** Read-only `order_project(order_id)` returning the linked
   project id, stage percentages, QC result and dispatch snapshot — so the orders page
   can show "In production · 60% · QC pending" without joining the JSON in the client.
5. **Demo parity.** `projects.orderId` in the demo store, same errors, same one-to-one
   rule; the orders page and the projects page both show the link.
6. **UI (minimal first cut).**
   - Orders page: a "Start production job" action on `processing` orders (and
     `pending` with an explicit confirm), which creates the project with title/client
     prefilled from the order.
   - Projects page: an "Order" chip linking to the order; a "Link existing job" action.
   - Practice dialog: read-only order line in the overview tab (order id, status,
     total), no editing there.

## What was built

| Piece | Where |
|---|---|
| `projects.order_id` + partial unique index (one job per order) | migration 00024 |
| `project_link_order()` / `project_unlink_order()` — `page.manage`, order existence, cancelled refusal, idempotent relink, audit rows | migration 00024 |
| Guard trigger: a payload/column patch cannot re-point an existing link (`42501`) | migration 00024 |
| `order_project()` projection (progress roll-up, QC, dispatch) | migration 00024 |
| Adapter methods `linkProjectOrder`, `unlinkProjectOrder`, `getOrderProduction` | `src/api/demo/db.ts`, `src/api/supabase.ts`, Bagisto throws 501 |
| "Start production job" + live link card in the order dialog | `src/admin/pages/Orders.tsx` |
| Order badge in the projects table, order line in the workspace overview | `src/admin/pages/Projects.tsx`, `ProjectPracticeDialog.tsx` |
| Evidence | `rehearsal/production-order-linkage.mjs` **32/32**, `e2e/phase1-order-project-linkage.mjs` **16/16** |

The created job is **inactive** (`active: false`, `status: draft` in Supabase), so an
internal workshop row never appears in the public portfolio, and `orderId` is never
written into `payload` — the workspace repair path would drop it there.

## Decisions taken to unblock the build (owner may overrule)

- **1 job per order** enforced by a partial unique index; a second job is refused, not
  silently merged.
- **Cancelled orders cannot start production** (`23514`); an existing job is not
  deleted or unlinked automatically when an order is cancelled.
- **Dispatch does not change the order status.** The link is informational; staff still
  move the order.
- **Unlink keeps everything**: the job, its stages, QC and inspection history; only the
  link is cleared and an `order_unlinked` audit row is written.
- **The link is a column, not payload**, and only the RPC (or an insert) can set it.

## Decisions this design deliberately leaves open

1. **Does dispatch change order status?** Options: none (just show the link), append an
   `AdminOrderEvent` note, or transition `processing → shipped` when a vehicle and
   challan reference exist. My recommendation: append an event and *offer* the
   transition, never automatic — production staff cannot know a parcel left the
   building.
2. **One job per order, or many?** Recommended default 1:1 with an explicit
   "consolidate orders into one job" path later; a job that spans two orders needs its
   own model (job ↔ order lines), not a second column.
3. **Which orders may start a job?** `pending`/`processing` only; `cancelled` and
   `delivered` refuse. Quote-converted orders behave the same as regular ones.
4. **Cancellation after linkage.** Recommended: unlink requires a reason that is
   recorded in the project event trail; the job is not deleted, because QC and
   inspection history must survive.

## Test plan (when approved)

- **PGlite candidate 00024:** link/unlink rules, one-to-one index, cancelled order
  refusal, non-`page.manage` denial (`42501`), trigger blocks a payload-only order id
  change, `order_project()` projection, rollback leaves projects and orders intact.
- **Demo browser:** order → job creation prefills client/title and shows the chip in
  both pages; a second link attempt is refused; dispatch save does not silently change
  order status; no page errors.
- **Regression:** the existing production suites (workspace, legacy payload, QC
  records, shape guard) plus the order/checkout suites must stay green, because the
  projects payload shape is shared.

## Risks

- The projects payload is the shared surface for production, QC and cost codes; a
  link column is safe, but a *payload* field would be normalised away by the workspace
  repair path and must not be used.
- Order status changes are customer-visible; any automatic transition is a business
  decision, not a side effect of a workshop save.
- Hosted behaviour is unverified: no staging apply has been done, and the RLS/policy
  state of `orders` and `projects` on the hosted project is still unknown.
