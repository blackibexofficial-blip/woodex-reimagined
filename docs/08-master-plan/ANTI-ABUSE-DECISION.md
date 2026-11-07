# Anti-abuse decision brief — public intake endpoints (2026-11-07)

**Status: DECISION REQUIRED (owner). Nothing in this document is implemented.**
**Scope:** the two unauthenticated, service-role write paths that exist today:

| Endpoint | Implementation | Abuse impact |
|---|---|---|
| `order-submit` EF → `order_submit` RPC (migrations 0003/0005) | storefront checkout | inventory denial (stock → 0), junk orders, COD fraud (unpaid orders), WDX-ref exhaustion |
| `lead-capture` EF (migration 0006) | contact / quote enquiry forms | lead spam, DB bloat, consent-laundered junk in CRM |

Not in scope: authenticated admin paths (RLS + capability matrix), `order-tracking`
(digest-gated, no write), MCP endpoints.

---

## 1. Where the traffic actually lands (the fact most options miss)

The storefront SPA is static (`vercel.json` = SPA rewrites only; no firewall config).
The vulnerable endpoints live on **`ewbflgbshdstfxqretay.supabase.co`**, i.e. **not on
`woodex.pk`**. A WAF attached to the storefront domain therefore protects the pages,
**not** these endpoints. To get WAF coverage you must *front* the functions:

- Cloudflare in front of the apex + a Worker (or Pages Function) that reverse-proxies
  `woodex.pk/api/order-submit` → EF and `woodex.pk/api/lead-capture` → EF; or
- Vercel Firewall rules on a `/api/*` rewrite that proxies to the EFs (adds a serverless
  hop on the money path); or
- a custom domain for the Supabase functions if the plan supports it (**verify with
  Supabase — not assumed here**).

Without a proxy, "add a WAF" is an empty action. With one, the Worker **overwrites**
client-supplied `x-forwarded-for`, which also upgrades the existing per-key limiter from
"spoofable first line" to "honest per-IP window" — a real, concrete gain.

## 2. Current state (shipped, rehearsed — not hosted-verified)

- `order_submit` (0005): fixed window — 20 submissions / 10 min per caller key;
  key = first `x-forwarded-for` entry stamped server-side by the EF (client-sent keys
  discarded); over-budget → 42501 → EF maps to **429**. Replay (`client_ref`) also
  consumes budget.
- `lead_rate_limit_hit` (0006): identical fixed window, service-role-only RPC,
  PUBLIC EXECUTE revoked; EF fails **open** (logs) if the limiter RPC errors.
- Rehearsed in pglite (36/36) — **nothing executed on hosted Supabase** (egress 000).
- Known residual by design: per-key ≠ per-human. Residential proxies / IP rotation
  defeat it entirely; Pakistan carrier-grade NAT (CGNAT) means many legitimate users
  share one IP.

## 3. Options

### A. Edge WAF in front of the functions (proxy project)
Cloudflare Worker or Vercel rewrite + Firewall: per-IP rate rule on the two paths
(start ~30 req/min, tune up/down on false-positive evidence), OWASP managed ruleset,
bot-fight mode or managed challenge on the paths.
- **Cost:** Cloudflare free tier can carry this; Vercel Firewall needs a Pro plan
  (verify current pricing at signup). No EF code change required — but the proxy must
  overwrite `x-forwarded-for`.
- **Gain:** absorbs volumetric/scripted abuse before Supabase; upgrades limiter key
  integrity.
- **Cost:** DNS or rewrite surgery on the money path; adds a hop + a vendor; FP risk on
  CGNAT IPs (keep limits permissive; challenge rather than block).
- **Verdict fit:** right answer for DDoS-shaped traffic; overkill for spam-shaped traffic.

### B. Upstash Redis global counter inside the EFs
Both EFs `INCR`/`EXPIRE` a key (`ip + action`) against Upstash (REST, serverless-native)
before calling the limiter RPC. Works regardless of hosting; global state; ~10–30 ms.
- **Cost:** Upstash free tier (verify limits at signup — historically 10k commands/day,
  likely insufficient; plan for paid). New secrets in both EFs; another failure mode.
