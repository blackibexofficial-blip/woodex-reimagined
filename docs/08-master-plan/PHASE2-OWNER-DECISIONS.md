# Phase 2 — owner decision sheet

**Status: unanswered.** Eight decisions block the rest of the completion plan
(`PHASE2-COMPLETION-MASTER-PLAN.md`, milestones M1–M10). Fill the answer column and date it; an
answered row is what turns a blocked matrix row into work that can start.

Until a decision is made, the plan's rule stands: nothing hosted happens. The **provisional
defaults** in §2 exist so local work can continue without pretending the decision was taken — they
are marked provisional wherever they appear and must be re-confirmed before any staging or
production step.

How to answer: edit the "Answer" cell, leave the rest alone, and commit the file. Or reply with
`D-01 A, D-02 B, …` and the values for D-08.

---

## 1. Decisions

### D-01 · System of record — blocks GOV-001, SEC-001/002, DASH-001, CAT-001, all hosted testing

Three adapters already exist behind one seam (`src/api/index.ts`): demo (browser storage), Supabase,
Bagisto. Production currently ships demo mode, so "the site works" is not evidence about a backend.

| Option | Meaning | Cost |
|---|---|---|
| A | Supabase is the record; Bagisto retired for orders | one source of truth; catalogue migrated into Supabase |
| B | Bagisto owns catalogue + orders; Supabase owns CMS, production, CRM | keeps Bagisto; two systems to reconcile |
| C | Supabase for everything including catalogue; Bagisto dropped | largest migration, simplest end state |
| D | Demo stays for the public site until a later date | nothing hosted can be verified; matrix stays In Progress |

Answer: `______`  ·  Schema-change owner: `______`  ·  Public site reads the same source as admin? `Y / N`

### D-02 · Dispatch → order status — blocks ORDER-002, PROD-002, PROD-003

Dispatch currently never touches the order; the orders page only shows the job's progress.

| Option | Effect |
|---|---|
| A | No coupling — order status stays independent of production |
| B | Dispatch moves the order to `in_production`; delivery to `ready` |
| C | Manual — staff promote the order, dispatch only annotates |

Also: when an order is cancelled or unlinked, its job should `stop automatically / be flagged only`.

Answer: `______`  ·  Cancel/unlink behaviour: `______`

### D-03 · Audit retention and tamper policy — blocks SEC-004, PROD-005

QC inspection rows and production audit rows are append-only for application roles; a service-role or
database-owner path can still rewrite them.

- Retain for: `12 months / 24 months / indefinite`
- May read: `page.manage holders / owner only / both`
- Off-box copy (nightly dump to storage): `yes / no`

Answer: `______`

### D-04 · QC seat capability — blocks the PROD-001 follow-up

You already decided (2026-11-08) that the last stage editor cannot record the pass. That part is
implemented (00022) and is not reopened here. Open sub-question:

| Option | Effect |
|---|---|
| A | Keep `page.manage` as the QC capability (current code) |
| B | Add a dedicated `production.qc` capability; `page.manage` alone no longer enough |
| C | A **plus** a documented owner override with a mandatory reason and an audit row |

Pick C if a one-person workshop must dispatch on the same day it last touched the stages.

Answer: `______`

### D-05 · Finance definitions — blocks DASH-001, FIN-001

- "Revenue" means: `booked (order placed) / recognized (delivered) / paid (money in)`
- Day boundary timezone: `Asia/Karachi (UTC+5) / UTC`
- Refunds: `reduce revenue retroactively / counted separately`
- Currency: `PKR only / multi-currency`

Answer: `______`

### D-06 · Chat and AI — blocks CHAT-001, AI-001

Hosted chat methods are unwired and AI is disabled by policy until grounding, retention and spend are
approved.

- Provider: `WhatsApp Business API / on-site chat only / both`
- Transcript retention: `90 days / 12 months / other`
- AI answers: `off / catalogue + policy grounding only / grounding + human handover`
- Monthly spend cap authorised: `______`

