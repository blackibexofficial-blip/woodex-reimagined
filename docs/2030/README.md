# WOODEX 2030 — vendored master documentation (planning baseline)

This folder is a verbatim copy of the owner-supplied "WOODEX 2030 — Master
Documentation" package (documentation baseline **2026-11-13**, received as task
attachments). It is vendored so the program, its decisions and its evidence
labels travel with this repository.

**Status of this folder: planning baseline — implementation not authorized by
this document.** Nothing here may be quoted as delivered. The only changes to
the package files themselves are the verbatim copies; this README and
[ADAPTATION-FIT-GAP.md](ADAPTATION-FIT-GAP.md) were authored in this repository
and are the only WOODEX-2030-authored files in the folder.

Read order: see the package index in `README` of the upload, mirrored by the
numbering 01…14. The 2030 agent rules in `08-AGENT-OPERATING-INSTRUCTIONS.md`
bind all agents working on this program, including this repository.

## Where the program stands in THIS repository

- This repository (`woodex-reimagined`) is the designated delivery vehicle for
  the 2030 upgrade (owner decision, 2026-11-13: *"This repo (woodex-reimagined)"*).
- This repository is **not** the estate the package describes
  (two React 19.2 apps / Express API / Laravel under `platform/` / Woodex
  Interior legacy). See [ADAPTATION-FIT-GAP.md](ADAPTATION-FIT-GAP.md) for the
  full mapping and the owner decisions taken on 2026-11-13:
  - One unified app now; **the two-app split is deferred** ("plan the split —
    2030-literal", not scheduled for this phase).
  - **Demo/preview-only boundary:** no production (live Supabase / Vercel /
    woodex.pk data) actions without explicit owner approval. Hosted state is
    UNVERIFIED as documented in `docs/WOODEX_TECHNICAL_AUDIT.md`.
  - Phase 1 design foundation starts here, behind owner review PRs.
- The 2030 package's "Decision Log" (`12-DECISION-LOG.md`) remains the canonical
  decision record; repo-specific overlay decisions live in the adaptation notes
  and `docs/WOODEX_TECHNICAL_AUDIT.md` changelog.

## Change control

Per the package rules: update `12-DECISION-LOG.md` (or, for repo-specific
deltas, `ADAPTATION-FIT-GAP.md`) whenever a decision changes, and update the
affected module spec, API contract, data model, QA tests and roadmap in the
same change. Do not fork conflicting copies of the same decision elsewhere.
