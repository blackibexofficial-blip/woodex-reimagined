# WOODEX 2030 — Adaptation & Fit-Gap (this repository)

**Baseline:** 2026-11-13 · **Branch:** `arena/9e1e58e5-woodex-reimagined` · **Owner decisions recorded 2026-11-13:** repo = `woodex-reimagined` · two-app split deferred ("plan the split, 2030-literal") · **demo/preview-only** boundary — no live production actions · Phase 1 starts behind owner review.

**Honesty labels:** `[V]` verified in this repo (command/evidence) · `[CI]` GitHub Actions on `84aad29`/main · `[L]` hosted — UNVERIFIED (no egress to hosted Supabase/Vercel) · `[D]` demo-mode behaviour · `[I]` inventory from file inspection.

This document exists because the 2030 package was authored against a **different estate** than this repository. Applying it literally would be fabrication; adapting it honestly requires an explicit mapping — that mapping is this file. The package stays authoritative for program intent; this file is authoritative for *how the program lands here* until the owner signs the deltas.

---

## 1. Estate mapping — 2030 assumption vs this repository

| # | 2030 baseline says (evidence in package) | This repository (evidence) | Status |
|---|---|---|---|
| 1 | Two separate React apps: storefront + dashboard, React 19.2, Vite 8.2; storefront Tailwind 3.4, dashboard Tailwind 4.3 (02 §2, F-001, F-009) | **One unified** React 18 + Vite 5 app; **single Tailwind 3.4.17**; admin is a lazy-loaded route tree (`/admin/*`, 59 routes) inside the storefront app (`src/App.tsx`, `src/admin/AdminApp.tsx`) | Adapt — owner chose **defer the split**; revisit as its own 2030 sub-program (build-time separation: shared tokens/components are absent — see §3) |
| 2 | Existing API is Express/Node; 218 route handlers (02 §2, F-002) | **No API server** — browser adapters (`src/api/`): demo localStorage DB (6,024 LOC), Bagisto REST adapter (501-stubs), Supabase RPC adapter (hosted UNVERIFIED) | Adapt — Laravel remains the 2030 backend target; no Express exists to migrate |
| 3 | Laravel platform foundation under `platform/`, several modules disabled (F-003/F-004) | **Absent.** `backend/` = Bagisto proxy reference + in-tree EFs (`ai-agent` undeployed, `whatsapp-campaign-sender` unwired) | Rebuild — greenfield Laravel under this repo (or a split) is a Phase-3-scale effort; sequencing owed to owner |
| 4 | PostgreSQL/Supabase + Vercel is **current production**; target = Laravel + MySQL Hostinger (F-002/F-010, D-004/D-005) | Same documented stack — but **hosted state UNVERIFIED**: no migration ever applied hosted; staging flip is roadmap item #2, blocked on owner (`docs/08-master-plan/STAGING-FLIP-RUNBOOK.md`) | Confirmed + blocked — unchanged by 2030 |
| 5 | Tailwind mismatch between apps (F-009) | Not applicable (single version) — but note storefront and admin **already diverge** in tokens (admin scoped `secondary`/`hon-green`, storefront raw) | Monitor — resolve as Phase 6/2 work, not now |
| 6 | "Woodex Interiors" workspace identity in sidebar (F-008) | **Not present.** The string family "interior" exists only as **business line-of-business tags** (lead source, CRM client category, derived categories) carried from the owner's Lead 2026 sheet | Keep — business data, not brand carryover. Brand facts synced from `src/config/site.ts` this cycle (B-07) |
| 7 | Puck evaluated, not integrated (F-006, D-006) | **Puck present**: `@puckeditor/core ^0.24.0`; `src/pages-builder/` editor; draft→lab binding only (never served publicly) — Phase-6/Part-6 binding still open (audit B-02/M-01) | Puck prototype gate (M-0x) is directly applicable — best-fit starting spike |
| 8 | 25 storefront routes / 47 dashboard routes / 71 tables | **25 storefront routes** [V] · **59 admin routes** [V] · **55 public tables** / 125 RLS policies / 29 functions (audit §5) | Re-baseline — never copy counts |
| 9 | "Sample catalog + seeded demo" | Same here — `supabase/seed.sql` 148 products; demo default mode | Consistent |
| 10 | Project target repo `woodex420/woodex-2030`, branch `arena/69363bda-…` (package header) | Owner redirected the program to **this** repository (2026-11-13). The `woodex420/woodex-2030` repo (public, "woodex-admin") was inspected read-only: `apps/api` (Express), `platform/` (Laravel), legacy | Superseded for this program by owner decision; legacy estate stays separate until a cutover plan says otherwise |
| 11 | Shared design tokens: two component inventories | One component system (`src/components/` + `src/components/ui` shadcn) + admin-specific set (`src/admin/components*`) | Consolidate in Phase 6/1-later work |

