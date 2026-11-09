# WOODEX Business OS — requirements verification report

**Date:** 2026-11-08 · **Scope:** the current local working tree on `arena/6bd5a1db-woodex-reimagined`, including uncommitted follow-up work. This report checks the user's sections 3.1, 3.2, 4.1 and 4.2; it is not a production audit or release approval.

## Executive finding

**Yes — the requested Business OS is still incomplete.** There are substantial storefront, admin and demo workflows, and some local SQL/adapter implementations, but the required end-to-end customer journey, all requested navigation groups, and the accurate configurable dashboard are not complete. A working page or a local test is not proof that a module is complete in production. The only new execution in this report was one synthetic local browser probe of the analytics defect below; all other item assessments are source and existing-report inspection, not fresh end-to-end tests.

**Evidence labels:**
- **Partial** = relevant code, UI, data model or local flow exists, but the complete requested capability is missing or not verified.
- **Not found** = no matching complete feature or dedicated implementation was found in the inspected local routes/code; this is not a claim about unrelated systems or an exhaustive line-by-line repository proof.
- **Unverified** = requires isolated staging/real provider, permissions, independent-concurrency or owner/business testing; never counted as complete here.

The default demo adapter stores data in the browser (`src/config/env.ts`, `src/api/demo/db.ts`). Supabase and Bagisto have materially different coverage; Bagisto has explicit unsupported operations and unverified API mappings (`src/api/bagisto/admin.ts`). Hosted configuration, deployment revision, data, RLS, live services and real customer workflows were not accessed. Local changes after PR #29's last known head `7d5658a` are not in that PR; check GitHub again before relying on its current status.

## Highest-priority findings

1. **Dashboard figures can be misleading (P1).** `src/admin/pages/Analytics.tsx` labels order totals “30d,” but calls `listOrders({page: 1, perPage: 500})` and does not filter those orders by date. In a new synthetic browser test, a single delivered order dated **2020-01-01**, worth **PKR 987,654**, appeared as **Revenue (30d): Rs 987,654** and **Orders (30d): 1**. No real data or external requests were used. Supabase caps `listOrders` pages at 100 (`src/api/supabase.ts`), so the UI's requested 500 does not imply 500 or a complete set. Bagisto's overview reads only one 100-order page and deliberately returns zeros for several unsupported metrics and its entire revenue series (`src/api/bagisto/admin.ts`). Those zeros must not be interpreted as measured business results.
2. **Metric definitions disagree and lack full data guarantees (P1).** Supabase's month-to-date “revenue” sums fetched order totals without filtering cancelled stages, while its revenue series excludes cancelled; demo excludes cancelled for both. Supabase new-lead KPI uses **all leads created in the last seven days** from `admin_overview`, not the UI's “awaiting contact”; low-stock SQL uses per-product threshold while the dashboard watchlist inspects only the first 50 products, filters `inStock && stock < 10`, and may display a positive empty message when none of those 50 match. MTD and series use fetched rows without explicit pagination/aggregate guarantees, and day/month boundary handling mixes browser-local start and UTC date keys. The UI's pending-fulfilment wording also differs from Supabase's exclusion of delivered/closed/cancelled. Definitions, timezone, data completeness, permissions and error states need owner-approved tests. Order totals are not evidence of cash received or recognized revenue.
3. **Journey identity and atomicity are incomplete (P1).** Local schema links some entities (quote → lead, invoice → quote/order, tasks and site visits → various entities) and local quote conversion exists. However, customer data is also copied as text, `client_links` is polymorphic, project/order/customer IDs are not consistently enforced through the entire journey, and the site-visit flow can create a client then only warn if the lead link fails (`src/api/supabase.ts`). Quote-from-lead creates an empty quote and updates the lead separately. These are not proof of a single atomic, duplicate-free journey. Concurrent/failed creation, identity reconciliation and every later handoff remain unverified.
4. **Security and release are not established (P0 release gates).** Local draft protections, auth isolation and intake controls are not hosted proof. Review real policies/grants, staff access, published-only projections and staging isolation before deploying. CMS preview is opt-in and incomplete; `/lab/:slug` is not a published-only reader. Do not expose drafts. Strict intake is opt-in and undeployed; AI must remain disabled in hosted use pending safety and budget review.
5. **Orders and leads can have uncertain outcomes (P1).** Checkout locks and warnings are local mitigations, not server idempotency or atomic cross-tab protection. Bagisto submission and browser-local outbox are unverified, not automatic delivery. Lead v2 preserves bounded text locally only when matching Edge and frontend versions are deployed; quote requests remain unstructured text. Privacy and versioned rollout need approval.

