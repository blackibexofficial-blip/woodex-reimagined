# Open Questions — answer before storefront build

**Rule (from the owner):** the storefront is not started until these are answered. Each has a recommended default
so work never blocks waiting for a perfect answer.

| # | Question | Options | Recommended default |
|---|---|---|---|
| Q1 | **What is the storefront’s job?** | (a) full shop with checkout · (b) catalogue + quote requests only · (c) both, B2C cart for retail SKUs and quote for B2B | **(c)** — the OS already has both funnels |
| Q2 | **Who owns the marketing pages after Puck ships?** | (a) storefront renders Puck JSON via `/pages/{slug}` · (b) Laravel renders Puck pages itself, storefront stays SPA-only for app routes | **(b)** — fastest SEO win, one renderer |
| Q3 | **Does the 142-page v1 site get migrated at all?** | (a) yes, all 7 groups · (b) only home + services + guides · (c) keep v1 files, build new pages in Puck only | **(a)** but the last group (54 specialists) can slip past launch |
| Q4 | **Which products actually sell online at launch?** | (a) all 148 · (b) curated 30–50 · (c) none — quote-only | **(b)** — stock and photography are the real constraint |
| Q5 | **Who is the first customer type?** | (a) B2C walk-in · (b) B2B corporate · (c) both with separate journeys | **(b)** — 60% of revenue, and the OS already models it |
| Q6 | **Is `Preview Owner` a role preview or a staging marker?** | (a) read-only “view as role”, audited · (b) environment banner only · (c) real impersonation for support | **(a)** |
| Q7 | **Payment go-live** | (a) bank + COD at launch · (b) wait for Safepay approval · (c) both | **(c)** |
| Q8 | **Storefront tech after Puck** | (a) stay React 18 + Vite + prerender · (b) move to Next.js App Router/ISR now · (c) stay, revisit after launch | **(a)** now, **(c)** review at P7 |
| Q9 | **Agent autonomy caps** | confirm PKR 250k / 10% discount, or different | PKR 250k / 10% |
| Q10 | **Urdu** | (a) English only · (b) EN + UR content, EN UI · (c) full bilingual | **(b)** |

Answers change three things: workstream C’s shape (Q1, Q2, Q8), the migration schedule (Q3), and the launch
catalogue (Q4).