## 2. Design tokens — 2030 proposal vs current system (DECISION OWED, not applied)

Doc 05 §5 proposes initial tokens: `color.primary #4F9D21`, `color.sidebar #171B1E` (charcoal), canvas `#F6F7F8`, Inter, radii 8/12/14–16. This repository currently ships: WOODEX "hon-green" family (e.g. `#347647` accent/`hon-green*`), white sidebar, `secondary` canvas, per `docs/03-design-system/colors.md` + `tailwind.config.*`.

- The 2030 tokens are explicitly "subject to contrast validation" and owner approval.
- **This cycle changed nothing** — brand re-skin without sign-off would violate both AGENTS.md ("WOODEX semantic tokens only") and the 2030 rule against unapproved changes.
- Decision required from owner: adopt 2030 token set as-is / adapt hon-green to the 2030 structure (keep brand, formalize token names) / defer to Phase-6 storefront work. Impact: every admin + storefront surface; one focused PR + visual pass.

## 3. Information architecture — 2030 canonical IA vs current sidebar (KEPT, owner decision owed)

Doc 05 §2 proposes canonical groups (Workspace, Customers, Sales, Commerce, Operations, Procurement & Production, Accounts, Growth, Website Studio, System…). Current sidebar (unchanged this cycle): **Overview (2) · Commerce (17) · Purchasing (3) · Engage (12) · System (2) = 36 destinations**, now expressed as a typed registry (`src/admin/nav-registry.ts`) with stable ids + ≥2 search keywords each, guarded by `npm run test:nav` (`scripts/nav-registry-check.mjs`).

- IA change = owner approval gate (2030 Phase 1 exit criterion: *Owner approves sidebar, global tokens and shell*).
- The registry is the substrate for the 2030 §3 rules regardless of which IA wins: search aliases, auto-open active group, persisted group state all already work; command palette is NOT wired (the `cmdk` primitive exists at `src/components/ui/command.tsx` but is referenced nowhere — wiring it is Phase 2 scope).

### Shell interaction rules — have vs missing ([I] inventory)