## 3.1 Business modules

All entries below are **pending as complete requirements**. “Partial” describes existing work, not an approval to use it operationally.

### A. Commerce & Storefront

| Requirement | Finding |
|---|---|
| Public website | **Partial:** existing SPA public routes; CMS public rendering is limited/opt-in, and production SEO/accessibility/live behavior remain unverified (`src/App.tsx`, `PHASE1-CMS-SNAPSHOTS.md`). |
| Product catalogue | **Partial:** shop/product pages and catalogue adapters exist; published data, pricing, availability and real backend consistency require verification. |
| Product categories | **Partial:** shop filtering and admin taxonomy exist; backend parity and published mappings unverified. |
| Product variations | **Partial:** option/variant selection and cart labels exist; authoritative variant inventory/pricing and real provider mapping not demonstrated. |
| Shopping cart | **Partial:** browser-local cart; conditional preservation added, but cross-tab atomicity and synchronization remain open (`PHASE1-CHECKOUT-CART-PRESERVATION.md`). |
| Checkout | **Partial:** delivery/payment selection and uncertain-result warnings; server idempotency, reliable recovery, validation and security require staging. |
| Online orders | **Partial:** demo and Supabase/Bagisto paths exist; real ordering, stock and provider outcomes unverified. Bagisto results are deliberately marked unconfirmed. |
| Request quotation | **Partial:** form and all-line plain-text basket summary; structured authoritative quote data, linkage and full retry safety missing (`PHASE1-LEAD-CONTENT-CONTRACT.md`). |
| Virtual showroom | **Partial:** public page and room configurator exist; complete business integration and actual supported capabilities not proven. The “Watch Demo” button has no action in inspected page (`src/pages/VirtualShowroom.tsx`). |
| Customer accounts | **Not found:** no customer sign-in/account route in `src/App.tsx`; admin auth is not a customer account. |

### B. CRM & Sales

| Requirement | Finding |
|---|---|
| Lead management | **Partial:** lead list, statuses, details and capture exist; backend delivery, privacy, deduplication and complete lifecycle unverified. |
| Customer profiles | **Partial:** separate customer/client views, links and merge review exist; unified identity and duplicate-safe conversion not established. |
| WhatsApp integration | **Partial:** outbound `wa.me` links; no verified managed inbox, inbound provider webhook, consent and delivery lifecycle. |
| Live chat | **Partial/demo:** demo inbox/thread exists; Supabase conversation listing is empty and message APIs explicitly unsupported; offline callback is lead capture, not a hosted live thread (`src/api/supabase.ts`). |
| Sales pipeline | **Partial:** lead status board and quote states; reporting, identity continuity, complete permissions and real backend verified flow pending. |
| Follow-up tasks | **Partial:** task list and linked fields exist; scheduling/reminders and complete automation unverified. |
| Appointment booking | **Partial:** lead meeting field and site-visit workflow exist; customer-facing booking, availability/conflict prevention and reminders not established. |
| Quotations | **Partial:** quotation create/edit/print/convert and snapshots exist; customer approval, locked pricing, hosted permissions and full linkage not verified. |
| Sales team assignments | **Partial:** lead assignee and related filters exist; identity-backed assignments, access control and full staff workflow unverified. |

### C. Project & Production Management

| Requirement | Finding |
|---|---|
| Site surveys | **Partial:** lead site-visit scheduling exists; detailed survey process and full project handoff unverified. |
| Space planning | **Partial:** room configurator and project practice data exist; no verified integrated professional space-planning workflow. |
| Design management | **Partial:** custom-design content and project practice/BOQ, milestones and files exist; complete design lifecycle unverified. |
| Material selection | **Partial:** taxonomy/options and project data exist; approved selections linked to procurement/consumption not demonstrated. |
| Client approvals | **Partial:** quote status can be set accepted by staff; no independent customer approval or immutable accepted pricing demonstrated. |
| Production stages | **Partial:** stage model/controls exist (`src/api/types.ts`); server-enforced transitions, accountability and integrated order-to-job flow remain pending. |
| Quality inspections | **Partial:** QC appears as a stage; independent inspections, checklists and server-enforced release gates not demonstrated. |
| Delivery | **Partial:** order statuses/courier data and delivery estimates exist; scheduling, proof and lifecycle integration unverified. |
| Installation | **Not found:** no complete installation scheduling, proof and handover workflow found. |
| Warranty | **Partial:** public warranty content and claim UI/data models exist; full entitlement-to-claim resolution and backend integrations unverified. |

### D. Inventory & Procurement

