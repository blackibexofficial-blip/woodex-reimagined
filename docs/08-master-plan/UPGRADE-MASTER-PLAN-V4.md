# WOODEX Upgrade Master Plan V4 — Live Chat → Complete Commerce → Clients & Leads-2026 parity → Quotation/Invoice → Income & Expense parity

**Prepared:** 2026-11-08 (post PR #23 merge) · **Status:** Final owner-answered plan — **proposed, not implemented.** Build starts ONLY after the owner says go; live chat is the first build module.
**Branch:** `arena/ea76e5b6-woodex-reimagined` · **Baseline:** `main` @ `ce894b6` (PR #23 merged 2026-11-08T12:51:53Z — PO→job-actuals shipped; Suite 78/78, a11y 0/51, 4-file diff).
**Supersedes nothing:** complements `UPGRADE-MASTER-PLAN-V3.md` (convergence program) and `MASTER-TODO.md` (registry). Builder programme stays `PAGE-BUILDER-MASTER-PLAN.md`.
**Ground truth for this plan:** the owner's Google Drive (`woodexofficefurniture@gmail.com`) — the real Wwoodex business artefacts are inventoried in §2. This document replaces every earlier assumption about "the Laravel system" with what was actually found.
**Owner sign-offs baked in (2026-11-08 question rounds):** live chat = in-app storefront bubble + admin inbox (WhatsApp fallback hand-off, offline capture → lead, self-hosted) · quotation = live A4 preview inside the template designer, per-template advance % (default 75/25), built-in payment/terms wording = the WOODEX Interior policy block below · furniture A4 polish FIRST, Interior BOQ template second · real Drive quotations as **demo seed only** (never committed to hosted) · income/expense = **full 1:1 parity** with the old XLSX (monthly GL + Dashboard) + CSV export · admin XLSX/CSV **importers for Lead 2026 + IncomevsExpense** built now · PR #23 merged (owner granted at 2026-11-08 question round).
**Explicitly NOT authorised:** any hosted Supabase read-write outside the existing adapter, any new migration (needs separate owner words — the ledger table and any chat tables land as adapter work first), any VITE_API_MODE flip, payment-provider activation, production credentials, merging anything without the owner's literal words, importing real client data into any hosted store, touching the Hostinger live site or its backups.

---

## 0. Executive summary (plain words)

You run Wwoodex out of Google Drive today: a live Laravel site on Hostinger (woodex.com.pk), a lead book (`Lead 2026`), and a hand-kept money ledger (`IncomevsExpense old data.xlsx`). This plan rebuilds that capability **inside the reimagined app**, in this order:

1. **Live chat** — visitors talk to you from the site; conversations land in the admin next to Leads; outside working hours the chat captures name+phone+message as a lead.
2. **Complete e-commerce pass** — close the remaining storefront/checkout gaps (demo honesty, discovery by category, order-request flow) — **no fake payments, no trackers.**
3. **Client database by category** — every client tagged (Furniture / Interior / Project / Retail / Business), KPIs per category, straight from the lead sheet's world.
4. **Lead generation & tracking** — the app finally mirrors `Lead 2026`: your assignment (Abdullah / Nabeel / Imtiaz), lead source, last contact, meeting schedule, quotation reference, status set — plus its importer.
5. **Quotation upgrade** — furniture A4 first (live preview while designing; built-in Advance-Payment wording from your own WI-10204; per-template advance %; your acceptance block and signatory footer), Interior turnkey BOQ second — seeded with your real WI-10204 / Daycare / Quotation-10183 documents as **demo data**.
6. **Invoice tracking + new invoice** — advance/balance milestones from the same 75/25 math; payment pipeline on each invoice.
7. **Income & Expenditure** — full parity with the old XLSX: monthly GL sheets + Dashboard totals, your exact categories, pay-by, debit/credit, project tags, CSV export — plus its importer.
8. **Verification** — e2e + a11y on the new flows, screenshots, then PR by PR.

Nothing touches the live host, the backups, or hosted Supabase. Everything runs in the demo adapter first, with a Supabase adapter behind the same interface for later owner-authorised rollout.

---

## 1. Hard constraints (unchanged from earlier rounds — binding)

1. **Demo-first, adapter parity.** Every new module lands in `src/api/demo/` + `src/api/` adapter interface, mirroring existing patterns (e.g., PO actuals Option C). Hosted Supabase is untouched; any new hosted table = separate owner decision (proposed: none in this plan; demo works fully offline — total planning envelope ≈ one new page family, no migration).
2. **No trackers/pixels, no third-party chat widgets.** Chat is self-hosted React (storefront bubble) + admin inbox. No Tawk/Crisp/Intercom, no phone-home scripts, no new marketing pixels.
3. **A4 default for NEW quotations only**; existing quotes keep their classic/template fallback; store logo outranks template logo; embla/print CSS kept.
4. **Demo mode is labelled.** Real client names/numbers from Drive may appear ONLY in the demo adapter/session data, never in a committed fixture that looks like production seed, and never hosted. (Seeded text lives in localStorage, browser-only.)
5. **No new icons packs / fonts; keep Lucide; Pakistani locale (`$`→`Rs` figures everywhere; dates EN primary).**
6. **CI/e2e conventions:** e2e from repo root with `PATH=/tmp/bin:$PATH`; never `pkill -f "vite preview"` (stop via process id); playwright chromium only; axe sweep must stay 0 violations.
7. **PR discipline:** one phase = one PR **or one small stack**; never committed churn (e.g., `supabase/functions/mcp/index.ts` must stay untouched); fix-forward only; **never merge without the owner's literal words** (PR #23 merged 2026-11-08 under explicit words).

---

## 2. Ground truth — what the Google Drive actually holds (analysed 2026-11-08)

Account: `woodexofficefurniture@gmail.com` ("woodex office Furniture"). Analysed by targeted `list_files` + `read_file_text`; large zips were not opened (see §2.4).

### 2.1 Business ledgers & lead book (the systems to mirror)

| Artefact | id | Facts | What the plan takes from it |
|---|---|---|---|
| **`Lead 2026`** (Google Sheet) | `1ooGyD-DBxeUNMEyVfDJLurdTaIbxUoaOjyB1j_c4y18` | 28-row active pipeline; top roll-up: New 16 · Client 26 · Won 20 · Done · "Not Responding" · Proposal/Quotation 1 · Meeting 4. Columns: `Sr · Date · Company · Name · Contact · Designation · Location · Lead Source · Status · Assassin(Assigned) to · Quotation · Last Contact · Action · Meeting Schedule · Note`. Sources: Furniture / Project / Interior; assignees: Abdullah, Nabeel, Imtiaz | §6 module: parity fields + CSV/XLSX import (§8). Status vocabulary mapped onto existing `new→contacted→quoted→won→lost` plus new `not_responding`, `meeting` |
| **`IncomevsExpense old data .xlsx`** (SheetJS-readable, 137 KB) | `1rAdpCNNTtgC_W-mgnymG8EZ57fsZaUs1` | Sheets: `Dashboard` + per-month `GL Jan…`. Dashboard: Cash-in-hand PKR 51,500; Jan totals — Labour 246,650 · Office 131,269 · Personal 231,600 · Workshop 14,050 · Project 984,800 · Material 483,200 · Vendor 274,000 · Rent 38,600 → **total expenses PKR 3,214,138**; Jan income side shows payments in (e.g., "Cash receive from Client" 20,000). GL columns: `S.No · Date · Project · Name · Account · Catagory · Sub Catagory · Dabet · Credit · Pay By · Note · Amount` | §8 module: month dashboard KPIs, GL columns, exact category list, pay-by, project tag, debit/credit, CSV export — full 1:1 parity per owner answer |
| **`woodex ox 2026 `** (Sheet) | `1jC-yAihflucd_cqjTUmSHhIMV-OLvuJG3J6SgCStKgY` | Empty (verified) | Nothing — do not build against it |
| **Quotation docs** (Google Docs): `Woodex_Interior_Quotation_WI_10204` `1ke2Lv2h…`, `Woodex_Interior_Daycare_Quotation_WI_DC_001_26`, `Daycare Center (Daycare Room)…Quotation & Scope of Work` | — | **WI-10204 structure = the house BOQ style:** WOODEX INTERIOR wordmark + "ARCHITECTURAL TURNKEY • INTERIOR FIT-OUT • JOINERY"; QUOTATION/BOQ · Ref No · Date · **Validity 30 Days**; two-column CLIENT & PROJECT DETAILS; **SUMMARY OF COST** (phase-tagged rows I–IV); **DETAILED BILL OF QUANTITIES** (SFT/NOST/L·S lines: Qty · Unit · Rate · Amount); **"Advance Payment Policy (75%): Rs 1,076,812 due upon contract signing. Balance Due (25%): Rs 358,938 payable upon phase completion. Validity: 30 days."**; CLIENT ACCEPTANCE signature block; authorized signatory & stamp — footer `+92 322 4000768 | info@woodex.com.pk | LG 89 / M-71 Zainab Tower, Model Town Link Road, Lahore` + "Thank you for choosing Woodex Interior" | §6 module P4: furniture A4 keeps its single table; this wording becomes the **built-in default terms block** (editable per template, EN+UR); signatory footer becomes a footer variant; later the **Interior BOQ** built-in template (Phases I–IV, SFT rates) is derived from this exact skeleton |
| **`Quotation-10183.xlsx`** | `1AsuxjrFkUEynepaJXW2jif0eKr39PHhF` | Office/computer furniture BOQ quotation (furniture side) — rows of line items with rates | §6 module P4: demo seed source #3 |
| **"Woodex Interior BOQ & Quotation System"** (Google Sites) `128OIiNfp…` | — | House-styled page describing the BOQ/quotation programme | Informational only |
| **`client > Beacon House > Order Details (2).xlsx`** | `1W9wmHH4F8-o0sHLrQs0YLVgTzXZGOK7J` (Beacon House) | Corporate client order detail for Beacon House | Client-database parity reference (§5) — not imported this phase |

### 2.2 The "Laravel WOODEX system" mystery — resolved

`woodex.com.pk` (Hostinger) is the production site. Its backups dominate the Drive:

| File (in `woodex os ` folder `1cLsIzOthOH2ot9mW9n56_U1z-FF49Vhv`) | size | date | role |
|---|---|---|---|
| `woodex.com.pk (2).zip` | 27 MB | 2026-11-05 | partial/smaller site archive |
| `woodex.com.pk (1).zip` | 27 MB | 2026-11-02 | same family |
| `woodex.com.pk bup 30-10-26.zip` | 207 MB | 2026-11-01 | full backup of 2026-10-30 |
| `woodex.com.pk (3).zip` | 213 MB | 2026-11-05 | newest full backup |
| `woodexinterior-arena-8be318a2-woodexinterior (1).zip` | 62 MB | 2026-11-02 | standalone AI-generated interior site — not part of this plan |
| `public_html.zip` (folder `woodex furniture os ` `1oww6rFqvwHBqrJKKPJ5Kme4pD10BAvJ2`) | 98.6 MB | 2026-11-06 | raw `public_html` of the live site — the actual Laravel webroot |
| `Woodex-v1.0.0-part1-of-2.zip` + `part2` (My Drive root) | 66 MB + 60 MB | 2026-11-04 | packaged **v1.0.0 release export** — most likely the same codebase as `public_html`, version-labelled |

**Decision (binding for this plan): we do NOT clone, decompile or migrate the Laravel app.** The Hostinger site stays untouched — it is the business's live system of record. What the Drive gives us is (a) the **process ground truth** (lead book, ledger, quotation formats) which we mirror, and (b) **demo seeds** which we parse client-side. A true data migration (real client/ledger rows into hosted Postgres) is a separate owner-gated programme with a Hostinger `mysqldump`/phpMyAdmin export and a reconciliation pass — explicitly out of this plan. If the owner wants that later, they must first provide a sanitised dump; the app will then be pointed at Supabase under VITE_API_MODE with 0013+ applied per the runbook.

**What was not possible from this sandbox (honesty):** the zips (27–270 MB) cannot be streamed into context; the sandbox allowlist (github/npm/pypi) cannot reach googleusercontent download URLs; `woodex.com.pk` itself is unreachable. Findings on the Laravel app are limited to file names/sizes/dates above — no code was read, no framework version is claimed. If a code-level audit is required, the owner can point at a small artifact (`composer.json`, a schema `.sql`) and it will be reviewed in minutes.

### 2.3 What this repo already has (build on, don't rebuild)

- **Quotation engine** `src/admin/components/documents/QuoteA4Sheet.tsx` — A4, existing templates, hardcoded **75/25 advance** (`Math.round(total*0.75)`, label "Advance required (75%)"). Missing: per-template advance %, editable policy wording, client-acceptance block, signatory footer variant, 30-day validity, **live preview in the designer**.
- **Print engine** `src/components/quotation/PrintableInvoice.tsx` — same 75/25 hardcode, note "Advance computed at 75% of total."
- **Quotation designer/PDF** `src/pages/Quotation.tsx` + `src/admin/pages/Quote.tsx` / `Quotes.tsx` / `InvoiceNew.tsx` / `Invoice.tsx` / `Invoices.tsx` — six-document pipeline (added in bb75f43e overhaul).
- **Leads** `src/admin/pages/Leads.tsx` — statuses `new|contacted|quoted|won|lost`, kanban + table + site visits; type `AdminLead` (types.ts:667) has `type, name, company, email, phone, city, summary, value, status, createdAt, consent…, landingPath, referrer, utm*`. Missing vs `Lead 2026`: `assignedTo`, `leadSource`, `quotationRef`, `lastContact`, `nextAction/meeting`, `note`, and statuses `not_responding`, `meeting`.
- **Clients** `AdminClient` (types.ts:585): `name, company, email, phone, city, kind: retail|business, source, tags, notes` — already has `source` + `tags[]`: the **category database** is an enrichment of this, not a new entity.
- **Projects / costing ledger** (`src/admin/pages/Projects.tsx`, job-costing) — the destination for project-tagged ledger rows (§8).
- **Demo adapter pattern** `src/api/demo/db.ts` + `src/api/supabase.ts` behind `src/api/types.ts` — every module below follows it.
- **Zero chat code today** — `grep -ri chat src` finds only incidental strings (ErrorBoundary copy, Contact copy). Live chat is greenfield.
- **No XLSX parser** in `package.json` (53 deps). The importers add **SheetJS `xlsx`** (Apache-2.0), lazy-loaded behind the import route.

### 2.4 Risks & honest limits

| Risk | Mitigation baked into the plan |
|---|---|
| Real client data leaks into hosted/git | Seeds are browser-local (localStorage, labelled demo); fixtures committed to git will be **synthetic re-creations** with fictitious names/numbers, never copied Drive rows |
| Hosted schema drift / accidental migration | No migration in this plan; chat/ledger/import = demo adapter only; anything hosted = separate owner proposal (like 0016 Option B was) |
| Importer on huge sheets freezes the tab | Cap 5,000 rows; file size guard 20 MB; parse in Web Worker via SheetJS; show preview counts before commit |
| Chat promise vs. staffing reality (nobody online) | Default store-front behaviour = **"leave a message / request callback"** card → creates lead; live-agent mode only when toggled in admin (`Settings → Storefront chat`) |
| ZIP audit pressure | §2.2 scope statement; owner may supply one small artefact later |

---

## 3. Owner-decided decisions (2026-11-08) — verbatim coverage

| # | Owner (question round 2026-11-08) | Plan consequence |
|---|---|---|
| 3.1 | **"Start" for live chat with WhatsApp fallback hand-off; offline capture → lead** (in-app, self-hosted, no third party) | §4 module, built FIRST, storefront + `/admin/chat` inbox |
| 3.2 | **Live chat → in-app bubble + admin inbox** (admins answer inside the reimagined admin; conversations sit next to Leads) | §4 admin inbox UI; badge on AdminShell nav |
| 3.3 | **Quotation → live A4 preview in designer** (blocks/logo/layout/wording update the preview instantly; no save-and-print loop) | §7 P4.1 |
| 3.4 | **Quotation → per-template advance %** (default 75/25; editable — e.g., 50/50 for turnkey) | §7 P4.1 `advancePct` on template |
| 3.5 | **Quotation → built-in terms = WOODEX Interior policy block, 75% due on signing, balance on phase completion, 30-day validity, amounts computed live, EN+UR, editable on the A4 built-in templates** | §7 P4.1 default wording (verbatim in §7.1.2) |
| 3.6 | **Two quotation flavours — furniture A4 polish FIRST, Interior turnkey BOQ immediately after; both live in one builder** | §7 order: P4.1 furniture → P4.2 Interior BOQ |
| 3.7 | **Real Drive quotations as seed** (WI-10204, WI-DC-00126, Quotation-10183, Daycare scope doc) | §8 importers + demo seed §7.1.4 — **demo only**, never hosted/committed names |
| 3.8 | **Income/Expense → FULL 1:1 parity with the old XLSX** (monthly Dashboard + GL sheets) + month KPIs + category breakdown + CSV export | §9 module, exact columns §9.2 |
| 3.9 | **Import tooling → build both importers now** (Lead 2026 + IncomevsExpense), parse→preview→commit into demo adapter | §8 |
| 3.10 | **PR #23 merged** | Receipt in MASTER-TODO; branch fast-forwarded to ce894b6 |
| 3.11 | **EspoCRM / Laravel clone → SKIP / declined** (2026-11-08 earlier answer) — no Laravel migration work whatsoever | §2.2 |
| 3.12 | **Mega-modules may not touch hosted Supabase without explicit words** | §1.1; hosted = follow-on proposal only |

---

## 4. Module P0 — Live chat (FIRST BUILD)

### 4.1 Behaviour spec (owner-approved shape)

- **Storefront bubble**, bottom-right on all public routes (`/` … including `/contact`); reimagined white/emerald styling, Lucide `MessageCircle`; opens a 360×480 panel; Urudu/English toggle inherits site language; `prefers-reduced-motion` respected.
- **Greeting card** with three quick actions: *Request a callback* · *Ask about a quotation* · *Visit showroom* (prefill; routes into the flow below).
- **Visitor flow A (agent online):** visitor types → message persists (`chat_messages` demo store) → bubble shows agent reply when posted (poll 3 s, bounded). No fake "typing…" theatrics.
- **Visitor flow B (offline — default state):** chat presents the capture form: `Name · Phone (PK) · Message · [ ] Consent` → submit → **creates a Lead** (`source: "storefront_chat"`, `summary` = message, consent captured with version+timestamp) and shows confirmation **"Team Wwoodex will call you back."** WhatsApp deep-link button (`wa.me/923224000768?text=…`) is ALSO offered as fallback — click-to-open only, never an SDK.
- **Admin inbox** `/admin/chat` (new nav item, Lucide `MessagesSquare`, badge = open conversations): list (newest first; filter: All / Open / Unread / By page), conversation view with visitor meta (page arrived-from, consent status, linked lead ref), reply box, quick templates ("We'll have someone call you back", "Showroom hours", "Send your BOQ/requirements"), close/reopen, "Create client from conversation" action, and a convert-to-lead link when the visitor left only a message.
- **Where it sits:** Leads stays the spine; chat is a conversation source adjacent to it. Sidebar: **Chat** between Leads and Clients.
- **Availability toggle** in Settings → Storefront: `Storefront live chat: Off | Offline capture (default) | Live (agents answer)` — Off hides the bubble entirely.

### 4.2 Data model (demo adapter; hosted proposal NOT in this scope)

```ts
// src/api/types.ts (additions)
export type ChatStatus = "open" | "closed";
export interface ChatConversation {
  id: string;                       // "CH-<n>"
  page?: string;                    // landing path (from bubble context)
  visitorName?: string;
  visitorPhone?: string;
  visitorConsent?: boolean;
  visitorConsentAt?: string;
  status: ChatStatus;
  unread: number;                   // agent-side unread
  createdAt: string;                // ISO
  lastMessageAt: string;
  leadId?: string;                  // set when offline capture created the lead
}
export interface ChatMessage {
  id: string;
  conversationId: string;
  role: "visitor" | "agent";
  body: string;
  createdAt: string;
}
```
Demo persistence: `src/api/demo/db.ts` keys `chat_conversations`, `chat_messages` (seeded 2 realistic threads marked `DEMO`). Adapter surface: `listConversations, getConversation, postAgentMessage(close?), captureOffline(name, phone, message, consent), markRead, setChatMode(mode)`. **No websocket; polling only.**

### 4.3 Files (planned)

`src/components/chat/ChatBubble.tsx` (new), `src/components/chat/ChatPanel.tsx` (new), `src/lib/chat.ts` (adapter helpers), `src/api/demo/db.ts` (+2 stores), `src/api/types.ts` (+types & adapter interface), `src/admin/pages/ChatInbox.tsx` (new) + route in `src/App.tsx` (or admin router file) + nav in AdminShell + badge, Settings toggle in `src/admin/pages/Settings.tsx`, storefront wiring in `src/App.tsx`/Layout, e2e `tests/e2e/chat.spec.ts`.

### 4.4 Acceptance criteria

1. Bubble renders on `/`, `/shop`, `/contact`; hidden when mode=Off; capture submit creates a **visible lead** in `/admin/leads` with `summary` = visitor message and consent stamp; WhatsApp button opens `wa.me/923224000768`.
2. Agent posts reply → open bubble on the same browser profile (demo) shows agent message within ≤4 s (poll); admin badge decrements on open; close/reopen works; Unread filter correct.
3. Offline capture with empty name/phone → inline validation; consent required (PK practice); duplicate submit guarded.
4. e2e (Playwright, chromium): full round trip happy-path + consent-required path + bubble-hidden path; axe: 0 violations on bubble panel and inbox; PO flow regression untouched (78/78 still green).
5. **Demo namespace:** all seeded conversations prefixed `DEMO`; nothing real. Hosted remains untouched.

### 4.5 Effort / risk

Low complexity, high visibility; no new dep (framer-motion already present; Lucide `MessageCircle`). Main risk = scope creep into CRM automation — explicitly capped at §4.1.

---

## 5. Module P1 — "Complete e-commerce" pass (storefront, honest limits)

Owner phrase: *"complete e-commerce system"* with live chat. Interpretation (stated for honesty): **complete the storefront + enquiry-to-order loop the business actually runs**, not a payment gateway programme. Track D of MASTER-TODO stays the builder authority for pages.

### 5.1 Work items

1. **Storefront audit & gap close:** verify every nav destination renders (Products index, category pages incl. Hardware/Lighting that exist but are thin, Cart, Checkout=order-request, Track, Account demo). Fix dead links; one-pager honesty: checkout **clearly labelled "request — we confirm on WhatsApp/call"**; never a fake "payment successful" state.
2. **Category-driven discovery:** storefront home + `/shop` gain category tiles fed by existing `Categories` admin (no new data); "As seen in WOODEX showrooms" strip only if images exist in Media library (no stock-photo filler invented).
3. **Order tracking:** existing Track page — add "ask about this order" → opens chat prefilled with the order ref (ties P0 to orders; one line of code, high value).
4. **CART/× order-request → admin Orders:** when an order-request is submitted (demo), it lands in `/admin/orders` as before; add source tag `storefront` for filtering (already has source attribution).
5. **Reviews honesty:** keep rating UI display-only; do not fabricate review counts; no new review collection this phase.

### 5.2 Out of scope (explicit)

Payment capture (Stripe/JazzCash/EasyPaisa), real checkout settlement, delivery slot booking, marketplace feeds — all require owner-gated programmes; listed for completeness only.

### 5.3 Acceptance criteria

Lighthouse-ish smoke (home/category/product/checkout) clean of console errors; storefront walkthrough video-equivalent = Playwright traces of the order-request path; zero new trackers (network scan in e2e asserts no third-party hosts beyond Supabase/demo adapter).

---

## 6. Module P2 — Client database by category

1. **Enrich `AdminClient`:** add `category?: "furniture" | "interior" | "project" | "retail" | "business"` (default derive: `kind=business → interior/project ? "interior" : "business"` — migration-free demo derivation; owner can retag inline) + keep `tags[]`.
2. **Clients page** (`src/admin/pages/Clients.tsx` or existing `Customers`/`ClientMerge` — actual target: `Clients.tsx` list): category filter chips (All / Furniture / Interior / Project / Retail / Business), KPI strip (count + month activity), per-category CSV export, sort/search kept.
3. **Category auto-tag on order completion** from product category heuristics (Furniture line items → Furniture; BOQ/turnkey orders → Interior) — admin-editable.
4. **Cross-links:** client ↔ leads (source), quotes, invoices, orders, projects (P6/P6.2 tag) — one cell each, no new pages.
5. **Merge queue** already exists (ClientMerge) — verify it handles the new field (fixture update) and note it in release notes.

**Acceptance:** category filter + KPI render; CSV opens in Sheets; zero console errors; e2e: filter chips change list; demo adapter round-trip; hosted untouched.

---

## 7. Module P4 — Quotation upgrade (furniture A4 first, Interior BOQ second)

### 7.1 P4.1 — Furniture A4 polish (FIRST)

#### 7.1.1 Live preview in the template designer
- `TemplateDesigner` (Quotation designer, `src/pages/Quotation.tsx` + designer route) gains a **sticky right-hand A4 preview pane** that re-renders on every edit (debounced 150 ms): blocks, logo variant, accent, advance %, validity, wording — what you see is the printed sheet. Uses the same `QuoteA4Sheet` component (single source of truth) in scaled layout (`transform: scale`) inside the designer; no iframe, no save-and-print loop.
- Designer gains **"Validity (days)"** field (default **30**) and shows computed "Valid until <date>" line in the preview.

#### 7.1.2 Built-in default terms = WOODEX Interior policy block (owner-approved wording)
```
PAYMENT & POLICY TERMS
____________________
Advance Payment Policy (75%): Rs {advance} due upon contract signing.
Balance Due (25%): Rs {balance} payable upon phase completion.
Validity: Quotation rates are valid for 30 days from the date of issuance ({validUntil}).
```
- Amounts **computed live** from the quote total and the template's `advancePct`.
- **Per-template advance %**: `advancePct?: number` on `QuotationTemplate` (default 75, clamp 0–100, snapped to whole points; balance = 100 − advancePct). UI: numeric stepper with quick chips 50 / 60 / 70 / 75 / 80 / 100.
- **Editable wording** (per template, EN + UR): two textareas (EN / UR) pre-filled with the block above; stored on the template; `{advance}` / `{balance}` / `{validUntil}` placeholders resolved at render. The slide-out "Reset to WOODEX policy wording" link restores the default verbatim.
- EN/UR: Urdu rendering reuses the existing RTL print styles; the UR default block is provided translated in the seed ("پیشگی ادائیگی کی پالیسی (75%): Rs {advance} — معاہدہ دستخط ہوتے ہی واجب الادا۔ بقایا (25%): …") and remains owner-editable.
- **Client acceptance block** (default ON for new furniture A4): signature/date lines both sides ("CLIENT ACCEPTANCE — Signature & Date" | "WOODEX — Authorized Signatory & Stamp"), matching WI-10204.
- **Signatory footer variant** selectable in designer: `Zainab Tower` (default, from WI-10204) / `Store address` (furniture floor) / custom lines. Footer includes `+92 322 4000768 | info@woodex.com.pk` per house doc.
- Replaces in `QuoteA4Sheet.tsx` / `PrintableInvoice.tsx`: `Math.round(total * 0.75)` → `template.advancePct` (fallback 75); labels use the policy wording; the hardcoded "Advance required (75%)" rows derive from the same constant.

#### 7.1.3 Existing data untouched
Old quotes without `advancePct`/`validityDays` keep classic rendering (conditioned fallbacks), per standing rule "A4 default for NEW quotes only".

#### 7.1.4 Demo seed from the real documents (owner-approved)
Seed (browser-local only): **"WI-10204 — Luxury Residence (Turnkey)"**, **"WI-DC-001-26 — Daycare Interior"**, **"QT-10183 — Office BOQ"** rendered through the existing pipeline with **synthetic contact data** — **client names and phone numbers are NOT copied into git**; the seeded names use fictitious lookalikes (e.g., "Mr. T." → seeded as `Demo Residence Client`). The **numbers/lines are re-created as generic sample lines** for the demo, amounts approximated to the original order of magnitude (PKR ~1.4 M). The real documents remain in the owner's Drive only.

#### 7.1.5 Acceptance criteria
- Editing any designer field updates the A4 preview ≤200 ms; print output matches preview exactly (same component, `@media print` path).
- Advance amounts in preview equal formula for 50/60/75/100 %; wording placeholders resolve in EN and UR; reset restores WI-10204 wording byte-for-byte.
- Old quote fixture (no template fields) renders as before; e2e covers one new-furniture A4 and the acceptance block; axe 0 violations on designer route; a11y for the preview's `aria-live="polite"` debounce region.

### 7.2 P4.2 — Interior turnkey BOQ built-in template (SECOND, after P4.1 signed off)

- New built-in template `interior-boq` in the same designer: **SUMMARY OF COST** table (Phase I–IV rows: Demolition / Architectural & Woodwork / Electrical & MEP / Finishing — phase names editable) + **DETAILED BILL OF QUANTITIES** (columns: `Sr · Description · Qty · Unit (SFT/NOST/L/S) · Rate · Amount`, with row & section subtotals) + the WI-10204 advance/policy block + acceptance block + signatory footer.
- Totals flow: BOQ row sum → Summary rows (mapped by section phase tag) → grand total — live recompute, no manual sync (same recompute pattern as Invoice/BOQ recompute e2e).
- "Convert to invoice" keeps advance/milestone split from template advancePct (default 50/50/… configurable per template — owner may want 50 on signing + 50 on completion for interiors; still per-template editable).
- Seeded against the three demos; interior users get their document look without new tooling.

**Acceptance:** a new interior BOQ can be authored end-to-end and prints a 3–4 page A4 matching the WI-10204 skeleton; e2e: totals math (BOQ→summary→grand) verified; export PDF parity; no regression on furniture A4.

---

## 8. Module P0½ — Import tooling (build NOW per owner) + §6 enrichment

### 8.1 Importer UX
`/admin/import` (new, linked from Settings → Data): **Step 1** choose dataset (`Lead 2026` | `Income/Expense GL`) → **Step 2** drop/pick `.xlsx|.csv` → **Step 3** serverless parse (SheetJS, lazy chunk) → **Step 4** preview: row counts, detected headers, first 10 rows, validation issues (bad phone, missing amount) with fixable cells → **Step 5** "Commit to demo store" with a **dry-run count summary** (`26 clients, 0 duplicates, 2 warnings`). Commit writes **only** the demo adapter; a banner states this; hosted upload simply does not exist.

### 8.2 Mappings

**Lead 2026 → leads**
`Sr→` (drop) · `Date→createdAt` (dd/mm/yyyy) · `Company→company` · `Name→name` · `Contact→phone` (normalize `333-4405830`/`+92…` → `03xx-xxxxxxx`; keep raw in `note`) · `Designation→` (append to note) · `Location→city` · `Lead Source→leadSource` (map `Furniture|Project|Interior`) · `Status→status` (`New Lead→new`, `Client→contacted`+`kind=business client`, `Proposal/ Quotation→quoted`, `Meeting→meeting`(new), `Won→won`, `Done→won`+note, `Not Respoding→not_responding`(new)) · `Assassin to→assignedTo` (free text, seeded `Abdullah|Nabeel|Imtiaz`) · `Quotation→quotationRef` · `Last Contact→lastContact` · `Action→nextAction` · `Meeting Schedule→meetingAt` · `Note→note`.
Duplicates: phone-normalized match against existing demo leads → merge review instead of blind insert.

**IncomevsExpense `.xlsx` → ledger**
Sheets `GL *` → rows; columns map: `Date→date`, `Project→projectTag`, `Name→payee` (Vendor/Employee), `Account→account`(raw), `Catagory→category` (validated against §9 category list; unknown → `Other (imported)`), `Sub Catagory→subCategory`, `Dabet→debit`, `Credit→credit`, `Pay By→payBy`, `Note→note`, `Amount→amount` (sign by debit>credit). `Dashboard` sheet is **ignored** (recomputed). Months inferred from sheet names + row dates; 1,300+ rows expected across months — importer must handle a full year; cap 5,000 rows with a friendly guard.

### 8.3 Acceptance
Round-trip test: export demo ledger → CSV matches importer acceptance of same CSV (parity check); Lead import of a 29-row fixture creates 29 leads (or 28 + 1 duplicate routed to merge review); zero writes to hosted (network assertion); progress bar; error rows are downloadable as CSV.

---

## 9. Module P6 — Income & expenditure, FULL 1:1 parity (owner decision)

### 9.1 Where
New `/admin/ledger` — **Finance** section: `Ledger` between Invoices and Projects; Lucide `Wallet`; sidebar badge = entries this month. Same Financial nav group, existing capability gate (`finance.manage` in demo; hosted RLS unchanged because demo-only this phase).

### 9.2 Model (mirrors old XLSX exactly)

```ts
// demo store: ledger_entries
interface LedgerEntry {            // one row of the old "GL <month>" sheets
  id: string;                      // "LE-<n>"
  month: string;                   // "2026-11" (derived from date; sheet name parity kept for import)
  date: string;                    // ISO
  projectTag?: string;             // "Beacon House", "Gents Grooming Lounge"… (joins Projects)
  payee?: string;                  // old "Name" column (person/vendor paid)
  account?: string;                // old "Account" raw label if present
  category: LedgerCategory;        // §9.3 list
  subCategory?: string;            // old "Sub Catagory"
  debit: number;                   // PKR out (old "Dabet")
  credit: number;                  // PKR in
  payBy?: string;                  // Cash / Bank / Advance / Person name
  note?: string;                   // old "Note"
  source: "manual" | "imported" | "po" | "invoice";  // po/invoice = cross-posted from other modules
  createdAt: string;
}
```

**Views (tabs) mirroring the old workbook:**
1. **Dashboard** (per month, like old `Dashboard`): month picker; KPI cards `Income · Expense · Net · Cash in hand (running)`; **Totals by category** table (Labour, Office Expense, Personal, Workshop, Project, Material, Vendor, Rent, Other) — debit vs credit split; bar chart (recharts, existing dep) top categories; "Open month as GL" button.
2. **GL** (the working sheet): dense editable grid, monthly filter; columns exactly: `S.No · Date · Project · Name · Account · Category · Sub Category · Debit · Credit · Pay By · Note · Amount`; add/edit/inline-delete with confirm; running total row; PKR formatting; CSV export per month (columns identical); **keyboard-first entry** (Enter commits row, ↑/↓ navigates — the owner types ledgers daily).
3. **By project** pivot (enhancement beyond old file, cheap): project → income/expense/net (feeds Projects margin view).
4. **KPIs strip** always on top (owner asked for month KPIs even in parity mode).

### 9.3 Categories (exact old list + two)
`Labour · Office Expense · Personal · Workshop · Project · Material · Vendor · Rent · Utilities · Other` (Utilities added — old sheet shoehorned utilities into Office; subCategory preserves nuance).

### 9.4 Cross-posting hooks (v1)
- PO goods-receipt (Option C path, already live) can **optionally** post a `source:"po"` row (Debit=actual, Category=Material, note carries `poRef`) — **off by default, "Post PO actuals to ledger" toggle in Settings** — owner-gated per §3.12 convention; if disabled, ledger standalone.
- Advance invoice marked "paid" can post a `source:"invoice"` credit row (Project tagged) — same toggle mechanics.
Both hooks populate ONLY the demo adapter.

### 9.5 Acceptance
- Jan-2025-style month can be imported (8.2) and its Dashboard totals reproduce the old file's Math: Labour 246,650 · Office 131,269 · Personal 231,600 · Workshop 14,050 · Project 984,800 · Material 483,200 · Vendor 274,000 · Rent 38,600 · **Total 3,214,138** (tolerance ±1 on rounding) — this is the parity test, run headless.
- New entry via UI → appears in GL + Dashboard + CSV; edit/delete reflected; net = credits − debits; PKR; keyboard flow works; e2e; axe 0 on ledger routes; mobile usable (grid scrolls, KPIs stack).

---

## 10. Module P3 — Lead generation & tracking (Lead 2026 parity)

### 10.1 Model deltas (`AdminLead`)
Add: `assignedTo?: string` (seeded Abdullah/Nabeel/Imtiaz + Settings → Team list for the demo) · `leadSource?: "furniture" | "interior" | "project" | "website" | "storefront_chat" | "referral"` · `quotationRef?: string` · `lastContact?: string` (ISO) · `meetingAt?: string` (ISO) · `nextAction?: string` · `note?: string`. Statuses: add `not_responding`, `meeting` to `LeadStatus` union + `LEAD_STATUSES` in Leads.tsx; kanban renders 7 columns (horizontal scroll on small screens).
### 10.2 Surfaces
Leads kanban/table + lead drawer: **Assignee** select (Team), **Last contact** + quick-stamp button ("Contacted now"), **Next action** text, **Meeting** datetime, **Note** textarea, **Source** select, **Quotation ref** (links to Quotes list when present). Filter chips: Mine / Unassigned / Stale > 7d (uses lastContact) — mirrors the sheet's aging pain ("Jun to July Expected" rows).
### 10.3 Import
Via §8 importer only — no hand entry of 29 rows.
### 10.4 Acceptance
Import fixture → 29 leads, correct statuses incl. `not_responding`/`meeting`, assignee preserved; kanban DnD works with new columns; "Mine" filter filters by a chosen assignee; CSV export; e2e + axe clean; hosted untouched.

---

## 11. Module P5 — Invoice tracking + new invoice (polish, not rebuild)

1. **InvoiceNew** parity with quote advance logic: asks "Milestone invoice from quote?" — pulls advance/balance from the linked quote template's `advancePct`; milestone labels (`Advance (75%) — contract signing` / `Balance (25%) — completion`) editable.
2. **Tracking column + pipeline**: `/admin/invoices` gets `Status: draft|sent|partial|paid|overdue`, partial payment amounts (PKR), last-payment date, 1-click **WhatsApp reminder** (deep-link with invoice ref — click-only, no API).
3. **Invoice doc**: reuse the 30-day validity + acceptance blocks from P4 template (invoice variant wording: "Invoice payable within 30 days"), same preview-in-designer treatment when touched — otherwise print CSS only.
4. **"Convert quote→invoice in one click"** — existing flow kept; advance math now per-template; e2e proves Rs figure on a converted invoice equals 0.75 × quote total.

**Acceptance:** invoice from quoted→generate→print shows correct advance; partial payment updates status automatically; CSV export of invoice ledger; e2e + axe.

---

## 12. Delivery plan — PRs (small stack, one phase per PR)

| Phase | PR | Contents | Gate |
|---|---|---|---|
| **PR-A** | Foundation: importer + demo seed + Lead 2026 model deltas + CSV export helpers | types, demo db, `/admin/import`, Leads fields incl. new statuses, xlsx lazy dep | tests/e2e green |
| **PR-B** | **P0 Live chat** (first owner-visible value) | §4 full; screenshots | owner demo call |
| **PR-C** | P2 Client categories | §6 | tests |
| **PR-D** | P3 Lead parity UI (kanban 7 cols, filters, My/Stale) | §10 | tests |
| **PR-E** | P4.1 Furniture A4 (designer preview, advance %, WI-10204 wording, acceptance block, footer variants, validity) | §7.1 | **owner prints one real A4 & confirms** |
| **PR-F** | P1 Complete e-commerce pass | §5 | network-scan e2e |
| **PR-G** | P6 Ledger (full parity) | §9 incl. parity test | **owner imports his real file & sanity-checks Jan totals** |
| **PR-H** | P5 Invoice polish | §11 | tests |
| **PR-I** | P4.2 Interior BOQ template | §7.2 | owner prints an interior quote |
| (later) | Hosted rollout proposals (chat table, ledger table, VITE_API_MODE) | separate proposals, NOT built | separate owner decision |

Each PR: `/tmp/bin` PATH, e2e from repo root, no force-push, never `pkill -f vite`, no `supabase/functions/mcp/index.ts` churn, MASTER-TODO + this doc updated in the same PR. PRs stack from `arena/ea76e5b6-woodex-reimagined`; owner merges each explicitly.

## 13. Verification & quality gates (every phase)

Playwright e2e (chromium) new specs: `chat.spec.ts`, `import.spec.ts`, `ledger.spec.ts`, `quote-advance.spec.ts`, `lead-parity.spec.ts`; existing 78/78 must stay green; axe sweep 0/xx violations incl. new routes; build + preview smoke; screenshots for owner (storefront bubble desktop+mobile, admin inbox, designer live preview, ledger Dashboard vs old XLSX side-by-side); network assertion "no off-Supabase third-party hosts" for chat/e-comm flows.

## 14. What is explicitly PENDING owner action

- Hosted Supabase: migrations 0013/0014 runbook execution (docs/07 §10) — **owner-side**; 0015 ad-spend & 0016 allocation — proposal only.
- VITE_API_MODE flip — not this plan.
- Payments/delivery/returns automation; real data migration programme; deployment of the integrated system — **separate programmes, require separate words.**
- Interior photos/pricing sign-off for any new catalogue images used in §5 (none are invented).
- WI-10204 demo seed uses synthetic contact data; the real document files stay in Drive (policy: no real client data in git).

## 15. Notebook of proof (files this plan is grounded in)

Drive IDs listed in §2 · repo paths quoted inline · PR #23 merge receipt: gh → `state: MERGED`, merge commit `ce894b6`, mergedAt `2026-11-08T12:51:53Z` · leading document family: `MASTER-TODO.md` (registry) · prior art: `UPGRADE-MASTER-PLAN-V3.md` (convergence), `PO-BOQ-AUTO-ALLOCATION-PROPOSAL.md` (Option C, shipped), `COMMERCE DOCUMENT FAMILY` overhaul notes.

---
**Ready to build on owner's word. First PR: PR-B live chat (PR-A foundation folds in or precedes it — sequence owner can strike: say "start").**
