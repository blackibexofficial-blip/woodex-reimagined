# SEO Launch Checklist

## Pre-Launch
- [x] Unique `<title>` + meta description on every route (RouteHead; e2e spot-checks `/`, `/shop`, `/blog`).
- [x] Single H1 per page (audit pass during implementation; crawl verify after deploy).
- [x] Canonical tags set to production domain (root-absolute, no query strings; e2e asserts `https://woodex.pk/`).
- [x] `og:title`, `og:description`, `og:type`, `og:image`, `twitter:card` present (`index.html` + per-route RouteHead).
- [x] Alt text on every `<img>` (enforced; redundant alts removed in a11y pass — axe `image-redundant-alt` clean).
- [x] `public/robots.txt` present, `Allow: /`, includes `Sitemap: https://woodex.pk/sitemap.xml` line.
- [x] `public/sitemap.xml` generated via `scripts/generate-sitemap.ts` (build hook; 182 URLs; `/quotation` still included — owner decision pending).
- [x] JSON-LD: Organization, LocalBusiness (FurnitureStore), WebSite + SearchAction in `index.html` (e2e asserts).
- [x] Product, Article, BreadcrumbList JSON-LD on relevant pages (e2e asserts per template).
- [ ] `hreflang` — skip until Urdu variants exist.
- [x] 404 page renders helpful links (SPA: status is 200 + client-side not-found; Apache cannot emit 404 for client routes — accepted trade-off).

## GSC / Analytics
- [ ] Google Search Console verified (both `www` and root).
- [ ] Sitemap submitted.
- [ ] GA4 property + measurement ID wired (foundation env-gated via `VITE_GA4_ID` — inert until owner supplies the ID + rebuilds).
- [ ] Key events: `whatsapp_click`, `quote_submit`, `add_to_cart`, `checkout_submit`, `contact_submit`.
- [ ] Bing Webmaster Tools verified.

## Performance / Vitals
- [ ] Lighthouse SEO ≥ 90 on all top pages.
- [ ] LCP < 2.5s, CLS < 0.1, INP < 200ms.

## Content QA
- [x] Every category page has SEO block copy (`seoContent.ts`).
- [ ] Every service page has 6 FAQs.
- [x] Every series page has hero + narrative + gallery.
- [x] No lorem, no placeholder images (all imagery original/converted; links spot-checked via e2e lazy-route pass).

## Post-Launch (Week 1)
- [ ] Fetch & render top 10 URLs in GSC.
- [ ] Watch Coverage report for indexation issues.
- [ ] Semrush baseline snapshot recorded.