| Requirement | Finding |
|---|---|
| Product stock | **Partial:** product quantities, adjustments and quote conversion stock logic; real concurrency and reconciliation unverified. |
| Raw materials | **Partial:** material taxonomy exists; authoritative raw-material stock and BOM integration not established. |
| Material consumption | **Not found:** no complete production consumption-to-stock/cost workflow demonstrated. |
| Stock movements | **Partial:** inventory movement types and audit writes exist; backend permissions and accounting reconciliation pending. |
| Suppliers | **Partial:** supplier UI and adapters; local RLS changes require owner matrix approval and staging. |
| Purchase orders | **Partial:** PO creation/receipt and project cost posting code exist; staged verification, approval and complete reconciliation pending. |
| Transfers | **Partial:** transfer UI/model exists; warehouse integrity and real backend concurrency unverified. |
| Returns | **Partial:** RMA UI/model and some backend support; Bagisto explicitly unsupported; actual refund/restock semantics unverified. |
| Reorder alerts | **Partial:** low-stock views and notification bell; thresholds/data completeness inconsistent on dashboard, automated purchasing not shown. |

### E. Finance

| Requirement | Finding |
|---|---|
| Quotations | **Partial:** commercial quote records and printing exist; independent acceptance, tax/pricing and downstream accounting unverified. |
| Invoices | **Partial:** invoice creation/list/print and quote/order links exist; real accounting, legal/tax compliance and posting unverified. |
| Advance payments | **Partial:** quote templates calculate advance amounts; that is not proof of collected/settled funds. |
| Partial payments | **Partial:** invoice payment-recording RPC and status model exist; real bank/provider settlement and reconciliation unverified. |
| Receivables | **Partial:** outstanding invoice count exists; dashboard does not show outstanding balance, ageing or complete receivables ledger. |
| Expenses | **Partial:** project actual/cost lines exist; complete business-wide expense ledger and approvals not demonstrated. |
| Refunds | **Partial:** return/refund amounts/statuses exist; actual gateway refund and accounting reconciliation not demonstrated. |
| Profitability | **Partial:** project cost actuals exist; complete reliable job/business margin and cost allocation not demonstrated. |
| Financial reporting | **Partial:** sales analytics and invoice views exist; accounting-grade, reconcilable statements, definitions and date controls not demonstrated. |

### F. Intelligence & Automation

| Requirement | Finding |
|---|---|
| Business analytics | **Partial:** charts and KPI screens exist; documented calculation defects and incomplete coverage above. |
| AI sales agent | **Partial:** local proxy and quota/auth work exists; trusted grounding, privacy, budgets and hosted validation pending. Keep hosted AI disabled. |
| Customer insights | **Partial:** customer/client records and order data exist; integrated accurate segmentation/insights not demonstrated. |
| Notifications | **Partial:** polling bell for four queues exists; failed individual sources can appear as zero unless all fail; no complete notification delivery system. |
| Workflow automation | **Partial:** some business transitions/RPCs exist; user-configurable reliable automation rules not found. |
| Audit logs | **Partial:** quote audit/version and order events exist; unified tamper-resistant, complete audit log and access review not demonstrated. |
| User permissions | **Partial:** Supabase capabilities/RLS code and local UI identity guard exist; full staff administration and hosted effective policy matrix remain unverified. |

## 3.2 Shared identifiers and traceability

**Not complete.** The local convergence schema defines `quotes.lead_id`, `invoices.quote_id`/`order_id`, `tasks` links and `site_visits` lead/client references; project actuals have a project FK. Those links are useful but do not establish consistent canonical IDs throughout the full requested lifecycle. `orders` and `quotes` also store copied customer text and item JSON, and `client_links` identifies generic entities by text and numeric ID rather than a single FK for each relationship (`supabase/migrations/20261107000001_agency_os_convergence.sql`).

The Supabase lead-to-quote path creates an empty-line quote linked to the lead, then separately attempts to advance the lead status; the failure is logged rather than transactional. Site-visit scheduling may create a client and log a warning if linking it to the lead fails (`src/api/supabase.ts`). Local quote-to-order conversion is supported with an accepted-state gate and local tests, but staff can set that state and it is not independent customer approval or frozen pricing (`PHASE1-PUBLISH-QUOTE-WORKFLOWS.md`). Neither this nor the schema proves duplicate-free, independently concurrent customer conversion or the full consultation → production → warranty trace. **Do not claim duplicate-free end-to-end traceability.**

## 4.1 Admin navigation — requested grouping versus current implementation

