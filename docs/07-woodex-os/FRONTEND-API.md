# Frontend API — Complete Inventory, Gaps and Integration Plan

**Question answered:** *what exists today, what is missing, and what must be added so the complete frontend
(storefront) can run on WOODEX OS?*
**Measured against:** `routes/api.php`, `routes/web.php`, `app/Integrations/Mcp/McpTools.php` at HEAD `c437cad`.

---

## 1. What the OS exposes today (complete inventory)

### 1.1 Public JSON API — `routes/api.php`

| Method | Path | Purpose | Auth | Throttle |
|---|---|---|---|---|
| POST | `/api/public/leads` | Website enquiry → CRM lead | none | `public-leads` |
| POST | `/api/public/chat/start` | Open a visitor chat thread | visitor token | `chat-write` |
| POST | `/api/public/chat/send` | Visitor message | visitor token | `chat-write` |
| GET | `/api/public/chat/messages` | Poll replies | visitor token | `chat-poll` |
| GET | `/api/forms.php` | Legacy site form config | none | `public-site` |
| POST | `/api/forms.php` | Legacy site form → CRM | none | `public-site` |
| GET/POST | `/api/chat.php` | Legacy chat bridge | none | `public-site` |
| POST | `/api/mcp` | JSON-RPC 2.0 MCP (read-only tools) | `wx_mcp_` bearer | 120/min |
| GET | `/api/bridge/v1/status` | Bridge health | bridge key | — |
| GET | `/api/bridge/v1/leads` | Recent leads (no contact data) | bridge key | — |
| GET | `/api/bridge/v1/quotes` | Recent quotes (no client data) | bridge key | — |

**MCP tools available (7, all read-only):** `woodex_status`, `woodex_site_status`, `woodex_list_pages`,
`woodex_get_page`, `woodex_seo_report`, `woodex_list_leads`, `woodex_list_quotes`.

### 1.2 Signed customer surfaces (already built — reuse, don’t rebuild)

| Path | What it is |
|---|---|
| `/q/{public_id}` | Quote portal: view, PDF, **accept**, **request changes** |
| `/i/{public_id}` | Invoice portal: view, PDF, **upload payment proof** |
| `/p/{public_id}` | Project portal: view, documents, receipts, handover |
| `/portal` | Portal access-code form |
| `/webhooks/telegram`, `/webhooks/whatsapp` | Inbound channel webhooks |
| `/media/{media}/{name}` | Media streaming route |
| `/sitemap.xml` | `SitemapController` |

### 1.3 Admin

106 route definitions in `routes/admin.php`; 117 Livewire components; every screen permission-gated.

---

## 2. The gap: nothing catalogue-shaped

The storefront needs to read products, categories, series, materials, packages, projects, posts and services, and
to write quotes, carts and orders. **None of that exists as an endpoint** — and 7 of the 8 catalog-shaped things
do not exist as tables either (see `OS-BASELINE.md` §3).

| Storefront need | Today | Required |
|---|---|---|
| Product list / detail | ❌ | `GET /products`, `/products/{slug}` |
| Categories, series, materials | ❌ (only inside HTML files) | `GET /categories`, `/series`, `/materials` |
| Room packages, projects, posts, services | ❌ | dedicated read endpoints |
| Quote submission | 🟡 `POST /api/public/leads` only (no quote) | `POST /quotes` → `Lead` + `Quote` |
| Cart & checkout | ❌ | `POST /carts`, `PATCH /carts/{id}/items`, `POST /checkout` |
| Order status | ❌ | `GET /orders/{no}?token=` |
| Payments | 🟡 manual proof upload on invoices | `POST /payments/intents`, `POST /webhooks/{gateway}` |
| Customer auth | ❌ public side | OTP + Sanctum tokens |
| Search | ❌ | `GET /search?q=` (MySQL fulltext first) |
| Page content for Puck pages | ❌ | `GET /pages/{slug}` (JSON + resolved blocks) |
| Agent | 🟡 bot in admin chat only | `POST /agent/ask`, tool endpoints |

---

## 3. Target surface — `/api/storefront/v1`

Full schema: [`openapi.yaml`](./openapi.yaml) (30 paths). Layer plan:

