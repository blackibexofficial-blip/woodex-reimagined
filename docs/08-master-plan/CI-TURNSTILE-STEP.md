# CI step for the Turnstile guard tests — owner-application needed

**Why this file exists:** the app credential used by the coding agent cannot create or
update `.github/workflows/*` (GitHub App lacks the `workflows` scope; push rejected 2026-11-07).
The step itself is trivial and is **CI-only** — the same tests run locally via
`node --test supabase/functions/_shared/turnstile.test.mjs` (8/8 PASS).

Apply the following to `.github/workflows/main.yml` (insert right after the
`Install dependencies` step, before `Typecheck`):

```yaml
      - name: Edge-function guard tests (Turnstile verifier)
        run: node --test supabase/functions/_shared/turnstile.test.mjs
```

Rationale: the verifier is plain ESM (`supabase/functions/_shared/turnstile.mjs`) with an
injected fetch, so no Deno setup is required on the runner. This catches regressions in
the fail-open/fail-closed posture without any hosted access.