Answer: `______`

### D-07 · Booking policy — blocks BOOK-001

- Slot length and working hours: `______`
- Availability source: `staff calendar / fixed slots / manual approval`
- Cancellation window: `______`  ·  Who may reschedule: `______`
- Site visits: `same calendar as consultations / separate resource`

Answer: `______`

### D-08 · Staging — blocks milestone M2 entirely

```
Staging project ref:               azdexktqvobrhwjiskrq   (woodex commad center, ACTIVE_HEALTHY)
Region:                            ap-southeast-1           (Postgres 17.6.1.032)
Backup location (outside the repo): Google Drive "WOODEX — staging backups (D-08)"
Apply window (date/time):          executed 2026-11-09 (agent session, owner-authorized)
Who runs the apply:                agent via Supabase connector (SQL editor role `postgres`)
Synthetic seats:  editor = editor@staging.woodex.test   qc = qc@staging.woodex.test
Confirmed this is NOT production:  [x] — project held 0 public tables before the apply
```

**State after the apply (evidence, not a claim):** 27 of 28 migration files applied —
everything except `00014_storage_projects_bucket.sql`. The bucket insert in that file *did*
succeed (private `projects`, 50 MB cap), so the only outstanding statements are the four
`create policy … on storage.objects` rules, which need a role that owns `storage.objects`
(`supabase_storage_admin` — not grantable from the SQL editor). Run those four from the
dashboard Storage → projects → Policies UI, or via `supabase db push` from a machine that can
reach the project.

**Owner action still owed for D-08:** confirm `azdexktqvobrhwjiskrq` is the intended staging
project. It was named "woodex commad center", created 2025-11-02 and found `INACTIVE`; it held
zero public tables, so nothing was overwritten — but the name is not one this plan chose.

M2 then runs: dump → **restore into a scratch database and verify row counts** → preflight queries →
apply `00021`–`00027` in dependency order → functional checks 1–20 → rollback drill in reverse order.
A backup that has never been restored is not a backup.

---

## 2. Provisional defaults (local work only — re-confirm before any hosted step)

These are what the code and docs assume today if an answer is missing. They are **not** decisions.

| Decision | Provisional default | Where it shows up |
|---|---|---|
| D-01 | A — Supabase as record, Bagisto retired | adapters, matrix rows marked Blocked |
| D-02 | A — no order/dispatch coupling | orders page shows job progress only |
| D-03 | 24 months, `page.manage` may read, no off-box copy | audit rows kept, no export job |
| D-04 | A — `page.manage` remains the QC capability | 00022 as shipped |
| D-05 | booked revenue, `Asia/Karachi`, refunds separate, PKR | dashboard labels say "sample", not revenue |
| D-06 | off / 90 days / off / no cap | hosted AI stays disabled |
| D-07 | fixed slots, manual approval, 48 h cancellation | booking module untouched |
| D-08 | **answered by execution** — `azdexktqvobrhwjiskrq`, ap-southeast-1, 27/28 files applied | the four `storage.objects` policies are the last hosted step |

---

## 3. What each answer unblocks

| Answered | Work that can start the same day |
|---|---|
| D-08 alone | M2: backup/restore drill, preflight, apply 00021–00027, rollback drill |
| D-01 + D-08 | M3 in full: RLS matrix, staff roles, storage policies, denial harness on real PostgREST |
| D-05 | DASH-001 aggregates can be specified and built |
| D-02 | ORDER-002 state machine and PROD-003 unlink guard |
| D-04 | the QC capability is fixed before the first real job |
| D-06 + D-07 | M9 (chat/AI, booking) leaves Blocked |
| D-03 | audit retention job and the tamper story can be written down |

Everything in M0 is done; the branch is merged and deployed in demo mode. From here the only thing
standing between "code exists" and "business can use it" is this page.
