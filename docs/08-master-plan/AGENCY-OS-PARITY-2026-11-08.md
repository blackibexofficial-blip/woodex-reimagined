# Agency OS → woodex-reimagined parity review (2026-11-08)

Reference implementation: `woodex420/woodex-2030` @ branch `arena/01a10a97-woodex-2030` (analysis-only, never pushed to).
Screenshots supplied by the owner (2026-11-07/08) were cross-checked against both codebases. Every legacy dashboard screen was inventoried — 24 surfaces.

**Bottom line:** the reimagined admin already carries the architectural spine Agency OS pioneered (quotes → versioning/templates, quote→order conversion with audit, capability-checked RPCs, draft orders, returns/exchanges/claims). This round closed three gaps: the analysis itself, the **invoice ledger** (shipped, see PR #18) and **Tasks & follow-ups** (§16 below — landing as its own PR on this branch). The rest of the delta is cataloged below with honest effort estimates — none of it is silently skipped.

## Screen-by-screen verdict

| # | Legacy screen (woodex-2030) | Reimagined equivalent | Verdict |
|---|---|---|---|
| 1 | Dashboard — "Good morning, Woodex" + Today's draft nudge | `/admin/dashboard` | ✅ Live (different layout, KPIs real) |
| 2 | Analytics (exec revenue/leads/conv/campaign) | `/admin/analytics` | ✅ Live KPIs; **UTM campaign attribution not exposed** → see Backlog #1 |
| 3 | Marketing (first-party pixel, referrers, privacy notice) | — | ❌ Backlog #1 — first-party pixel is *storefront* scope, not dashboard |
| 4 | Website Studio (page list + section library) | `/admin/pages` + `/admin/page-editor` (Puck) | ✅ Functionally covered (Puck > their block builder) |
| 5 | Theme Studio | — | ❌ Deliberately skipped — no redesign request; brand tokens are code |
| 6 | Ecommerce overview (control center: products / active / needs attention / outstanding invoices) | `/admin/dashboard` → **Pipeline control center** | ✅ **Parity closed (2026-11-08)** — four linked tiles (open pipeline + PKR value → quotes · outstanding invoices → invoices · returns awaiting handling + new leads → returns · published pages → pages); rides `admin_overview` in hosted mode (no new RPC, no migration), demo computes identical signals; e2e +4 asserts (46/46) |
| 7 | Orders | `/admin/orders` | ✅ Live |
| 8 | Order Detail | `/admin/orders` (inline) | ✅ Parity (their dedicated route not needed) |
| 9 | Furniture Catalog (grid + in-stock filters) | `/admin/products`, `/admin/bulk-editor` (CSV round-trip added 2026-11-07) | ✅ Covered |
| 10 | ProductEditor / ProductDetail | `/admin/products` (+create/duplicate/bulk) | ✅ Live |
| 11 | **Invoices & Payments** | **`/admin/invoices` (shipped this branch)** | ✅ **Parity closed** — KPI strip, status chips (Issued/Partially paid/Paid/Overdue/Cancelled), from-quote issuance (idempotent RPC), finance-only payment posting, printable document at `/admin/invoice-document/:id`, 6 rehearsal asserts |
| 12 | Quotations queue + E-Quotation builder + preview | `/admin/quotes`, `/admin/quote/:id` | ✅ Ported (PR #17). Differences kept: 8-stage lifecycle (not Viewed/Negotiation), full-page builder → dialog (UX), preview modal → print page. Owner re-approved implicitly 2026-11-08 by pasting the same screens back and asking for the upgrade. |
| 13 | Clients (identity resolution, score, merge-review) | `/admin/customers` | 🟡 List/detail live; **merge-review + score not built** → Backlog #3. Legacy documents the rule: "ambiguity goes to a human" — we keep that. |
| 14 | CRM — Lead Pipeline (drag kanban, site visits, win rate) | `/admin/leads` (table + quote action) | 🟡 Read-side live; **drag kanban + site-visit tab** → Backlog #4 (needs UX decision, not new schema — `site_visits` exists in 0001) |
| 15 | Shared Inbox (WhatsApp/call/email, 0 unread) | — | ❌ Backlog #5 — **realtime explicitly deferred**; poll-based v1 possible but low value until channel EFs exist |
| 16 | Tasks & follow-ups (list/board/calendar, KPI strip) | `/admin/tasks` | ✅ **Parity closed (2026-11-08)** — KPI strip (Open / Due today / Overdue / Completed), All/Open/Done chips, search, three views (List table · Open/Done board · month-grid due-date calendar), New-task dialog (title/client/due/priority/owner), Complete/Reopen per row; ledger posture: working, never deleting. 3 new rehearsal asserts (sales read+create · viewer denied · editor denied) |
| 17 | Projects — Interior Projects (overview/BOQ/milestones/files/design/site visit/production/installation) | `/admin/projects` | 🟡 CRUD live, **BOQ/milestones/tabs not built** → Backlog #7 (largest single item) |
| 18 | Returns | `/admin/returns` | ✅ Live |
| 19 | Settings | `/admin/settings` | ✅ Live |
| 20 | Login | `/admin/login` | ✅ Live |
| 21 | Ecommerce "needs attention" panel | `/admin/dashboard` → control-center “Needs attention” tile | ✅ Shipped with the control center (2026-11-08) |
| 22 | Quotations quote→invoice (invoice ledger entries from quoting screen) | `/admin/invoices` + from-quote dialog | ✅ closed (same slice as #11) |
| 23 | Campaign analytics ties to CRM win rate | — | ❌ Backlog #1 |
| 24 | Suppliers / POs / transfers | `/admin/suppliers`, `/admin/purchase-orders`, `/admin/transfers` | ✅ Beyond-legacy (already there; demo seeds exist) |

## Prioritised backlog (not started, none of it silently dropped)

1. **Marketing attribution surface** — leads already capture utm/landing/referrer; build the campaign-analytics view (spend/Cpl/roas optional; first-party only, NO pixels until owner decides). Est. 1–2 d. No schema changes.
2. ~~**Ecommerce control-center card**~~ **SHIPPED 2026-11-08** — `Pipeline control center` card on `/admin/dashboard`: open pipeline + value, outstanding invoices, returns awaiting handling + new leads, published pages; rides `admin_overview` (supabase) / seeded store (demo); no migration; e2e 46/46.
3. **Clients CRM depth** — merge-review queue (`client_links`, `client_merge` RPC exists) + source attribution + score surfaced on customer detail. Est. 1–2 d. NO auto-merges.
4. **Lead pipeline UX** — drag-drop kanban over the existing Leads adapter + site-visit tab (`site_visits` table + RLS ready in 0001). Est. 1 d. UX sign-off wanted.
5. **Shared inbox v1 (poll-based)** — inbox/threads tables exist; v1 = read + reply log, NO realtime (post-activation). Low value pre-hosting; park until a channel EF exists. Est. 2–3 d. DO NOT build realtime now.
6. ~~**Tasks & follow-ups**~~ **SHIPPED 2026-11-08** — full port: KPI strip, chips, search, List/Board/Calendar tabs, new-task dialog, complete/reopen; rides 0001 `tasks` RLS (`crm.manage`); rehearsal 56 → **59/59**. (PR opened on this branch; owner-gated.)
7. **Interior Projects depth** — BOQ/milestones/files/production tabs against `projects` payload; largest single backlog item (~1–2 wks). Needs owner UX sign-off before build.

## Decisions recorded this review (do not re-litigate)

- **No POS.** The 2026-11-07 skip stands — the Ecommerce screen in Agency OS is a catalog/orders control center, not a register; the register is still out of scope.
- **No new migration for invoices.** 0001 already ships `invoices`/`payments` + `quote_invoice_snapshot` (idempotent, cap quote.manage) + `invoice_apply_payment` (cap finance.manage, auto status flip) and the payments policies are **finance-only reads**. The invoice surface here is adapter+UI; nothing was created hosted-side.
- **The 0001 snapshot RPC IS lossy** (invoice lands with subtotal=total=quote.total; discount/shipping breakdown not carried). Deliberate this round: fix requires a CREATE OR REPLACE of the RPC (would be migration 0012) — owner hasn't signed that off; labeled in code comments as "Phase-2 candidate".
- **Control-center card adds zero RPCs.** `admin_overview` already emits `pending_invoices`/`open_quotes`/`pipeline_value`/`overdue_returns`/`published_pages` — the card passes it through. Demo store computes the same signals seeded (QOT-1001 sent → open). Bagisto baseline: zeros + comment (never invented). **Flagged, not fixed:** 0001's open-quotes count compares Title Case (`'Draft','Sent','Review'`) while quote statuses in-code are lowercase — hosted `open_quotes` may under-count until casing is reconciled (candidate for 0012 or a quote-status audit; needs hosted verification, owner-gated).
- **Tasks ride plain RLS, not RPCs.** 0001 `tasks_read`/`insert`/`update` = `has_cap('crm.manage')` (sales holds it); **no `tasks_delete` policy exists** — worked, never deleted, matching ledger posture. Free-text client labels are deliberately demo-only: hosted mode has `client_id` (FK) and no label column, so the Supabase adapter surfaces related refs (quote/order/lead/site-visit) instead of inventing one; code comments say so. Demo seeds: TSK-1001 (Clifton Villa 9, overdue, normal), TSK-1002 (Gulberg Residency, due today, high).
- **Invoice numbering:** legacy INV-26-#### with year prefix dropped — uses identity (INV-1001+) matching REF discipline elsewhere.
- **No deletes on ledger documents.** Legacy's red-bin delete is not ported.
- **Demo mode:** invoices seeded (Issued + Partially paid + one logged payment) so the page is fully previewable offline.

## Honesty notes

- Nothing in this document is hosted-verified. Gates passing locally (e2e/rehearsal on pglite) prove logic, not the live project.
- The screenshots and legacy source are `woodex420/woodex-2030`, branch `arena/01a10a97-woodex-2030` — analysed at HEAD read on 2026-11-08; the legacy repo stays untouched.
- "Upgrade" ≠ mass deletion of our IA for theirs — we port capabilities, not layouts.
