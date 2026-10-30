# Feature Parity — What the Frontend Shows vs. What WOODEX OS Can Do

Measured against the live storefront (`https://sbx-6hrgnvda5zy72gi6.arena.site`, same code as
`/home/user/woodex-reimagined`) and the OS clone at `c437cad`.

---

## 0. The headline finding

| Measure | Result |
|---|---|
| Routes | **23** |
| `fetch()` / API calls in the entire frontend | **0** |
| Forms that submit to a server | **0** |
| Pages backed by static TS arrays | Shop, Series, ProductDetail, Blog, Quotation, Checkout, Services |
| Pages with no persistence at all | Showrooms, Materials, Warranty, B2B, CustomDesign, Contact |

**Every form on the site ends in a toast.** "Request a quotation", "Book a showroom visit", "Register warranty",
"Apply as a dealer", "Contact support" — none of them reaches a database, a mailbox, or a human. The site is a
brochure with working navigation.

So the parity work is **not** "port nine pages". It is: give nine already-designed surfaces a backend that remembers
what the visitor said.

---

## 1. Gap-by-gap

Legend — **Have**: what exists in the OS today. **Need**: the smallest addition that makes the page real.
**Where**: the OS domain that grows (no new silos unless stated).

### 1.1 Showrooms — `/showrooms`, `/virtual-showroom`

| | |
|---|---|
| **Frontend today** | 169 lines: hard-coded list of showrooms with city/address/phone; "book a visit" opens a toast. Virtual showroom is a static panorama viewer. |
| **Have in OS** | Nothing. Zero matches for "showroom" in `app/Domain`, `Livewire`, migrations. |
| **Need** | `locations` table (type=showroom, city, address, geo, hours JSON, phone, email, photos, services_offered). Public API + map. `location_appointments` (slot, person, status) → creates a **CRM Deal** of type *visit* and a **Conversation**. Staff calendar in admin. |
| **Where** | New small module `Domain/Places` (locations + appointments); writes into existing `Crm`, `Conversations`. |
| **Puck block** | `ShowroomCard`, `ShowroomLocator` (map + filter by city), `AppointmentForm`. |
| **Done when** | Visitor books a slot; it appears on the staff calendar within 60 s; confirmation email + WhatsApp template sent. |

### 1.2 Materials & Colours — `/materials`

| | |
|---|---|
| **Frontend today** | 227 lines + `data/materials.ts`: 16 materials as local JPG imports, filter by category (wood/laminate/metal/fabric) and brightness. No link to any product. |
| **Have in OS** | `material` appears in 10 files (theme/asset contexts), **not** as a catalogue concept. |
| **Need** | `materials` (code, name, family, finish, colour_family, hex, swatch media, care notes, price tier, supplier), `material_variants` for colourways, and a **bridge** `material_id ↔ Bagisto attribute value` so a product's "Natural Oak" is the same record. Filter API (family, colour, finish, brightness). |
| **Where** | `Domain/Catalog` (the OS-side catalogue the storefront reads); attribute values live in Bagisto. |
| **Puck block** | `MaterialSwatchGrid`, `MaterialFilter`, `MaterialStory` (editorial + swatches). |
| **Done when** | An editor adds a material once; it appears on `/materials`, on every product using it, and in the Puck swatch picker — with no code change. |

### 1.3 Warranty — `/warranty`

| | |
|---|---|
| **Frontend today** | 230 lines: marketing copy about coverage + a "register your product" form that toasts. |
| **Have in OS** | One unrelated migration mention; no warranty concept. |
| **Need** | `warranty_registrations` (order line id, serial/batch, purchased_at, coverage_months, status, documents), `warranty_claims` (symptom, photos, assessment, decision, resolution), and a **service job** link so a claim becomes real work. Public registration must accept an order number + phone (no login). |
| **Where** | `Domain/Service` (new sub-module next to Projects); consumes `commerce_orders`/`commerce_order_lines` mirrors. |
| **Puck block** | `WarrantyLookup`, `WarrantyTerms`. |
| **Done when** | Customer registers a real order; claim raised from the site lands in the service queue with the order and warranty attached. |

### 1.4 Support / Contact — `/contact`

| | |
|---|---|
| **Frontend today** | 219 lines, form → toast. No ticket number, no history. |
| **Have in OS** | **`Domain/Conversations`** (inbox, channels, polling), CRM contacts, and an AI assistant with 7 tools. |
| **Need** | Public contact endpoint → creates/attaches a `Conversation` with a **case number**, SLA timer, attachments, and route-to-team rules. Auto-reply from the AI agent with the knowledge base, escalate on keyword. Status page for the customer (case number + email, no login). |
| **Where** | Extend `Conversations` (public intake channel `web_form`). |
| **Puck block** | `ContactForm`, `SupportHours`, `CaseLookup`. |
| **Done when** | A visitor's message lands in the staff inbox with SLA, and the AI resolves or escalates it — never silently dropped. |

### 1.5 Distributors / Dealers — `/b2b`

| | |
|---|---|
| **Frontend today** | 224 lines: dealer program pitch, "Request B2B Catalog" → `/quotation` toast. Zero capture of the applicant. |
| **Have in OS** | CRM pipelines + `PipelineStage`, Sales quotes, Accounts. |
| **Need** | `dealer_applications` (business name, NTN, city, showroom area, volume estimate, documents) as a **CRM deal type** with a review pipeline (applied → verifying → approved → onboarded). On approval: create Bagisto **customer group = Dealer** + price list, and an OS account. |
| **Where** | Extend `Crm` (pipeline *Dealer Onboarding*); write-through to Bagisto. |
| **Puck block** | `DealerApplicationForm`, `DealerBenefits`, `DealerMap`. |
| **Done when** | An application is captured, reviewed in admin, and approval grants dealer pricing on the shop automatically. |

