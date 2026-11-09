# Phase 1 — AI proxy authorization slice

Local implementation, 2026-11-08. No hosted function, secret, schema, or production data was changed. Deployment state of any existing hosted AI function is unknown. This is an authorization repair, **not** an AI go-live approval. This document records the prior slice; the later local attempt-limiter work is described in `PHASE1-AI-USAGE.md`.

## What changed

- The `ai-agent` Edge Function requires a syntactically valid Bearer token and validates it through Supabase Auth `getUser`. Deleted users, currently banned users, invalid tokens and missing users are rejected. Auth service errors fail closed; missing Supabase URL, service-role key or anon key also fails closed.
- The function then invokes the existing database `has_cap('crm.manage')` using **the same user bearer and the anon key**, not the service-role session. The current local role policy permits owner and sales; editor, finance, viewer and unassigned users are denied. A capability error or a non-boolean result fails closed. This policy choice matches the sales/CRM nature of the tool; obtain owner confirmation before rollout. Role changes apply on the next check; a request already past the check is not cancelled by a later revocation.
- Rejected requests never reach the model provider. Missing model key still yields 501. Provider errors now return a generic 502 without logging upstream response text. Offline inbox drafts continue to work and do not invoke this function.
- The Settings copy and implementation notes no longer claim a hosted deployment status that has not been checked. No migrations were required for this slice.

## Critical limitations — keep hosted AI disabled

At the time of this slice, client-provided `grounding` was **not trusted retrieval**; a caller can supply invented facts or prompt instructions, and the chat thread is also untrusted. The proxy has no server-side rate, request-size, cost or global budget limit, no verified output policy, and no privacy/consent enforcement for content sent to a provider. The offline evaluator does not validate hosted model replies. There is no general kill switch in this change: **if the function is deployed and the model key is set, authorized callers can invoke it despite those risks.** Keep it undeployed or its provider key unset until controls are implemented and verified; do not assume a local file or UI warning disables an existing hosted function. Do not send real customer data to an external model without approved privacy terms and consent.

## Local checks

- `npm run test:ai-auth`: 23/23 Node tests of the handler and authorization paths with mocked Auth/provider, including malformed tokens, nonstaff, banned/deleted users, Auth/RPC outages, denial before provider, successful authorized request, and provider outage. One test uses the installed real Supabase JS client against mocked fetch and verifies the Auth and PostgREST headers use the caller token, and only the latter uses the anon key.
- The same command runs 8/8 checks against an isolated PGlite replay of all migrations: owner/sales allowed, editor/finance/viewer/unassigned/anonymous denied, and sales-to-viewer revocation visible on the next query.
- `npx --yes deno check supabase/functions/ai-agent/index.ts`: pass using local Deno 2.9.6. This is type checking, not a hosted Edge Runtime integration test.
- `npm run test:ai-eval`: 19/19 offline fixture checks; `npm run test:p0-safety`: 32/32; `npm run test:phase1-workflows`: 28/28; fresh `npm run test:rehearsal`: 93/93. Typecheck and build pass, lint has 36 warnings, and demo E2E smoke passes 108/108. Build warns about large chunks. The local dependency tree includes temporary no-save packages and is not a frozen-install proof.

These tests use synthetic data, mocked provider/Auth responses and a local Postgres-compatible emulator. They do not prove hosted Auth, real JWT signature checks, account suspension propagation, real PostgREST/RLS behavior, live Edge Function deployment, rate limits, model safety, or external provider handling.

## Staging and rollback

1. Confirm which project/function, if any, is deployed and review its existing configuration, grants, roles and consumers. Do not enable or test against production as part of this work. Decide whether `crm.manage` is the desired AI permission; assign roles through approved processes, not by trusting client metadata.
2. Implement and review server-trusted, versioned knowledge retrieval, robust rate/spend quotas, input/output limits, provider privacy/retention terms, consent, and human-review requirements before any hosted activation. Agree a kill switch and a budget with the owner.
3. In an isolated staging project with synthetic data and explicit approval, deploy the reviewed bundle and supply the runtime-injected `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY` and a staging-only provider configuration. Do not put credentials in client variables, Git, logs or chat. Exercise actual owner/sales/editor/finance/viewer/unassigned, expired/revoked/banned users, role revocation, invalid bearer, Auth and RPC failure, spoofed facts, excessive input, provider outage and budget exhaustion. This slice has not passed those hosted tests.
4. If rollback is required, disable model access at the gateway or remove the provider key using the approved hosted procedure before changing code. A blind rollback to the old proxy reintroduces the missing staff-capability check. Preserve or add an equivalent authorization gate if an old version must be restored; verify access and secret handling in staging. No database restoration is required solely for this slice.
