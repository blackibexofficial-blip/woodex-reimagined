# 05 — Database audit

Status **in progress**, 2026-11-08. Inventory is derived from local root migrations, not actual hosted schema introspection. No credentials, real rows, hosted migration or production data were read or modified. `backend/supabase` is a separate reference; do not combine it blindly with root migrations. Selected local PGlite tests passed; this is not proof of production grants, real Postgres concurrency or Supabase Storage.

## Local migration and table inventory

There are 27 root migration files through `20261108000027_project_warranty_register.sql` (00021–00027 are unapplied local candidates). Static extraction finds **56 distinct public table names**, including the local 00017 `ai_usage_windows`; this is a code inventory, not an observed hosted count.

- Identity/access: `user_roles`, `user_profiles`.
- Catalogue: `categories`, `series`, `collections`, `brands`, `option_sets`, `materials`, `services`, `products`, `price_lists`, `bundles`, `sales_channels`, `showrooms`, `homepage_sections`.
- Inventory/procurement: `stock_movements`, `inventory_meta`, `stock_transfers`, `suppliers`, `purchase_orders`, `delivery_zones`.
- CRM/sales: `leads`, `clients`, `client_links`, `quotes`, `quote_versions`, `quote_templates`, `orders`, `order_events`, `draft_orders`, `site_visits`, `tasks`.
- Finance/after-sales: `invoices`, `payments`, `returns`, `exchanges`, `claims`.
- CMS/content: `pages`, `page_blocks`, `page_versions`, `saved_sections`, `media_assets`, `blog_posts`, `projects`, `warranty_page`, `custom_design_page`, `virtual_showroom_page`.
- Other: `project_cost_codes`, `project_actuals`, `conversations`, `messages`, `track_events`, `app_settings`, `order_rate_limits`, `lead_rate_limits`, `ai_usage_windows`.

The static extraction can miss SQL created by dynamic execution or extension schemas. Actual hosted tables, columns, constraints, extra policies, indexes, triggers, function owners, granted roles, storage state and migration order must be inventoried on a separately authorized staging system.

## Root migration responsibilities

