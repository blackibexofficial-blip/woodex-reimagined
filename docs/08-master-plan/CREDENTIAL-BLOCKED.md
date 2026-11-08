# CREDENTIAL-BLOCKED — what is NOT working, and exactly what unblocks it (V5 Step 6)

Every line here is honest: built ≠ verified ≠ live. The demo default is safe; nothing
on this page requires shipping an unverified integration to customers. Owner words
decide each flip — the agent never deploys or applies hosted changes on its own.

| # | Capability | State in this build | What exists today | What blocks it (credential/decision) |
|---|------------|--------------------|-------------------|--------------------------------------|
| 1 | **Payment gateway** (JazzCash / Easypaisa / bank link) | Demo checkout only — no money can move | `src/lib/payments/signature.ts` — constant-time HMAC-SHA256 webhook verification (`x-woodex-signature` over raw body) · `npm run test:payments` **15/15** · Settings → Payment gateway card ("Not configured", read-only) | Merchant agreement + live API keys (server-side), webhook endpoint + secret, sandbox rehearsal with test wallets, then hosted keys rollout with the owner present |
| 2 | **Customer accounts on the storefront** (register/login/order history) | Demo shows admin + guest checkout only | Auth middleware patterns from the admin demo gate; no storefront auth UI shipped | Hosted Supabase project + **enforced Auth + RLS on customer tables** (0001 tables have roles/policies for staff; customer-facing policies are deliberately NOT shipped), plus consent flows. Do NOT fake an account system against demo data |
| 3 | **WhatsApp sender** (invoices, delivery updates, marketing) | wa.me deep links (one-tap chat) work everywhere today | wa.me links used across storefront/inbox; admin "Send via WhatsApp" UX is a link, not a send | WhatsApp Business Cloud API (Meta) or 360dialog: verified business number, phone_number_id, permanent token, approved templates, webhook verification. Sending is impossible without these |
| 4 | **Campaigns** (bulk WhatsApp/email) | Campaigns UI exists; no blast is ever sent; audience = leads with explicit consent rows only | Consent model (`lead.consent*` capture, consentVersion `lead-privacy-v1`), consent column on leads; campaigns page lists drafts; sender keys absent by design | ESP (Mailchimp/SendGrid) or WhatsApp templates + **verified opt-in lists**; unsubscribe/STOP handling; suppression list; owner sign-off on the first real audience (legal — PIPEDA/PDPA-style exposure) |
| 5 | **Bookings / consultations** (showroom visit, design consult) | Manual booking via chat/WhatsApp | Visitor flow: request → lead → callback. No slot calendar | Calendar backend (Google Calendar/Cal.com/Calendly) credentials + webhook, slot-locking transaction semantics, staff assignment rules. Until then the manual flow is the product |
| 6 | **QC (quality control) station** | Not built | — | Owner decision: QC checklist per SKU class, photo capture location (Supabase Storage bucket), pass/fail gate in fulfilment, roles (who signs) |
| 7 | **Expenses / petty cash** | Not built (GL ledger captures job costs only) | `project_cost_codes` / `project_actuals` (0013) — materials/labour/haulage posted against jobs | Owner: chart of accounts for expenses, approval matrix, receipt storage bucket, accounting export format (CSV for the firm's accountant, or a Zoho Books target) |
| 8 | **AI copilot — hosted path** | Offline draft engine verified (`npm run test:ai-eval` **19/19**); hosted path undeployed | `supabase/functions/ai-agent` (in repo, never deployed), `AI_AGENT_API_KEY` 501-gate, staff-Bearer check, grounding-required prompt; Settings → AI sales agent card shows the honest status | Owner: apply migration for rate-limit table IF desired (explicitly not shipped — hosted change), deploy function, set provider key + budget cap, rehearse in staging with real conversations, then re-verify `test:ai-eval` + manual QA against live replies |
| 9 | **Hosted rollout of ANYTHING** (migrations, KI6, flip) | Everything hosted = UNVERIFIED | `scripts/staging-smoke.mjs` (read-only, 55 tables discovered from DDL) · `docs/08-master-plan/STAGING-FLIP-RUNBOOK.md` · offline rehearsal **93/0** (pglite, migrations 0001→0014) | Owner creates staging Supabase, applies migrations + seed, runs the smoke + §4 RLS sign-in checks, then decides the flip. The owner alone applies hosted migrations |

## Non-negotiables for any unblocking
1. No keys in git, chat, bundles, screenshots or tickets. Keys live in hosted secrets/env only.
2. Every integration ships behind a visible "Not configured"/501 state until its rehearsal passes.
3. Customer PII never enters the AI corpus, eval fixtures, demo seeds, or docs (synthetic only).
4. No migration is applied to any hosted project without the owner's explicit instruction.
5. Money paths (payment capture, refunds, advances) get staging rehearsal with test instruments first — no exceptions.

_Last reviewed: 2026-11-08 (V5 branch state). Re-verify each row when its owner input lands._
