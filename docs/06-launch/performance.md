# Performance

## Targets
| Metric | Target |
|---|---|
| Lighthouse Performance | ≥ 90 |
| LCP | < 2.5s |
| CLS | < 0.1 |
| INP | < 200ms |
| Total JS (compressed) | < 250 KB initial route |
| Image weight per page | < 1.2 MB |

## Images (shipped)
- All storefront imagery converted to `.webp` (quality ~80) — 93 assets, ~6.4 MB src;
  originals removed. `dist/assets` ≈ 8.2 MB total.
- Below-the-fold images lazy-load via `loading="lazy"`.
- Serve hero at ≤ 1920px wide.
- AVIF `[planned]`.

## Code Splitting (shipped)
- Route-level `React.lazy` + `<Suspense fallback>` across `src/App.tsx`.
- Entry chunk 403 kB (≈113 kB gzip); admin app (103 kB) and recharts (422 kB) split into
  their own chunks and load only on `/admin`.

## Fonts
- Inter via Google Fonts, preconnect + `display=swap`.
- Only load weights actually used (300, 400, 500, 600, 700, 800).

## Third-party
- No third-party scripts until GA4 + Meta Pixel are added; both async, deferred.

## Monitoring
- PageSpeed Insights weekly (field data via CrUX for woodex.pk).
- GA4 web vitals events `[planned]` (measurement ID pending — GA4 foundation is env-gated,
  inert until `VITE_GA4_ID` is set at build time).