### 3.1 Reads (public, cacheable)

```
GET /products            ?q, category, series, material, color, min_price, max_price, in_stock,
                          sort, page, per_page        → ETag + Cache-Control: public, s-maxage=300
GET /products/{slug}
GET /categories          (tree, with counts)
GET /series              GET /materials
GET /room-packages       GET /projects            GET /projects/{slug}
GET /posts               GET /posts/{slug}        GET /services
GET /showrooms           GET /pages/{slug}         GET /search?q=
GET /sitemap-urls        (machine list for prerender / ISR)
```

### 3.2 Writes (token or idempotency key)

```
POST /quotes                     → Lead + Quote, returns {number, token, pdf_url}
GET  /quotes/{number}?token=     POST /quotes/{number}/accept
POST /carts                      PATCH /carts/{token}/items      GET /carts/{token}
POST /checkout                   (Idempotency-Key required)  → Order + draft Invoice
GET  /orders/{number}?token=
POST /payments/intents           POST /webhooks/{gateway}   (HMAC verified)
POST /leads                      POST /newsletter
POST /agent/ask                  POST /agent/tools/{tool}
```

### 3.3 Advanced features (the “integrate completely” list)

| Feature | Design | Why it matters here |
|---|---|---|
| **Contract-first** | `openapi.yaml` is the source of truth; CI runs Schemathesis/pytest against staging | prevents frontend/backend drift across 3 devs |
| **Caching** | `ETag` + `Cache-Control: public, s-maxage=300` on reads; `Cache::remember` fragments; explicit invalidation on product/price publish | shared hosting has no Varnish |
| **Idempotency** | `Idempotency-Key` table (48 h) on quote/checkout/payment | retries on flaky mobile networks must not double-order |
| **Public tokens** | quote/order/cart tokens: 32-byte URL-safe, expiring, scoped, hashed at rest | no customer enumeration; works without login |
| **Auth** | OTP over WhatsApp/email → Sanctum token; B2B company users later | PK customers expect WhatsApp, not passwords |
| **Rate limits** | reads 120/min/IP, writes 10/min/IP, leads 5/min/IP, agent 20/min/session | abuse protection on cheap hosting |
| **Webhooks out** | `order.created`, `order.paid`, `quote.accepted`, `stock.low` → existing `WebhookEvent` table | n8n/Make/Telegram automations without new code |
| **Search** | MySQL FULLTEXT on name + short_description + sku; relevance + fallback LIKE | no Elasticsearch on shared hosting |
| **Media** | `/media/{id}/{name}`, 3 derived sizes + WebP, immutable cache | storefront must not hot-link `src/assets` |
| **Server-driven blocks** | `GET /pages/{slug}` returns Puck JSON **with** data-bound blocks resolved server-side | storefront can host Puck pages without duplicating catalog logic |
| **SEO** | `/sitemap-urls` + canonical + JSON-LD (`Product`, `BreadcrumbList`, `FAQPage`) generated by the API | the SPA prerender step consumes it |
| **i18n** | `Accept-Language` → `en` (default) / `ur`; content fields per locale | Urdu support is a business requirement |
| **Analytics** | `POST /events` (buffered, sampled) + GA4 Measurement Protocol server-side | ad-blockers kill client GA4 |
| **Agent** | existing `wx_mcp_` key + commerce tools, policy engine enforced server-side | one agent, two channels |
| **Observability** | request id, slow-query log, `IntegrationLog` for every outbound call | debugging on a host without APM |

---

## 4. Integration stages (frontend ↔ OS)

```
S0  Contract        openapi.yaml frozen · mock server · CI schema check        (wk 1-2)
S1  Catalog read    products/categories/series/materials/pages → storefront     (wk 3-6)
S2  Quote write     POST /quotes → Lead + Quote · status page · accept          (wk 7-9)
S3  Cart/checkout   carts · orders · invoice bridge · bank/COD                   (wk 8-11)
S4  Payments        Safepay/JazzCash/easypaisa · webhooks · refunds             (wk 11-14)
S5  Agent + auth    OTP login · order history · agent tools                     (wk 14-17)
```

**Switching the storefront safely:** `VITE_DATA_SOURCE=static|api` with per-page allow-listing, so a page moves
to the API only when its parity test passes (same products, same prices, same ordering, same SEO tags).

