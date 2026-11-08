# PO→BOQ auto-allocation — scoping proposal (SCOPING ONLY — not approved for build)

**Date:** 2026-11-08 · **Status:** proposal awaiting owner decision · **Author:** session work for Backlog #7 follow-ons
**Standing constraint:** no code ships on this without the owner's explicit words. This document exists so the decision is reviewable cold.

## The problem

Purchase orders already carry the commercial commitment (`admin purchase orders`: lines with
`name, sku?, costPrice, quantity, receivedQuantity`, `subtotal = Σ costPrice × qty`). The
job-costing ledger (`project_actuals`, migration 0013) has lines that are entered **by hand**.
When a PO pays for job materials (e.g. `PO-1044` walnut stock → `JNR`), the user currently re-types
description / qty / rate into the Actuals tab, then remembers to link the PO ref. Every manual
re-type is a drift risk between the PO, the ledger and (loosely) the BOQ.

## Options

| # | Shape | Schema | Effort | Risk | Delivers |
|---|-------|--------|--------|------|----------|
| A | **PO-line picker autofill** — in the Actuals add-line form, pick a PO line and have description/qty/rate/poRef prefilled; human still chooses code, date, save | none | small | low | removes re-typing; zero math |
| B | **Allocation table** — `project_actual_allocations` linking actual lines ↔ payload BOQ row ids (0016-class migration, after ad-spend 0015) | **new migration** | medium | medium | per-line BOQ precision; "allocated vs unallocated spend" report; variance can drill to BOQ rows |
| C | **PO → "post to job actuals" ingestion** — from the PO detail (or an Actuals-tab drawer): pick job + cost codes per line → bulk-create `po`-source actual lines, copied at PO prices | **none** | medium | low | the 80% win: no re-typing, correct unit economics, human stays in the loop for the only real judgment call (code + job) |
| D | **Full four-way match** (PO ↔ actuals ↔ BOQ ↔ invoices) | multiple | large | high | ERP-class; explicitly out of scope |

## Recommendation

**Option C first**, optionally with A's autofill folded into the same form (they compose cleanly —
A is just C applied one line at a time). **B only if C proves insufficient in practice** and the
owner still wants per-line BOQ-row precision; if approved, B takes **0016** (ad-spend keeps 0015).
**D never** in this phase.

Option C touches: one new dialog flow ("Post to job actuals" on the PO page / drawer in Actuals),
thin demo + supabase adapter additions (reusing `listPurchaseOrders` and `addProjectActual`), type
additions, 1–2 e2e asserts. No migration, no RLS change, no rehearsal change. Estimated size: a
half of the actuals-ledger slice.

## Design notes / honest limits

- **PO lines are catalog references (or freehand), not BOQ text.** No reliable auto-mapping exists;
  the human picks the job and the cost code per line. Any "auto" claim beyond that would be
  guesswork — we won't ship silent guesses into a costing ledger.
- **Amounts copy at PO time** (`costPrice × receivedQuantity` or `× quantity` — owner to decide:
  receive-then-post vs order-then-post). Price override stays editable per line, matching current
  manual semantics.
- **Allocation to BOQ rows stays out** until option B explicitly approved; C links ledger ↔ PO (commercial), not ledger ↔ BOQ (plan).
- **QC/dispatch gate is unrelated** — cost capture shouldn't depend on inspection state.
- **Numbering:** ad-spend = 0015 (queued); this proposal needs no number unless B is picked (→ 0016).

## Decision points for the owner

1. A / B / C / D (recommendation: **C**, A folded in).
2. If C: post **on order** or **on receipt** (received qty vs ordered qty)?
3. If C: whole-PO bulk post with per-line code pickers, or single-code-for-all with per-line override?
4. If B is ever wanted later: variance drill-down into BOQ rows is the prize — worth it then?
