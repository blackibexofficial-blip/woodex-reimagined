# Admin Control Centre — Screenshot Audit & Target IA

**Source:** attached screenshot (`Screenshot_2.jpg`) — "Woodex OS · 2026 · Woodex Interior, Lahore", preview port 33143.
**Compared against:** `platform/` at HEAD `c437cad` (`app/Support/AdminNavigation.php`, `layouts/admin.blade.php`, `Livewire/Admin/Dashboard.php`, `live-chat-bell.blade.php`).

---

## 1. What the screenshot actually shows

| Region | Screenshot | Code today | Verdict |
|---|---|---|---|
| **Left rail** | Groups: Reports · CRM · Sales · Accounts (expanded) · Projects · Inbox · Automation · Marketing · Pages & Builder · Content · **Website** (expanded) · System | `AdminNavigation::groups()` returns Overview (Dashboard/Approvals/Reports) · CRM · Sales · Accounts · Projects · Inbox · Automation · Marketing · Pages & builder · Content · **no-heading tools group** · System | ⚠️ **Target, not current.** The screenshot is revision 49 Phase 1A: a real `Website` heading with six entries (Media · SEO · Speed · Site health · Theme · Website Settings). Code still has seven loose entries including a separate **SEO agent**. |
| **Accounts group** | Chart of Accounts · Journals · Trial balance · Profit & loss · Payables · Income & expenses · Periods · Payment methods | Identical 8 items | ✅ Matches exactly |
| **Pages & Builder** | collapsed | All pages · Page builder · Find & replace · Redirects | ✅ same set |
| **Content** | collapsed | Blog · Portfolio · Forms (studio screens writing HTML files) | ✅ same set — **but the implementation is file-based**, see §4 |
| **Top bar** | Command search (`Name, phone or L-2026-…`, Ctrl K) · **Dark** toggle · notification bell **1** · `PO / Preview Owner ▾` | Command palette = `Livewire/Admin/GlobalSearch.php` ✅ · theme toggle (rev 48A) ✅ · `NotificationBell.php` ✅ · **no impersonation / preview-owner feature found anywhere in `app/`** | 🔴 `Preview Owner` is undefined in code. It must be specified, not assumed. |
| **Dashboard chart** | 14-point line, axis 0–4 | `Dashboard.php` renders period performance via `ControlPanel` + `PeriodPerformance` | ✅ exists |
| **Funnel panel** | New 7 · Contacted 5 · Site Visit 4 · Quotation 4 · Negotiation 2 · On Hold 1 · Won 2 · Lost 2, colour-coded bars | `PipelineStage::query()->ordered()->withCount('leads')` — per-stage counts, red "Lost" | ✅ exists |
| **Recent activity** | 8 rows: browser visitor auto-assigned, web-chat enquiries, quote starts with template names ("Interior", "Furniture", "Renovation") | `Crm\Models\Activity` feed + `Lead` assignment rules + quote templates | ✅ exists |
| **Website chats drawer** | Header "Website chats / 0 unread - website enquiries", toggle "Recent active threads (up to 30) - full list above", one thread (`ahmad`, phone not supplied), reply composer with note *"Replies appear on the visitor's next poll. No WhatsApp send."* | `live-chat-bell.blade.php` exists; rev 49 asks for exactly this compact single-thread popup (the old one was a large drawer) | 🟡 **Partly built** — matches rev 49 1A target |
| **Footer** | `Woodex OS · 2026 · Woodex Interior, Lahore` | layout footer | ✅ |

**Conclusion:** the screenshot is the **revision 49 target state** of the control centre, running on the same data as the code. It is a UI/IA destination, not a second product.

---

## 2. Gaps to close in the control centre (before commerce lands)

| # | Gap | Fix | Owner |
|---|---|---|---|
| A1 | Sidebar has no `Website` heading; seven loose tools | Group them; merge **SEO** + **SEO agent** into one screen with two tabs (both URLs preserved) | Dev C |
| A2 | `Preview Owner` chip exists nowhere | Define **Role preview**: read-only "view as role", no writes, audited, visible banner — or relabel it "Preview environment" if it is a staging marker. Decide before building. | Owner + Dev C |
| A3 | Chat drawer behaviour is halfway to rev 49 | Compact popup, correct-thread inbox, draft-safe, honest "poll, no WhatsApp send" note | Dev C |
| A4 | Admin surfaces still navy | Charcoal tokens (owner request, rev 49); public theme unchanged | Dev C |
| A5 | No "what changed today" honesty layer | Keep the OS rule: every automated status labelled *configured / enabled / verified* | Dev D |
| A6 | Numbers on the dashboard are finance + CRM only | Commerce KPIs (orders, AOV, stock alerts) join `ControlPanel` in P4 | Dev A |

---

## 3. Target information architecture (with commerce)

```
Overview        Dashboard · Approvals · Reports
CRM             Leads · Contacts · Tasks & Visits
Sales           Estimations · Quotations · Invoices · Payments · Documents
Commerce  ★NEW  Overview · Products · Categories & collections · Inventory · Orders
                · Shipments & returns · Pricing · Storefront settings
Accounts        Chart of Accounts · Journals · Trial balance · Profit & loss
                · Payables · Income & expenses · Periods · Payment methods
Projects        Projects · Board · Client portal · Handovers
Inbox           Conversations · Chat Bot · Agent activity  ★NEW
Automation      Automations · Sequences · WhatsApp templates
Marketing       Marketing
Pages & builder All pages · Puck Studio ★ · Find & replace · Redirects
Content         Blog · Portfolio · Forms (rebuilt on Puck bodies ★)
Website         Media · SEO (tabs) · Speed · Site health · Theme · Website settings
System          Settings · Access & team · Connections · Platform
```

**Rules**

1. New groups appear only when their first screen is real (the OS's own convention: “no P4 badge over shipped code”).
2. Every item keeps a permission gate; hiding a link is never authorization.
3. `FULL_DOCUMENT` links (builder, studio screens) keep full-page navigation — Livewire `wire:navigate` must not swap them.
4. The commerce group is placed **after Sales** because its money flows through the same invoices and ledger.

---

## 4. The structural finding that changes the plan

`app/Domain/Website/Services/SiteRouter.php` states it plainly:

> **A page is a file.** Since Woodex OS 1 every public page is `public/<path>/index.html`, which the web
> server answers before Laravel runs. … The renderer, its Blade layout and its 20 section views are gone
> (owner, 21 Oct 2026).

Measured consequences:

| Fact | Count |
|---|---:|
| Public pages served as static HTML files | **142** (`public/**/index.html`) |
| Page builder | edits those files directly (`SaveHtmlFile`, max 3 MB, hash-conflict guard) |
| Blog / Portfolio | rows in DB, but published by writing HTML shells (`ArticleFile` → `public/insights|projects/<slug>/index.html`) |
| `pages` / `page_blocks` tables | exist, **not served** by any route |
| `ContentEntry` model | exists, **only referenced by itself** (dead) |
| Theme | `ThemeToken` rows → generated CSS with v1 variable aliases (`ThemeCss`) |

So today the site is **structured data on the admin side and raw HTML on the public side**, glued by a file
writer. That is why content edits, design changes and any future commerce landing page all fight the same
friction. **Replacing this file-based frontend with Puck Studio is the highest-leverage change in the plan** —
it is what makes commerce pages, product pages and campaign pages possible without hand-written HTML.

Full replacement design: [`PUCK-BUILDER.md`](./PUCK-BUILDER.md).