- **Failure decision required:** fail-open (availability — matches 0006's posture) or
  fail-closed (strict). **Open question, this brief asks for the owner's call.**
- **Gain:** one global budget, shared across isolates/regions; survives per-key
  weirdness only if keyed on something honest — keyed on XFF it inherits the same
  spoofability.
- **Verdict fit:** the right *code-level* step if you keep the proxy out; weakest if
  you also adopt C.

### C. Cloudflare Turnstile verified inside both EFs
Invisible/managed challenge widget in `Checkout.tsx` + contact/quote forms; EF verifies
the token against Turnstile's `siteverify` endpoint before touching the RPC.
- **Cost:** free (verify at signup). No DNS changes. Standard env vars
  (`TURNSTILE_SITE_KEY` public, `TURNSTILE_SECRET` EF-only).
- **UX cost:** near-zero in invisible mode; must pass on Pakistani mobile browsers —
  test on Jazz/Zong/Telenor networks before launch.
- **Gain:** separates humans from scripts at the action boundary itself — kills both
  IP-rotation and shared-IP blind spots for the write paths. Stops COD fraud at order
  time (the expensive case).
- **Constraint:** EF outbound egress must reach `challenges.cloudflare.com` — hosted
  Supabase has egress; the authoring sandbox does not (so rehearsed via mocked verify,
  honestly labeled).
- **Verdict fit:** strongest per-unit assurance for exactly these two writes.

### D. Baseline monitoring & alerting (always-on, zero product change)
429-rate and intake-volume alerting (Supabase log drain → email/Slack), weekly review of
`lead_rate_limits`/`order_rate_limits` burn patterns, documented escalation.
- **Cost:** near zero. **Gain:** you learn which failure mode you actually have before
  buying machinery. **Limit:** stops nothing by itself.

## 4. Comparison

| | A: WAF proxy | B: Upstash counter | C: Turnstile | D: Monitor |
|---|---|---|---|---|
| Primary threat stopped | volumetric/DDoS, scripted bursts | budget exhaustion at scale | bot-vs-human at write time | none (detects) |
| IP-rotation resistant | partial (challenge variant) | no (keyed on IP) | **yes** | n/a |
| Shared-IP (CGNAT) friendly | risky — tune/challenge | risky — tune window | **yes** | n/a |
| Code change | none (proxy config) | EFs (both) | EFs + forms | none |
| Hosted-verifiability | owner-side | blocked without egress | mocked rehearsal only | owner-side |
| Owner effort | medium (DNS/rewrites) | small–medium | small | small |
| Open decisions | DNS vs rewrite | fail-open vs fail-closed | rollout scope | alert recipient |

## 5. Recommendation (input to the decision, not the decision)

1. **Adopt C (Turnstile) + D (monitoring) now** — closes the human/bot boundary for both
   write paths, no DNS surgery, smallest change surface, directly attacks COD fraud.
2. **Hold A in reserve** — implement only if D/C telemetry shows volumetric or
   proxy-rotated abuse that outgrows Turnstile; then prefer the Worker-proxy shape
   (it also upgrades the existing limiter keys). Do **not** front the storefront with a
   WAF and expect it to protect the EFs.
3. **Defer B** — revisit only if C+A are in place and you still need a global budget
   knob; then decide fail-open vs fail-closed explicitly.
4. Whatever you pick, keep the current per-key guards — they are the third line, not a
   replacement.

## 6. Owner decisions requested

1. **Turnstile:** include for COD checkout + contact/quote forms now?
2. **Monitoring:** who receives 429/intake alerts, via which channel?
3. **WAF:** approve exploring the Worker-proxy shape, or explicitly defer?
4. **Upstash:** defer confirmed, or spike the EF integration anyway?
5. If B ever lands: **fail-open or fail-closed?**

## 7. What each approval unlocks (my side)

- **C approved:** one slice — Turnstile widget in `Checkout.tsx` + contact/quote forms,
  EF-side `siteverify` in `order-submit` + `lead-capture`, rehearsal extended with a
  mocked verify (hosted check remains owner-side), runbook updated.
- **D approved:** runbook gets an "alerting" checklist (log-drain query, thresholds,
  recipient) — docs-only.
- **A approved:** docs-only from me (exact Worker/Vercel-rewrite rule set + runbook §8),
  deployment is owner-side.
- **B approved:** EF integration behind an explicit `RATE_LIMIT_MODE=upstash|local`
  flag with fail-mode config, types, tests — rehearsed against a mocked Upstash;
  live behavior owner-side.

*All figures/pricing are indicative — verify at signup. Nothing here has been executed
against hosted Supabase.*
