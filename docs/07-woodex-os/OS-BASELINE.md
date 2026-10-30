# WOODEX OS — Baseline Audit (read from source)

**Repository:** `woodex420/woodexinterior` · **Branch:** `arena/8be318a2-woodexinterior` · **HEAD:** `c437cad`
**Cloned:** 31 Oct 2026 · **Method:** source inspection of `platform/` (PHP was not available in this sandbox, so no test suite was executed — figures marked *(reported)* come from the repo's own status documents).

> The repository became public during this session; the earlier 404s are resolved.

---

## 1. What WOODEX OS actually is

A **mature, custom Laravel 13 + Livewire 4 application** — the operating system of the business, not a starter kit.

| Metric | Value |
|---|---:|
| PHP files in `platform/app` | **682** |
| Lines of PHP in `platform/app` | **73,582** |
| Livewire components | **117** |
| Domain models | **81** |
| Migrations | **82** |
| Database tables created | **98** |
| Feature/unit test files | **180** |
| Documented test gate *(reported, rev 48-A)* | 1,722 passed / 9,199 assertions |

**Stack:** PHP 8.4 · Laravel 13.36 · Livewire 4.4 · Tailwind 4 + Preline · Laravel Fortify 1.41 ·
Spatie Permission 8.3, MediaLibrary 11.23, Settings 3.9, ActivityLog 5.1, Backup 10.3 ·
barryvdh/laravel-dompdf 3.1 (PDF quotations/invoices) · brick/math (money).

**Hosting target:** Hostinger **shared hosting, no SSH**. Root `.htaccess` serves `platform/public`; a root
`composer.json` deploy manifest installs packages into `platform/vendor`; settings/uploads live outside the web
root in `~/woodex-os/<site>/`. This is a hard constraint on any new dependency.

---

## 2. Domain map (already built)

| Domain | Models (selection) | What it does |
|---|---|---|
| **Sales** | Quote, QuoteItem, QuoteVersion, QuoteSection, QuoteMilestone, QuoteTemplate, QuoteEvent, CatalogItem, Estimate, EstimatorRate, Invoice, InvoiceItem, RecurringInvoice, Payment, PaymentAllocation, PaymentMethodAccount, DocumentDesign, DescriptionTemplate | Quotation builder, versions, approvals, sent snapshots, advances/milestones, invoices, payments, proof verification, allocation, recurring invoices |
| **Accounts** | Account, JournalEntry, JournalLine, AccountingPeriod, BankAccount, Bill, BillItem, BillPayment, Expense, RecurringExpense, Vendor, MonthlyReport | Double-entry accounting, bills, expenses, period close, reports |
| **CRM** | Lead, Company, Contact, PipelineStage, SiteVisit, Task, AssignmentRule, Tag | Capture, scoring, assignment, SLA, pipeline, visits, merge |
| **Projects** | Project, ProjectMilestone, ProjectUpdate, ProjectExpense, ProjectHandoverItem | Delivery/installation tracking |
| **Conversations** | Conversation, Message, CannedReply, WhatsAppTemplate, TelegramLink, PendingTelegramMessage | WhatsApp + Telegram inboxes, templates |
| **Automation** | Automation, AutomationSequence, AutomationStep, AutomationEnrolment, AutomationStepRun | Sequence engine over existing actions |
| **Bot / Assistant** | BotKnowledge, BotUsage, CannedReply | Knowledge-backed assistant, usage logging |
| **Website** | Page, PageBlock, PageVersion, PageTemplate, NavigationItem, ThemeToken, Redirect, ContentEntry, SocialPost, PageSpeedRun | Page builder, theme tokens, SEO, redirects, social posts, speed runs |
| **Marketing** | SocialPost | Social publishing |
| **System** | AlertRule, ScheduledTaskRun, IntegrationLog, WebhookEvent, NumberSequence, ChangeRequest, SavedView, Media, Activity | Health, alerts, scheduled tasks, webhooks, sequences, audit |

**Portal & access:** `PortalAccessCode`, client portal tests, role/permission guards on routes (`AdminRouteAccessTest`).

---

## 3. The gap: there is no e-commerce

Verified by scanning all 82 migrations (98 `Schema::create` calls):

- **No** `products`, `product_variants`, `carts`, `cart_items`, `orders`, `order_items`, `inventory`,
  `stock_movements`, `shipments`, or `collections` tables.
- `CatalogItem` is a **rate book** for the quotation builder (`rate_minor`, `internal_cost_minor`,
  `business_line`, `is_active`) — not a sellable catalog with media, variants and stock.
- `Invoice`/`Payment` are finance documents raised from quotes, not storefront orders.
- The public API serves **leads, chat, legacy form bridges and a read-only MCP endpoint** — nothing
  catalogue-shaped:

```
POST /api/public/leads            (throttled)
POST /api/public/chat/start|send  GET /api/public/chat/messages
GET|POST /api/forms.php           (legacy site bridge)
GET|POST /api/chat.php            (legacy site bridge)
POST /api/mcp                     (JSON-RPC 2.0, read-only tools, wx_mcp_ bearer key)
GET  /api/bridge/v1/...           (read-only REST for stdio MCP adapter)
```

**So the storefront in `woodex-reimagined` currently has nothing to call**: 148 products, 5 series, 16 materials
and 6 blog posts exist only as TypeScript files.

---

## 4. What can be reused instead of rebuilt

| Need | Existing asset | Reuse rule |
|---|---|---|
| B2B quotation with versions/approval | Sales domain (`CreateQuote`, `ReviseQuote`, `SendQuote`, `RaiseAdvanceInvoice`, `AcceptQuote`) | Online "request a quote" writes into this — never a second quote system |
| Invoicing & advances | `Invoice`, `RaiseMilestoneInvoice`, `RecordPayment`, `AllocatePayment`, Accounts | A storefront order produces an `Invoice`; payment posts to the ledger |
| Customers & companies | `Contact`, `Company`, `Lead` | Checkout creates/updates `Contact`; B2B ties to `Company` |
| WhatsApp / Telegram | Conversations + templates | Order and quote notifications reuse the existing channels |
| Page builder / SEO | Website domain | Product and category landing pages can render through it; storefront stays Vite |
| AI assistant | BotKnowledge/Bot/Automation + MCP bridge | E-commerce agent becomes new **tools** on the existing assistant |
| Ops & safety | AlertRule, IntegrationLog, WebhookEvent, Backup, ActivityLog | Commerce events emit outbound webhooks and audit rows |
| Numbering | `NumberSequence` | Order numbers (`WO-2026-####`) use the existing sequence service |

---

## 5. Existing constraints that shape the plan

1. **Shared hosting (Hostinger, no SSH):** no Redis, no long-running workers, limited PHP memory. Queues must run
   via cron (`schedule:run`), and every new dependency must install through the Composer webhook.
2. **No CI workflows present** in the repo (`.github/` absent) — the test gate is run locally; 180 test files exist.
3. **Financial rules are frozen and audited** (revisions 44–46 repaired a payment ledger defect). Commerce must
   *post through* these actions, never write `payments`/`journal_*` directly.
4. **Documented open items** in the OS itself: F05 definitions, production reconciliation, whole-OS certification,
   and a gated four-phase website plan (revision 49). Commerce adds work; it must not silently reopen these.
5. **Historical secrets** were committed in related public repositories (flagged in the OS's own 2026-10-05 plan and
   still actionable) — rotate before adding payment keys.

---

## 6. Verdict

WOODEX OS is **not an empty Laravel app waiting for an e-commerce engine** — it is a 73k-line ERP/CRM with money
flows that are already audited. The correct move is to **add a Commerce domain that speaks the same language**
(quotes, invoices, payments, ledger, CRM, conversations), not to install a second commerce platform beside it.

That finding drives the architecture in [`MASTER-PLAN.md`](./MASTER-PLAN.md) §3.
