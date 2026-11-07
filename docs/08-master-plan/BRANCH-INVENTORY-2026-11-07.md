# Branch & tag inventory — 2026-11-07

*Why this file exists:* after PRs #13/#14 merged (main = `f8a9d71`), a sweep question was raised:
*"What is on the Arena branches and the `v1.0.0` tag, and is it worth porting?"* This is the answer,
measured tree-to-tree against `origin/main`, not recalled.

**Methodology & honesty caveats**
- This clone is a **shallow, depth-1 checkout** (`.git/shallow` = 1 entry, tip `f8a9d71`). `git log` /
  `merge-base` under-report or report nothing with exit code 1. **Tree-to-tree diffs (`git diff
  --shortstat origin/main <ref>`) are valid regardless of depth** and are what the verdicts below use.
- The merge commits themselves (`2f6dbf6` #13, `f8a9d71` #14) are GitHub-signed with real parents;
  main's actual content = union of #13 and #14. The "missing 147 lines" scare during the audit was the
  normal 3-way merge union (#13's `ANTI-ABUSE-DECISION.md` + runbook edits landed inside #14's merge),
  not a regression — verified via `git diff origin/main origin/arena/ee488920-woodex-reimagined`
  (exactly those two docs).
- "Merged PR" branches showing `0` added files vs main are **fully landed** — nothing to port.

**Root cause of "unable to merge between branches"**
There were never one codebase. Three separate lineages co-exist:
1. The reimagined Agency OS line (this repo's `main` — merged via PRs #2–#14).
2. The **Hostinger/IBPanel fork line**: `v1.0.0` (tag, 2026-11-04, Arena Agent) → branch
   `arena/0378ff53-woodex-reimagined` (2026-11-05/06) — a **different stack** (PHP/Laravel + MySQL,
   shared hosting, `IBPanel` dump) re-implementing the store. Never related ancestry to main.
3. The raw handoff upload: branch `arena/04af685c-woodex-reimagined` (PR #1, open) — the original
   `dark theme.zip` / `legacy/` import everything else was derived from.

Merging any two is a different-project 3-way fight by construction — avoid; pick *specific files* instead.

---

## Per-branch verdicts

| Branch / ref | PR / state | What it actually is | Unique vs main | Verdict |
|---|---|---|---|---|
| `arena/e746990a-woodex-reimagined` (**this branch**) | active | Post-merge session branch; currently carrying this inventory doc only | 0 source files | Held for owner inputs |
| `arena/ee488920-woodex-reimagined` | PR #14 **MERGED** | Turnstile slice, 0007–0009 migrations, Track B fixes, Waves 2/2b/3 | 0 source files | Landed; deletable at sweep |
| `arena/68ecf14d-woodex-reimagined` | PR #12, #13 **MERGED** | CI un-red + lead guard 0006 + anti-abuse brief | 0 added source files | Landed |
| `arena/d1d750ce-woodex-reimagined` | PR #7 **MERGED** | Wave 4 inspector (Style & Advanced, linked styles, visibility, scroll animation) | 0 source files | Landed |
| `arena/8ca24d1c-woodex-reimagined` | PR #8 **MERGED** | Puck snapshot null-cache fix (builder unfreeze) | 0 source files | Landed |
| `arena/c8245185-woodex-reimagined` | PR #9 **MERGED** | As-built doc for PR #8 | 0 source files | Landed |
| `arena/87cc179f-woodex-reimagined` | PR #6 **MERGED** | PB-5 SEO layer + B4 (Custom Design / Virtual Showroom singletons) | 0 source files | Landed |
| `arena/1a55fd1f-woodex-reimagined` | PR #5 **MERGED** | MCP server: read-only SEO advisory tools | 0 source files | Landed |
| `arena/4431a319-woodex-reimagined` | PR #2 **MERGED** | P1/P2 launch readiness (SEO/a11y gate, admin overhaul, E2E) | 0 source files | Landed |
| `arena/51eb86ae-woodex-reimagined` | PR #4 **MERGED** | Master plan v2.1 + pages workspace (Wave 1) | 0 source files | Landed |
| `arena/cb0d09e3-woodex-reimagined` | PR #3 **MERGED** | Inventory + Stock Movements + Delivery Zones (COD) | **2**: `src/admin/pages/PagesLab.tsx` (67 lines), `src/pages-builder/starter.ts` (66) | **PARKED — Puck W0 spike**, localStorage-only, never wired; restore only if wanted (2 files + route/nav decision) |
| `arena/bb519cda-woodex-reimagined` | PR #10 **MERGED** / PR **#11 OPEN, CI red** | Flat-fee parity + RPC rate limit (`0005`/`0006`) — merged; PR #11 = re-committed `@lovable.dev/mcp-js` bundler output | 0 added source files (delta = pre-merge doc copies) | PR #11: **PARKED** — fails **Lint only**; single file `supabase/functions/mcp/index.ts` (+102/−81). Repair = regenerate the bundle per the documented build + pass lint, or close. Contains **no product/feature code** |
| `arena/04af685c-woodex-reimagined` | PR **#1 OPEN** | Raw `dark theme.zip` / `legacy/` + `IBPanel` handoff ("Add files via upload") | the raw archive | **PARKED** — nothing mergeable; superseded by both derived lines; close decision sits with owner |
| `arena/0378ff53-woodex-reimagined` | **no PR** (190 commits) | The Hostinger/MySQL PHP-Laravel **re-implementation** of the IBPanel migration. Notably: `platform/` (≈1,935 files incl. `app/Support/Install/MysqlProbe.php`, `database/data/catalog.json`), `deploy/` (Hostinger kit, ED25519), `downloads/woodex-staging-master.zip` (**69.4 MB**), `docs/07-woodex-os/` (12 docs: audits, parity matrix, server capacity, plans — F1–F9), `PROJECT-REPORT.md`, `supabase/` reproducible catalogue + CMS, **`legacy-photos/` = 139 real photos, 17.3 MB** | the entire fork | **Never bulk-merge.** Two bits may be portable (see below); decision PARKED with owner |
| `v1.0.0` (tag) | release line of the fork | 2026-11-04, Arena Agent, "reproducible release packaging for the deployable bundle" | none (older snapshot of the fork lineage) | PARKED — superseded; keep-or-delete per owner |

**Merge-order status after this inventory:** #13 ✅ → #14 ✅; #1 and #11 **closed unmerged 2026-11-07** by owner instruction. No PRs open. Merged branches and `v1.0.0` deliberately kept.

---

## What (if anything) is worth porting into `main`

**Already ported (nothing to do):** the full product catalogue — all **148 products** from the fork's
`platform/database/data/catalog.json` match slugs present in `src/data/products.ts` in this
repository (verified programmatically 2026-11-07). Prices/series/stock scaffold already live here.

**Candidate A — 139 real product-photo files, 17.3 MB**
(`platform/database/data/legacy-photos/…` — IB-style timestamped filenames carrying the product slug,
e.g. `1772723876_Silvio_Executive_Chair.jpg` → `silvio-executive-chair`.)
Our app renders generic/hero placeholders; these are the actual catalogue photographs.
- Port wired (copy → `public/images/products/`, rename to slugs, map into `src/data/products.ts`):
  real value, +17 MB git history.
- Port archived (copy unwired): keeps the asset without touching the data path now.
- Skip: status quo.

**Candidate B — fork audit docs (`docs/07-woodex-os/`, 12 files)**
Fact-based audit trails of the rejected deployment path (photo parity 20/157→157/157, server capacity,
platform evaluation, parity matrix). Historical evidence only — never referenced by the live codebase.
- Bring in marked as *archived "rejected-path" evidence*, or keep the repo scoped to the live stack.

**Candidate C — `PagesLab` spike (2 files)**
`src/admin/pages/PagesLab.tsx` + `src/pages-builder/starter.ts` — Puck-based drag-and-drop page-builder
experiment, `localStorage`-only persistence, explicitly bannered "spike — not wired to the site".
- Restore behind an admin route/nav decision; or drop (the pages-builder workspace superseded it).

**Candidate D — nothing else**
The PHP/Laravel fork as code, `deploy/`, the 69.4 MB staging zip, `.agents`/`.claude`, `downloads/`,
`skills-lock.json`: wrong architecture, artifact binaries, or foreign scaffolding. PR #1 body is the
IBPanel archive (close, keep, or leave — owner's call). PR #11 is a generated bundler artifact whose
only defect is a Lint failure.

---

## Sweep checklist once the owner decides

- [x] PR #1 — **CLOSED unmerged 2026-11-07** by owner instruction ('As you recommend'). Raw handoff archive; nothing mergeable; refs retained.
- [x] PR #11 — **CLOSED unmerged 2026-11-07** by owner instruction. Lint-red bundler artifact; money-path work already in main via #10; refs retained; regenerable from a fresh branch if needed.
- [x] Candidate A (139 photos, 17.3 MB) — **SKIPPED** by owner instruction. Unwired binary doesn't belong in `main`; origin: `refs/remotes/origin/arena/0378ff53-woodex-reimagined:platform/database/data/legacy-photos/` (fork parked, not deleted). Catalogue data already ported (148/148 slugs).
- [x] Candidate B (fork audit docs) — **NOT PORTED** by owner instruction. Fork remains the archive of the rejected deployment path.
- [x] Candidate C (PagesLab spike) — **NOT RESTORED** by owner instruction. Superseded by the pages-builder workspace.
- [ ] Candidate D — n/a (nothing left).
- [ ] `v1.0.0` tag — kept (deletion declined at the 2026-11-07 sweep; explicit owner word required to remove).
- [ ] Remote branches fully merged into `main` — kept (deletion declined 2026-11-07; explicit owner word required).
- [ ] Unshallow this clone (`git fetch --unshallow`) if any future `git log` work is planned here.
- [ ] Owner-held, outside this document: hosted deploy (0001–0009) + seed + physical stocktake,
      Turnstile keys, zone-rate sheet, `convertDraftOrder` sign-off.