The present sidebar groups are **Overview, Commerce, Purchasing, Engage and System**, not the eight requested groups (`src/admin/Layout.tsx`). Routes can exist without a distinct sidebar item; aliases such as categories/collections/materials point to taxonomy (`src/admin/AdminApp.tsx`). “Customers” and “Clients” are separate entries and need a business identity/UX decision, not blind deletion. All grouping/reorganization is pending; preserve existing URLs and functionality when addressing it.

| Requested group/items | Current mapping and pending work |
|---|---|
| **COMMAND CENTER:** Dashboard, Analytics, Notifications, Activity Feed | Dashboard and Analytics links exist under Overview; notification bell exists outside the sidebar. No dedicated unified activity-feed page found. Metrics/notifications remain partial. |
| **SALES & CRM:** Leads, Customers, Sales Pipeline, Live Chat, WhatsApp, Appointments, Tasks, Campaigns | Leads/chat/tasks/campaigns are under Engage; Customers and Clients are under Commerce; lead board acts as a partial pipeline and lead/site-visit dialog as partial appointments. No dedicated managed WhatsApp or complete appointments entry found. |
| **COMMERCE:** Products, Categories, Product Attributes, Product Variants, Collections, Orders, Quotations, Shopping Carts, Customers, Reviews, Returns, Exchanges | Products, Taxonomy, Orders, Quotes, Customers, Returns and Exchanges appear under Commerce. Categories/collections/options have taxonomy/alias routes; product options/variant handling is partial, not dedicated finished modules. No dedicated shopping-cart administration or review-management route found. |
| **INVENTORY & PROCUREMENT:** Inventory, Stock Movements, Suppliers, Purchase Orders, Material Management, Warehouse, Transfers, Low Stock Alerts | Inventory is under Commerce; suppliers/PO/transfers under Purchasing. Movements and low stock appear within inventory/bell; materials via taxonomy. No complete dedicated warehouse/material-consumption module found. |
| **PROJECTS & PRODUCTION:** Projects, Site Surveys, Custom Design, Design Approvals, Production, Quality Control, Deliveries, Installation, Warranty Claims | Projects under Commerce; Custom Design and Warranty content under Engage; Claims under Commerce; surveys are within leads and production/QC are project concepts. No complete dedicated approval, QC, delivery/installation management navigation found. Warranty content is not a claims workflow. |
| **WEBSITE & CONTENT:** Website Dashboard, Pages, Visual Page Builder, Section Library, Global Templates, Blog Posts, Blog Categories, Services, Projects Portfolio, Media Library, Menus, Navigation, SEO Manager, Redirect Manager | Pages/editor, Blog, Services, Content and Media under Engage; Homepage and Projects under Commerce. Builder/blocks and SEO panels exist. No complete standalone website dashboard, global template governance, blog categories, menu/navigation manager or redirect manager found; public CMS is restricted/partial. |
| **FINANCE:** Invoices, Payments, Expenses, Refunds, Receivables, Financial Reports | Invoices under Commerce, with partial payment recording and return-related refund states; no dedicated completed finance group, full expenses/receivables/refunds/reporting modules found. |
| **AI & AUTOMATION:** AI Agent Dashboard, Knowledge Base, Product Training, Conversation History, Agent Settings, Human Handover, Automation Rules | No dedicated group/routes for these complete capabilities found. Local AI proxy/chat and demo handover-related UI are not an approved hosted agent system. |
| **SYSTEM:** Users & Roles, Permissions, Settings, Integrations, Import / Export, Audit Logs, Backups, System Health | Settings and Import under System; CSV exports exist in some screens, roles/capability schema and limited event records exist. Dedicated user/permission administration, integration controls, comprehensive audit, backup and system-health workflows not established. |

## 4.2 Dashboard — KPI checklist

**Not complete.** `src/admin/pages/Dashboard.tsx` uses `getDashboardStats`, `getRevenueSeries(30)`, six recent orders and the first 50 products; adapter data semantics differ. None of the entries below is certified correct for production or backed by a complete calculation/currency/date specification.

| Requested KPI | Current local evidence / gap |
|---|---|
| Total Revenue | **Not found:** MTD and 30-day-labelled order totals exist, not an all-time recognized-revenue metric. |
| Monthly Revenue | **Partial:** “Revenue (MTD)” sum of order totals; differs by adapter on cancelled orders and is not verified payment/recognized revenue. |
| Total Orders | **Not found:** MTD order count exists, not a complete all-time total KPI. |
| Pending Orders | **Partial:** pending-fulfilment KPI; inclusion semantics differ by adapter/label. |
| Active Leads | **Partial:** “New leads,” not all active leads; Supabase is trailing-seven-day creations, not necessarily new-status leads. |
| Conversion Rate | **Not found:** no defined funnel conversion-rate KPI in dashboard. |
| Outstanding Receivables | **Partial:** count of outstanding invoices, not monetary balance or ageing. |
| Active Projects | **Not found:** no dashboard KPI found. |
| Low Stock Products | **Partial:** count and watchlist exist; SQL threshold, UI fixed cutoff, first-page watchlist and adapter semantics differ. |
| Pending Quotations | **Partial:** open quote count/pipeline value exists; supported status definitions and backend data completeness need review. |