---

## 5. Page-by-page mapping (the completeness check)

| Storefront route | Endpoints | Status after S-stage |
|---|---|---|
| `/` | `/products` (featured), `/categories`, `/series`, `/pages/home` | S1 |
| `/shop`, `/shop/:id` | `/products`, `/products/{slug}` | S1 |
| `/series`, `/series/:id` | `/series`, `/products?series=` | S1 |
| `/materials`, `/room-packages` | `/materials`, `/room-packages` | S1 |
| `/projects`, `/projects/:id` | `/projects`, `/projects/{slug}` | S1 |
| `/services`, `/services/:slug` | `/services` (+ page blocks) | S1 |
| `/blog`, `/blog/:id` | `/posts`, `/posts/{slug}` | S1 |
| `/quotation` | `POST /quotes` | S2 |
| `/checkout` | `/carts`, `/checkout`, `/payments/intents` | S3/S4 |
| `/virtual-showroom`, `/custom-design` | `/pages/{slug}` + existing forms | S1 |
| Order/quote tracking | `/orders/{no}?token=`, `/quotes/{no}?token=` | S2/S3 |

---

## 6. Non-negotiables

1. **No second source of truth.** The API is a façade over OS models; the storefront holds no business rules.
2. **Money never leaves the OS.** Cart totals are indicative; the invoice is authoritative.
3. **Every write is idempotent and audited.**
4. **Existing consumers keep working**: `forms.php`, `chat.php`, `/api/public/*` and the signed portals are not
   changed — new endpoints live under `/api/storefront/v1`.
5. **Contract tests gate merges**: a breaking change to a published field fails CI.

---

## 7. Migration log — what the storefront actually reads from the OS today

The plan above is the target. This table is the truth, and it is updated only when a page stops
reading a bundled array and starts reading an endpoint. "Snapshot" means the page never blanks:
it renders `src/data/*` on the first frame and the API replaces it when it answers.

| Route | Reads from the OS | Endpoint | State |
|---|---|---|---|
| `/shop` | products, categories | `GET /products`, `GET /categories` | ✅ T13 |
| `/shop/:slug` | product detail, related | `GET /products/{slug}`, `GET /products?category=` | ✅ T13 |
| `/series`, `/series/:slug` | products | `GET /products` | ✅ T13 |
| `/quotation` | products (picker) | `GET /products` | ✅ T13 |
| `/materials` | finish + material vocabulary, with per-option product counts | `GET /materials` | ✅ T26 |
| `/` | featured products, categories, series | — | ⬜ snapshot |
| `/room-packages` | room packages | — | ⬜ snapshot |
| `/projects`, `/projects/:slug` | projects | — | ⬜ snapshot |
| `/blog`, `/blog/:slug` | posts | — | ⬜ snapshot |
| `/services`, `/services/:slug` | services | — | ⬜ snapshot |
| `/showrooms` | showrooms | — | ⬜ five hard-coded addresses |
| `/contact`, `/about`, `/warranty`, `/b2b` | leads, warranties, copy | — | ⬜ snapshot |

**T26 — materials, and why it was not cosmetic.** `/materials` kept four private arrays: six wood
finishes, twelve fabric colours, five metal finishes, four prose "material standards". The
catalogue has **three** finishes and fourteen materials, and six of the page's named finishes
did not exist anywhere in it. A customer could read the page, choose Espresso, and be offered
nothing — the page was a brochure that outran the factory.

The page now renders `GET /materials`, which groups `commerce_attribute_options` by attribute
and counts, per option, the published products and active variants that carry it. Three
consequences worth knowing:

- **The palette is an attribute, not a table.** An administrator adding a colour in
  *Commerce → Attributes* makes it appear here with no deploy, which is what the migration that
  created the option table promised ("the option is the swatch").
- **A dead option is visible.** An option with zero products and zero variants is drawn greyed
  with "Not currently offered", so a colour the shop cannot deliver is never presented as one it
  can.
- **No count is typed into the copy.** The page derives "3 colours · 17 materials" from the
  payload. `MaterialVocabularyTest` fails the build if a numeral reappears in a heading.