| Version | Local purpose / verification boundary |
|---|---|
| 00001 | Converged business tables, role/capability helpers, RLS and RPCs (`admin_overview`, inventory/order/quote/payment/client functions). |
| 00002 | Page snapshot/save/publish/revert and product-payload RPCs; later migrations replace selected definitions. |
| 00003–00007 | Order submission, quote conversion, shipping and order/lead rate limits; later definitions supersede earlier ones. |
| 00008–00012 | Draft orders, exchanges/claims, draft conversion, compare-at payload and corrected quote status casing in overview. |
| 00013–00014 | Project actuals/cost codes and private project storage bucket/policies. Hosted bucket contents/policies unknown. |
| 00015 | Local P0 page/project/public-order boundary and safe version recovery. |
| 00016 | Local accepted-state quote conversion gate; acceptance remains staff-editable, not independent approval. |
| 00017 | AI attempt quota windows and service-role-only reserve RPC; not a spend limit. |
| 00018–00019 | Local procurement read capability matrix and owner/staff settings projection. Requires owner field/role review. |
| 00020 | Local published-page-only snapshot projection. Raw public block props/theme may still include hidden sensitive content. |
| 00021 (candidate) | Local `before insert or update of payload` trigger on `projects` rejecting dispatch fields/positive dispatch progress unless `practice.production.qc.result = 'passed'`; only for new or changed production payloads, malformed shapes rejected, execute revoked. Not independent approval (an editor can self-record `passed`), no audit trail, no versioning, unapplied. |
| 00022 (candidate) | Adds `projects.revision` (optimistic concurrency) + `production_updated_by`, append-only `project_qc_inspections` and `project_production_events` (RLS read by `page.manage`/`crm.manage`/`finance.manage`, no client writes), and RPCs `project_qc_record` / `project_practice_save`. A new `passed` value is only accepted when backed by a recorded inspection; the save RPC derives QC server-side and rejects a stale revision (40001). Separation of duties: the last person to change the production stages is stamped in `production_updated_by` and cannot record the pass (`42501`); a failure from that user is still allowed. Database owner can still alter audit rows; unapplied. |
| 00023 (candidate) | Structural guard on `projects` payload: validates the practice collections and, only when the production block changes, stage names (five canonical keys, no duplicates), numeric percentages 0–100, QC result enum and text fields, and dispatch object/text fields. Unchanged legacy shapes stay editable and repairable; unknown dispatch keys are tolerated only as plain values. Unapplied; no data rewritten. |
| 00024 (candidate) | Order → production job link: `projects.order_id` (text, normalised `WDX-<n>`), a partial unique index so one order has at most one job, `project_link_order()` / `project_unlink_order()` (capability-checked, audit rows in `project_production_events`), `order_project()` read projection (progress, QC, dispatch) for the orders page, and a guard trigger so a payload patch cannot re-point a link. No hard FK (a cascade delete would destroy QC history). Dispatch never changes the order status; cancelled orders cannot start production. Unapplied. |
| 00025 (candidate) | Delivery/installation + warranty: append-only `project_handovers` (one delivery and one installation per job, no future or pre-2000 dates) and `project_warranties` (one active per job, 1–120 months, runs from the installation date, cancelled rows kept). RPCs `project_handover_record`, `project_warranty_open`, `project_warranty_cancel` require `page.manage`, enforce the sequence QC pass → dispatch → delivery → installation → warranty, and write audit rows; `project_post_dispatch()` is a read projection with a **derived** state (`none|active|expired|cancelled`), never a typed value. No proof files or claim workflow. Unapplied. |
| 00026 (candidate) | Warranty claims: `project_warranty_claims` (summary ≤200, details ≤2000, status `open|scheduled|resolved|rejected`, resolution and closure time) plus `project_warranty_claim_open()` (only against a LIVE warranty — not cancelled, not expired, claim date ≥ start, never future) and `project_warranty_claim_update()` (explicit transitions, resolution note required to resolve/reject, terminal states). Read policy for staff capabilities, all writes via RPC, audit rows `warranty_claim_opened`/`warranty_claim_status`. No cost, inventory or customer-portal link. Unapplied. |
| 00027 (candidate) | Read-only `project_warranty_register(p_days_ahead)` projection: one row per job with a warranty or a claim, with the derived state (`none|active|expired|cancelled`), days remaining (negative when expired), an `expiring_soon` flag inside a 0–365 day window, open/total claim counts and the handover dates. No writes, no stored state. Unapplied. |

## Relationships and integrity findings

- Local `quotes.lead_id`, `invoices.quote_id`/`order_id`, task links, visit lead/client links and project actual foreign keys provide some trace. `client_links` is polymorphic (`entity`, `entity_id`); copied customer/item JSON in orders/quotes is not a universal enforced entity chain. Product/order/project/customer journey identity is incomplete.
- Supabase `createSiteVisit` performs client creation and lead link separately and only logs a failure to link; orphan/duplicate risk requires a synthetic reproduction and an atomic design. Do not auto-merge real customer identities.
- Quote conversion is locked and accepted-state-gated locally; accepted status is staff-editable and accepted pricing not frozen. Real independent-connection concurrency and stock/receipt reconciliation are not proven by PGlite.
- Order replay references are not currently a secure payload-bound recovery credential. A known reference can still expose limited order details; page-local locks are not transaction-level idempotency.
- Settings merge is last-writer-wins; procurement role/field policies, extra permissive RLS policies and service-role consumers require explicit owner review.
- Published snapshot projection is not sanitization: nested props/theme including visually hidden content are public. Transactional slug collision prevention, supported block validation, caching and open-page invalidation remain open.
- Rate limits, trusted client IP/WAF, abuse posture and actual Edge deployment/version compatibility require authorized staging. Strict mode is opt-in locally, not known active.

## Test evidence and next steps

Current local synthetic PGlite: P0 32/32, page/quote workflows 28/28, procurement 38/38, settings 36/36, CMS boundary 21/21, production QC boundary 21/21, production QC records/audit/revision 60/60, order→job link 32/32, handover/warranty 37/37, warranty claims 30/30, warranty register 16/16, production shape guard 37/37. Tests use isolated local fixtures and stubbed Auth; they do not establish real hosted RLS, independent Postgres connections, production contents, backups or rollback. Review `03_WOODEX_BUGS_AND_ROOT_CAUSES.md`, and obtain owner approval, a staging schema inventory and verified backup/restore before applying any migration. Use additive/reversible reviewed changes and avoid rewriting real rows.
