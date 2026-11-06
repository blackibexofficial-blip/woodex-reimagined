# Testing

## Manual QA Matrix
| Area | Cases |
|---|---|
| Nav | Mega-menus open/close, mobile drawer, all links resolve |
| Home | Slider autoplay + arrows + dots, section anchors |
| Shop | Filters apply, pagination, empty state |
| PDP | Gallery, zoom, 360, variants, Add-to-Cart, Add-to-Quote |
| Cart | Slide-out open, qty change, remove, subtotal, checkout link |
| Quote basket | Add/remove, 75% advance calc, PDF download, WhatsApp share |
| Quotation form | Validation, success toast, WhatsApp handoff |
| Contact | Validation, success state |
| Blog | List → detail, related links |
| Services | List → detail, FAQ accordion |
| Custom Design | Sections render, CTAs route to quotation |
| Virtual Showroom | Hotspots clickable → add to quote |
| 404 | Unknown URL renders NotFound |

## Cross-browser
Chrome, Safari, Firefox, Edge (latest 2 versions). iOS Safari 16+, Android Chrome.

## Devices
- Mobile: 375 (iPhone SE), 390 (iPhone 14), 412 (Pixel).
- Tablet: 768, 820.
- Desktop: 1280, 1440, 1920.

## Accessibility
- Automated: `bun run e2e:a11y` — axe-core, 7 routes, **0 violations** (after remediation
  of color-contrast/button-name/link-name/heading-order/landmark issues).
- Keyboard-only pass on nav, forms, cart, quote basket.
- Screen reader smoke test on Home + PDP + Contact.

## Automated (shipped)
- `bun run e2e` — puppeteer smoke suite (`e2e/smoke.mjs`, 33 checks): admin tabs + demo
  sign-in + offline-Supabase graceful failure + categories/media CRUD, per-route canonical
  + JSON-LD assertions, no `lovable.app` leaks, lazy-chunk SPA navigation. Runs against
  `vite preview` on :4173. CI: `.github/workflows/ci.yml`.
- `bun run e2e:a11y` — axe-core scan of 7 routes (`e2e/a11y.mjs`), report-only by default;
  `--fail` (CI) fails on critical/serious. Baseline after remediation: **0 violations**.
- `bun run typecheck`, `bun run lint` (0 errors), `bun run build` — all gated in CI.
- Vitest for utility functions (price calc, WhatsApp URL builder) `[planned]`.