### Dashboard visualizations and interaction

| Requested visualization / behavior | Current evidence / gap |
|---|---|
| Revenue trends | **Partial:** fixed last-30-day dashboard chart; Bagisto series explicitly zero-filled, Supabase/demo definitions differ. |
| Orders by status | **Partial:** on Analytics, not dashboard; based on fetched order page, not verified complete/time-filtered. |
| Sales by category | **Not found** in inspected dashboard/analytics. |
| Lead conversion funnel | **Not found** in inspected dashboard/analytics. |
| Top-selling products | **Partial:** Analytics ranks fetched non-cancelled order items by line revenue, not necessarily all sales or a valid 30-day population. |
| Sales by city | **Not found** in inspected dashboard/analytics. |
| Project status | **Not found** as requested dashboard visualization. |
| Stock alerts | **Partial:** first-50-product watchlist and notification bell; limitations above. |
| Recent activity | **Partial:** latest orders table; not a cross-module activity feed. Empty order list displays a loading skeleton in the inspected dashboard. |
| Upcoming appointments | **Not found** in inspected dashboard. |
| Documented calculation, currency, date range for every KPI | **Not complete:** some sublabels and code exist, but there is no full, consistent business metric contract. Distinguish booked orders, revenue and collected cash. |
| Date filtering and drill-down | **Partial:** fixed MTD/30d and some links to module lists; no dashboard/analytics date-range selector or complete filtered drill-down found. |
| PKR default, configurable currency formatting | **Partial:** dashboard `formatPKR` hardcodes `Intl.NumberFormat` with `PKR`; Bagisto has a currency config, but dashboard formatting does not use it. Configurable, consistently sourced currency and multi-currency handling are pending. |

## Recommended sequence

1. **Governance / safety:** review local diff and PR; choose the system of record; owner signs off role/field exposure, metrics, quote approval, privacy, support contacts and rollback. Never deploy drafts or enable hosted AI based on demo tests.
2. **Dashboard correctness:** define each metric, source of truth, status inclusion, timezone, currency and date range; replace misleading partial/zero/failed results with explicit unavailable states; implement server-side aggregate/pagination and date-filtered drill-down; add synthetic tests for cancellations, old records, >page limits, zero vs failure, role denial, timezone and currency.
3. **Identity and journey:** design canonical identifiers and transactional, idempotent lead→client→quote→order→project links; handle failed linking, duplicates, explicit merge and audit. Exercise independent transactions and the complete synthetic customer lifecycle.
4. **Commerce/CRM:** complete structured quote intake, safe retries and payment/stock reconciliation; validate real backend/Bagisto behavior and communications in authorized staging.
5. **Production/finance and CMS:** implement approval/QC/installation, material consumption, finance reconciliation and remaining website navigation/publishing while retaining old URLs and protecting drafts.
6. **Staging then release:** only with explicit authorization, use isolated synthetic data; test RLS and direct calls, concurrency, backup/restore, integration sandbox, privacy and operational recovery. Record failures and owner sign-off before considering production.

## Sources, execution and boundaries

Primary local evidence: `src/App.tsx`, `src/admin/AdminApp.tsx`, `src/admin/Layout.tsx`, `src/admin/pages/{Dashboard,Analytics,Leads,Projects}.tsx`, `src/admin/components/layout/NotificationBell.tsx`, `src/api/{types,supabase,bagisto/admin,demo/db}.ts`, `src/config/env.ts`, root `supabase/migrations`, and the Phase 1 reports and `docs/WOODEX_STATUS_AND_PLAN.txt`. The attached `writing-block.md` was previously read in full as the available master prompt. Existing reports document earlier local tests; those historical results are not presented as newly rerun here.

New browser probe: local demo Vite server `127.0.0.1:8083`, fake keys, synthetic session and monkey-patched order adapter; all off-origin browser requests blocked. A 2020 synthetic delivered order was displayed under the 30-day revenue/order labels. No production code, database, provider, deployed revision, migrations or customer data were changed. The test server was stopped after the inspection. This audit does not certify all routes, financial correctness, real user journeys, provider contracts, security or deployments.