| 2030 §3 rule | Current state |
|---|---|
| Collapsible groups; active route opens its parent | ✅ implemented (auto-open, never force-closes) |
| Sidebar state persisted | ✅ `localStorage woodex.admin.navOpen` — ⚠️ 2030 §3 says persist "only if privacy and storage policy allow": **policy decision owed** (also see audit S-06/demo gate notes) |
| Mobile drawer with close/focus | ✅ implemented (`sidebarOpen`, Escape/backdrop close; focus behaviour not re-audited) |
| Command palette `Ctrl/Cmd+K` | ❌ primitive present, unwired |
| Search across title/keywords/aliases | ❌ keywords now exist in registry; search UI absent |
| Pinned/favourites | ❌ absent |
| Recently visited | ❌ absent |
| Desktop expanded/compact modes | ❌ absent |
| Global topbar: breadcrumbs + quick-create | ⚠️ topbar has page title (`pageTitle` map) + bell + demo badge + view-store link; breadcrumbs & quick-create absent |
| Role-aware filtering | ❌ — demo gate ≠ RBAC (audit S-04); must land with hosted auth (roadmap #6) |
| No Soon/Legacy in normal nav | ✅ current IA carries neither |

## 4. Phase 1 items applied in this cycle (this branch)

| Item | Evidence | Verification |
|---|---|---|
| 2030 package vendored verbatim | `docs/2030/01…14-*.md` (14 files, copied byte-for-byte from the owner-supplied attachments) | `ls docs/2030` = 14 + README + this file |
| Canonical navigation registry extracted (2030 §3 foundation) | `src/admin/nav-registry.ts` (typed, stable ids, keywords); `Layout.tsx` renders from it; `findActiveGroup` helper replaces inline scan | `npm run test:nav` → **8/8 PASS** (5 groups · 36 items · unique ids/routes · all routes resolve in `AdminApp.tsx` · keywords ≥2) |
| Brand-facts sync — audit **B-07** (demo `DEFAULT_SETTINGS` + document fallbacks said `hello@woodex.pk` / "12-km Sheikh Zayed Rd" vs canonical `src/config/site.ts`) | demo `db.ts` + `Invoice.tsx` + `Quote.tsx` fallbacks now derive from `site.*`; storefront quotation presets (`WI-10204`, Zainab Tower letterhead) deliberately untouched — owner-approved artefact | grep: stale strings gone (except the intentional factory-reorder reminder on `Dashboard.tsx`); tsc/build/e2e re-run |
| AGENTS.md addendum (2030 read order, this adaptation doc, gates) | repo-root `AGENTS.md` | review |
| Command palette wired (2030 §3): Ctrl/⌘+K toggle + topbar trigger; searches registry labels/keywords/groups + 3 verified quick-create actions (`/admin/orders/new`, `/admin/invoices/new`, `/admin/products/new`) | `src/admin/components/layout/CommandPalette.tsx` | e2e ×2 (opens, navigates); **110/110** total |
| Topbar breadcrumb — Admin › group › current page (`h1` preserved) | `src/admin/Layout.tsx` | a11y **0/54** (`--fail`) |

> a11y gate caught two regressions from the first cut of these (`serious:label-content-name-mismatch` from an `aria-label` contradicting visible text; `moderate:page-has-heading-one` from replacing the h1) — both fixed in the same change; final state **0 violations / 54 routes**.

## 5. Decision deltas requiring the owner (before the code they gate)

1. **Design tokens** (§2) — pick 2030 set / honour structure / defer. Gates Phase 6 & 2 visual work.
2. **Sidebar IA** (§3) — adopt 2030 canonical IA (requires mapping of 36→2030 destinations, incl. renames/moves/removals) or keep current 5-group IA; if adopting, Phase 2 implements as one PR with e2e updates.
3. **Two-app split** (#1) — if "plan the split" is to become a phase, it needs an isolation strategy (package boundaries vs full repo split; shared token package; deploy topology on Vercel/Hostinger) **before** any code moves. Not scheduled this cycle.
4. **Laravel greenfield** (#3) — 2030's backend cannot start until target repo/path, Hostinger capability matrix (O-001/O-002) and migration sequencing are answered; the current Supabase flip (audit roadmap #2) is independent and remains owner-blocked.
5. **Privacy/storage policy** for persisted sidebar state (#3-shell) and generally for "no localStorage for business state" on the Laravel path.
6. **Client portal** (P-004), **currency confirmation** (PKR — consistent here), **tax config** (P-002), **payment recording policy** (manual-first — consistent here; gateway remains CREDENTIAL-BLOCKED §1).
7. **Woodex-2030 legacy repo** — does this program supersede it, absorb `platform/`, or leave it read-only? (Package says reuse generic modules — that pull requires the Laravel bootstrap decision first.)
8. **Puck gate** — `@puckeditor/core` is already in-tree; approve the Phase-7-style prototype (round trip + revisioned persistence in demo mode, seeded from `src/pages-builder`) as the next code slice, or stay on the storefront-builder binding slice first (audit roadmap #7)?

## 6. Deliberately out of scope this cycle

- Any production action; any hosted change; **any merge of this branch** — merges are the owner's call after PR review.
- Brand re-skin, IA restructure, command-palette wiring, roles/RBAC (needs hosted auth), mobile drawer focus re-audit.
- Laravel/MySQL creation, Puck persistence work, storefront re-skin, two-app split mechanics.
- Marketing/automation/WhatsApp (CREDENTIAL-BLOCKED §3/§4), payment gateway (CREDENTIAL-BLOCKED §1).

## 7. Recommended next steps (each owner-gated)

1. Owner reviews this PR (docs + registry + B-07) and this adaptation doc; merge or request changes.
2. Owner answers §5.1 (tokens) and §5.2 (IA).
3. Then: Phase 2 shell work (command palette + breadcrumbs + quick-create on the registry) **or** the audit roadmap's next hosted item (#2 staging flip) — whichever the owner prioritizes; both stay demo-first until #2.

*Nothing in this file is implemented beyond the §4 table. If a §5 item is decided, record it in `docs/2030/12-DECISION-LOG.md` (or a repo-overlay decisions file in a follow-up) and update this file in the same change.*
