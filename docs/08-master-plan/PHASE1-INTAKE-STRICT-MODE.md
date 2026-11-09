# Phase 1 — optional strict intake policy

Status: local implementation and synthetic tests only, 2026-11-08. Not committed or pushed to PR #29, not deployed, not enabled on a hosted service. No hosted configuration, production data, secrets, orders or leads were accessed or changed. This is an option for an owner decision, not the decision itself.

## Behavior

`INTAKE_ABUSE_MODE` is an **Edge Function server-side** environment variable read when each function starts; it is not a `VITE_` setting and must not be sent by a client.

| Server setting | Missing/blank Turnstile secret | Lead limiter RPC error or invalid result |
|---|---|---|
| Unset, or exactly `legacy` | Existing fail-open behavior remains. | Existing fail-open behavior remains for returned errors/invalid results; unexpected thrown exceptions still do not insert. |
| Exactly `strict` | Both order and lead endpoints return 503 before verification or DB calls. | Lead endpoint returns 503 without inserting. The counter must be a positive safe integer; over 20 still returns 429. |
| Any other explicit value, including an empty string, case change, or surrounding spaces | Both endpoints return 503 without verification or DB calls. | Both endpoints return 503. |

Configured Turnstile verification already rejects missing/invalid tokens and action mismatches with 403, and returns 503 on Siteverify transport/HTTP errors in both modes. Order rate limiting remains inside the existing SQL order RPC; an RPC failure returns an error rather than an order (generic database errors currently map to 500). Strict mode does not add a separate order limiter or verify SQL grants/migration state. No schema, client, cart, demo data, pricing, inventory or receipt logic changed in this slice.

A frontend site key and matching Edge-only secret are both required for real challenge flows. If strict is enabled without a valid site key, legitimate users cannot obtain a token. Verify the approved settings, backend and all deployed function revisions together before enabling. The setting is read at function initialization: follow the platform's approved secret/configuration rollout procedure and confirm each revision has the intended setting. Older revisions may not support this flag and can still fail open.

## Limitations and decision still required

- **Default is still fail-open when the secret is absent.** We deliberately preserved existing behavior until an owner decides the security/availability policy and staging is ready. Strict is not automatically enabled or a production recommendation without that review. Fail-closed behavior can interrupt checkout and lead intake during an outage.
- The first `x-forwarded-for` entry is not trustworthy unless an approved gateway overwrites it. Per-key fixed windows are not global budgets, IP rotation and carrier NAT remain problematic, and there is no WAF, hostname validation, DDoS protection, independent monitoring or cost/fraud guarantee here. A valid challenge does not establish buyer identity or prevent COD fraud.
- The real SQL grant must be restricted by migration 00015; a deployed legacy function or publicly executable direct order RPC could bypass the Edge policy. Review actual policies, versions and other callers; do not infer hosted safety from this code.
- Legacy mode can intentionally fail open; use it only under an explicit risk decision. A flag, a build preview, or a local test does not make hosted intake production-ready. Order reference authorization, replay/PII concerns, and retry-safe idempotency remain open.

## Local verification

- `npm run test:intake-safety`: **24/24 Node subtests**, including strict/legacy configuration, invalid values, safe integer counters, request size, action checks and receipt projection. Looped inputs contain multiple assertions, not separate subtests.
- `npx --yes deno check supabase/functions/order-submit/index.ts supabase/functions/lead-capture/index.ts`: passed.
- `npx --yes deno test --allow-env --allow-read=./supabase/functions supabase/functions/_shared/intake-action-wiring.test.mjs supabase/functions/_shared/intake-policy-wiring.test.mjs`: **2/2 synthetic integration tests**. They import both actual Edge entry points, replace Deno.serve, mock all fetch calls, and exercise default/legacy/strict/misconfigured settings, missing secret, challenge action/provider failures, rate limiter errors/invalid values/429, successful paths and no-write failure paths. The dynamic test imports need read access to the function directory; **no network permission** is granted. This does not test actual Supabase, Cloudflare, concurrent databases, proxy behavior or deployments.
- Typecheck and lint passed; lint reported 35 warnings. The frontend build and demo E2E were not rerun in this Edge-policy-only slice. The prior auth slice passed build and 108/108 demo E2E. The live preview remains demo-only.

## Before any hosted activation

1. Obtain explicit owner approval of strict versus legacy, an isolated staging project, site key/secret pairing, availability/SLO and incident owner. Never post secret values or real user credentials in chat. Confirm backup/restore, deployed migration versions, actual DB grants and all function revisions/callers before touching staging.
2. In staging with synthetic records, set the chosen **server-side** policy under the approved deployment procedure, configure the matching widget, and verify `order` and `lead` actions against real Cloudflare. Test missing/invalid keys, siteverify outages, token replay, large carts, blocked scripts and real mobile networks; observe that no order or lead is written on failure. Test valid and rejected counter responses, direct-RPC denial, multiple clients, concurrent limits, proxy header trust, expected rate-limit false positives and monitoring/alerting. Validate app error messaging and rollback.
3. For an outage, do not silently switch to legacy. Disable/restrict the affected endpoints or use an owner-approved equivalent protection and incident process; a rollback to older functions can bypass both strict mode and the action fix. Verify no old revision remains callable. Production deployment requires a separate decision, change window and rollback sign-off.