### 1.6 FAQ

| | |
|---|---|
| **Frontend today** | `FAQSection` component on the home page; no `/faq` route; questions hard-coded in the component. |
| **Have in OS** | **`ContentEntry` with `kind = faq`** — a real table, a real model, **served by nothing**. |
| **Need** | Make `ContentEntry`/`content_entries` real: admin CRUD, categories, ordering, per-page assignment, JSON-LD `FAQPage` output, search. Served through the Puck `FAQ` block's `LibraryEntry` contract, which already exists in code. |
| **Where** | `Domain/Website` — wire the existing library, don't build a second one. |
| **Puck block** | `FAQ` (already a `BlockType` case) reading from the library. |
| **Done when** | Editor writes an FAQ once; it renders wherever the block is placed and emits valid FAQ schema. |

### 1.7 B2B / Markets

| | |
|---|---|
| **Frontend today** | Marketing page only. "Markets" is a footer link; no market, country or export content exists. |
| **Have in OS** | Multi-line business (`Interior`, `Furniture`, `Project`), Accounts, Quotes. |
| **Need** | `markets` (country, region, currency, incoterms, shipping mode, local agent, lead time, compliance notes) + `market_enquiries`. Public market pages (SEO: "WOODEX in Saudi Arabia"), enquiry → CRM. Optionally Bagisto channel per market later. |
| **Where** | `Domain/Markets` (small) + `Crm` for enquiries. |
| **Puck block** | `MarketGrid`, `MarketHero`, `ExportEnquiry`. |
| **Done when** | Each target market has an indexable page and its enquiries land in a market pipeline. |

### 1.8 Custom Design — `/custom-design`

| | |
|---|---|
| **Frontend today** | 378 lines: a guided multi-step brief (space, style, dimensions, budget, uploads) that ends in a toast. The most wasted page on the site — it collects the richest intent and discards it. |
| **Have in OS** | `Domain/Projects` (projects, phases, files), Sales quotes, Conversations. |
| **Need** | Persist the brief: `design_requests` (structured answers JSON, UploadedFile rows, budget band, due date) → auto-create a **Project** in *Intake* stage + a **Quote draft** + a Conversation thread. Designer triage queue in admin. |
| **Where** | Extend `Projects` + `Sales`; public endpoint under the storefront BFF. |
| **Puck block** | `CustomDesignIntro`, `DesignBriefForm` (the existing multi-step component, wired). |
| **Done when** | A submitted brief appears as a triaged project with the customer's photos attached, and a designer can quote from it without copy-paste. |

### 1.9 E-Quotation — `/quotation`

| | |
|---|---|
| **Frontend today** | 466 lines: quote basket in React state, client details, then **"Open email" / "Open WhatsApp"** with a text blob. Nothing is stored; no number; no follow-up. |
| **Have in OS** | **The strongest asset in the estate**: `CreateQuote`, `ReviseQuote`, `AcceptQuote`, `RaiseAdvanceInvoice`, `RaiseMilestoneInvoice`, `RecordPayment`, `AllocatePayment`, double-entry Accounts, PDF templates, number sequences (`WI-`/`WF-`). |
| **Need** | The public half: draft quote creation from the storefront basket (rate-limited, captcha, no login required), a **signed shareable link** (`/q/{token}`) with accept/decline, email + WhatsApp delivery, expiry, revision history, and **Convert to order → Bagisto checkout**. |
| **Where** | `Domain/Sales` — expose what already exists; do not rebuild quoting. |
| **Puck block** | `QuoteBasket`, `QuoteRequestCta`. |
| **Done when** | A visitor builds a basket, gets a numbered PDF quotation by email, accepts it online, and the salesperson converts it to a paid order. |

---

## 2. Summed up as work

| Gap | OS work | New tables | Effort |
|---|---|---|---|
| Showrooms + appointments | Places module, calendar, CRM hook | 2 | M |
| Materials & colours | Catalog module + Bagisto attribute bridge | 2–3 | M |
| Warranty | Service sub-module + claims workflow | 2–3 | L |
| Support cases | Conversations public intake + SLA | 1–2 | M |
| Distributors | CRM pipeline + Bagisto group sync | 2 | M |
| FAQ | wire existing `ContentEntry` | 0 | **S** |
| Markets | small module + enquiry | 2 | S |
| Custom design | Projects intake + triage | 1–2 | M |
| E-Quotation | expose existing Sales | 1–2 | M |

**≈ 13–16 tables, 9 admin screens, 9 Puck blocks, ~24 public endpoints.**
Nothing here duplicates Bagisto: **no carts, prices, stock, payments or orders** are created by these modules — they
hand off to Bagisto through the BFF.

---

## 3. What the OS already has that the frontend never showed

Worth stating, because it changes priorities: the frontend is the *smaller* half.

`Conversations` inbox · `Projects` with phases · `Accounts` double-entry · automation rules · AI assistant with 7 tools ·
website builder (142 pages) · SEO agent · speed module · import/export · 180 tests.

**The plan is not "build a shop". It is "expose two mature backends through one storefront."**

---

## 4. Acceptance — one sentence per gap

1. Showroom visit booked on the site shows on the staff calendar.
2. A material edited once updates the library, the product page and the Puck picker.
3. A warranty claim opened from the site reaches the service queue attached to a real order.
4. A support message becomes a case with an SLA, never a toast.
5. A dealer application can be approved and immediately see dealer prices.
6. An FAQ written in admin renders on any page with valid schema.
7. Each market has an indexable page and its enquiries reach a pipeline.
8. A custom-design brief becomes a triaged project with photos attached.
9. A storefront basket becomes a numbered, accepted, converted quotation.
