# Open Questions — v5

> **Status: the owner skipped this round (30 Oct 2026). The recommended default for each question is adopted and the
> plan proceeds on it.** Each answer is reversible until the phase that depends on it begins — Q1 is the only one that
> must be settled in week 1 (see `WEEK-1-KICKOFF.md`). Reply with a letter at any time and the plan is re-cut.

Six decisions block or reshape week 1. Each is stated as *the choice*, *what it changes*, and *what I assume if
silent*. The default is the recommendation.

---

### Q1 — If Bagisto will not run on the shared account, what do we do?

Gate H0 (week 1) answers this technically. This is the business decision if it fails.

| Option | Cost | What changes |
|---|---|---|
| **A. Upgrade to Hostinger Cloud Startup** | +$10–20/mo | Same account, same hPanel, ~3–4 GB RAM. Least disruption. **Recommended** |
| B. Bagisto on a cheap managed host, OS stays shared | +$10–20/mo | Two providers, two bills, API sync unchanged |
| C. Stay shared, launch catalog + quotations only, checkout later | $0 | Loses "complete e-commerce" at launch |

**Default if no answer: A**, and we test it inside H0 so there is no surprise later.

---

### Q2 — Where does the team actually run orders?

| Option | Consequence |
|---|---|
| **A. Staff use the Bagisto admin for orders/fulfilment; OS shows a read-only order mirror + the customer 360** | Fastest to launch, no duplicate order UI. **Recommended** |
| B. Orders are managed in the OS, Bagisto is a hidden engine | Better UX for staff, +4–6 weeks of order UI, more sync surface |
| C. Both are writable | Rejected — two writers, guaranteed drift |

**Default: A.**

---

### Q3 — The 142 existing pages: migrate all, or curate?

| Option | Consequence |
|---|---|
| **A. Migrate top 30 + all product/category pages; 301 the rest to the nearest parent** | Launch on time, no ranking cliff if redirects are mapped. **Recommended** |
| B. Migrate all 142 | Adds ~3–4 weeks; many pages are near-duplicates |
| C. Keep legacy HTML, migrate only new pages | Two builders forever — rejected |

**Default: A**, with a URL-by-URL redirect map reviewed before cutover.

---

### Q4 — Who owns the catalog data during import?

| Option | Consequence |
|---|---|
| **A. We import the 148 products from the existing TS arrays into Bagisto CSV, owner reviews once** | One-time, fast, reversible. **Recommended** |
| B. Sales team re-enters everything in the Bagisto admin | Slow, error-prone, no benefit |
| C. Keep the TS arrays as truth, sync to Bagisto | Two truths — rejected |

Also: **variants at launch?** Default is simple products only; configurable (size/finish) added in P4 for the top 20 SKUs.

**Default: A + simple products.**

---

### Q5 — Payments and KYC

Needed before P2 (week 8): Safepay merchant account status, bank details for manual transfer verification, COD limits
(per order, per city), and who reconciles transfers daily.

**Default if silent:** bank transfer (manual verification, 24 h SLA) + COD capped at PKR 150,000; gateways flagged off.

---

### Q6 — Is week 16 a hard launch or a movable target?

| Option | Consequence |
|---|---|
| **A. Hard date** — scope is cut, not the date | Parity items move to P4/P5. **Recommended for a business launch** |
| B. Soft date — full parity before launch | Realistic completion ~week 24 |

**Default: A.**

---

## Already answered (kept for the record)

| Question | Answer |
|---|---|
| Hosting | Hostinger **shared**, no VPS |
| Commerce engine | **Bagisto** |
| Page builder | **Puck** |
| Backend | **Laravel / WOODEX OS** |
| Team | 3 developers |
| Data | Seed only, no Supabase migration |
| Payments at launch | Bank + COD, gateways in parallel |
| Catalogue | Simple products, one price |
| AI | Autonomous within limits |
