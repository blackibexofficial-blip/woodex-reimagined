# Open Questions — v6

> **Status: the owner skipped the question round (31 Oct 2026). The recommended default for each is adopted and the
> plan proceeds on it.** Every default is reversible until the phase that depends on it starts. Reply with a letter
> and the plan is re-cut — it costs nothing today and more later.

---

### Q1 — Who runs the catalog day to day?

This decides how much admin polish goes into P1 versus P5.

| Option | Consequence |
|---|---|
| **A. A merchandising staff member adds/edits products, prices, photos in the OS admin** | Admin screens get real polish in P1–P2 (inline edit, bulk actions, image cropping). **Recommended** |
| B. Devs load everything; staff only view orders | Faster build, but every price change becomes a ticket |

**Default: A.** It changes the product screen's scope, not the architecture.

---

### Q2 — The 142 existing pages: migrate all, or curate?

| Option | Consequence |
|---|---|
| **A. Migrate top 30 + all product/category pages; 301 the rest to the nearest parent** | On-time launch, no ranking cliff if the redirect map is reviewed. **Recommended** |
| B. Migrate all 142 | Adds ~3–4 weeks; many pages are near-duplicates |
| C. Keep legacy HTML, migrate only new pages | Two builders forever — rejected |

**Default: A**, with a URL-by-URL redirect map approved before cutover.

---

### Q3 — Who loads the 148 products?

| Option | Consequence |
|---|---|
| **A. We import from the existing TS data into the commerce tables; owner reviews once** | One-time, fast, reversible. **Recommended** |
| B. Staff re-enter everything in the admin | Slower, error-prone, but the team owns the data from day one |
| C. Keep the TS arrays as truth and sync | Two truths — rejected |

**Also: variants at launch?** Default is simple products everywhere + configurable (size × finish) for the top 20 SKUs.

**Default: A + variants for top 20.**

---

### Q4 — Payments and KYC

Needed before P2 (week 8): Safepay merchant status, bank details for manual transfer verification, COD limits per
order and per city, and who reconciles transfers daily.

**Default if silent:** bank transfer (manual verification, 24 h SLA) + COD capped at PKR 150,000; Safepay integrated
behind a flag and switched on when the merchant account clears.

---

### Q5 — Hard launch date or movable target?

| Option | Consequence |
|---|---|
| **A. Hard date — cut scope, not the date** | Week 20 ships core commerce + all nine surfaces; promotions, RMA depth, multi-currency complete by week 28. **Recommended** |
| B. Soft date — full feature matrix before launch | Realistic completion ~week 28, everything complete on day one |

**Default: A.**

---

## Already decided (locked by the owner)

| Question | Answer |
|---|---|
| Hosting | Hostinger **shared**, no VPS |
| Bagisto | **Not run as an engine** — feature set absorbed into WOODEX OS |
| Master admin | WOODEX OS, single application |
| Page builder | **Puck**, one builder |
| Backend | **Laravel 13 / PHP 8.4** |
| Team | 3 developers |
| Data | Seed only, no Supabase migration |
| Payments at launch | Bank + COD, gateways behind flags |
| Catalogue | Simple products, one price; configurable for top SKUs |
| AI | Autonomous within limits |
