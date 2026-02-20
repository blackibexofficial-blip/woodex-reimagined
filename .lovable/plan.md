
# WOODEX Complete Website Overhaul Plan

## Summary of All Changes

This is a comprehensive, multi-file overhaul covering navigation, footer, all pages, new features, SEO, and product data. Here is everything that will be built/improved:

---

## 1. NAVIGATION (Header.tsx) — Complete Rebuild

**Changes:**
- Remove "Virtual Showroom" from nav (move to Showrooms utility bar link)
- Remove "Room Packages" from nav
- Remove Login icon (User icon)
- Keep Search icon only
- Improve hamburger menu with better 3-line design and animated slide-down mobile menu
- Update nav to match exact requested structure:
  - **Products** (mega-dropdown with Office + Home categories):
    - Office Tables → sub: Executive, Manager, Staff, Meeting, Reception
    - Office Chairs, Workstations, Cubicle Workstation, Office Sofas, Office Storages, Cafe Furniture, Public Sitting
    - **Home Furniture** → Bedroom (Beds, Bedside, Dressing, Mirrors, Bench), Living (Sofa, Coffee, Console, TV Units), Dining (Sets, Chairs, Tables)
  - **Markets** (dropdown: Corporate, Education, Healthcare, Government, Hospitality)
  - **Series** (dropdown: Ek Series, Infinity Series, Woodex Series, Cubicle Series)
  - **Projects**
  - **Services**
  - **About**
  - **Contact**
- Utility bar: Showrooms → `/showrooms` (Virtual Showroom page), Material and Colors → `/materials`, Warranty → `/warranty`

---

## 2. FOOTER (Footer.tsx) — 5-Column Proper Layout

**5 Columns:**
- **Col 1: WOODEX Brand** — Logo, tagline, description, contact info (+92 300 1234567, info@woodex.pk, Lahore Pakistan), social icons (Facebook, Twitter, LinkedIn, Instagram, YouTube)
- **Col 2: Quick Links** — About Us, Portfolio, Careers, Contact, Showrooms, Series, B2B/Markets
- **Col 3: Shop** — Office Tables (Executive, Manager, Staff, Meeting, Reception), Office Chairs, Workstations, Cubicle, Office Sofas, Storage
- **Col 4: Learn More** — Awards, Ideas & Inspiration, Terms of Use, Resources, Support, Warranty, Distributors, FAQ
- **Col 5: Contact** — Address details, phone, email, hours, map link button, newsletter signup input

---

## 3. PRODUCT DATA (products.ts) — Expanded Categories

New full category structure with PKR prices:
```
Office Tables:
  - Executive Table, Manager Table, Staff Table, Meeting Table, Reception Table

Office Chairs (expanded)
Workstations / Cubicle Workstations
Office Sofas
Office Storages
Cafe Furniture
Public Sitting

Home Furniture:
  Bedroom: Bed Sets, Bedside Tables, Dressing Tables, Mirrors, Bench & Settee
  Living: Home Sofa, Center & Side Tables, Coffee Tables, Console, TV Units
  Dining: Dining Sets, Dining Chairs, Dining Tables
```

All prices in PKR (Pakistani Rupees), e.g., PKR 45,000 to PKR 1,200,000.

---

## 4. SHOP PAGE — Subcategory Navigation + SEO

**Improvements:**
- Full subcategory sidebar/tabs with all office + home furniture categories
- Category hero banners that change per selection
- SEO meta descriptions per category (using page title changes)
- Improved product grid with PKR prices
- FAQ accordion section at bottom of shop page
- "Shop by Room" quick links

---

## 5. QUOTE BASKET / CART SYSTEM (New Context + Component)

**New files:**
- `src/contexts/QuoteContext.tsx` — React Context for quote basket (persisted via localStorage)
- `src/components/QuoteBasket.tsx` — Slide-out drawer/panel showing quote items
- `src/components/QuoteBasketButton.tsx` — Floating button showing item count

**Features:**
- Add to Quote button on product cards and product detail pages
- Quantity management (+/-) per item
- Remove items
- Persists in localStorage between page visits
- On Quotation page: quote basket items pre-populate the form
- PDF export: generates printable quote PDF using browser print + CSS `@media print`
- Quote basket drawer accessible from header

---

## 6. QUOTATION PAGE — Improved with Product Selection

**Improvements:**
- Shows pre-added items from quote basket at top
- Allows adding/removing products directly in form
- Product search/selector in form
- Budget calculator showing estimated total
- PDF download button that generates formatted quote PDF
- Improved form fields with Pakistan-specific data

---

## 7. SERIES PAGE — 4 New Series + Single Series Pages

**New series data:**
- **Ek Series** — Entry-level/affordable, budget-friendly office furniture
- **Infinity Series** — Modular, expandable systems
- **Woodex Series** — Premium flagship collection
- **Cubicle Series** — Privacy-focused cubicle workstations

**New pages:**
- `src/pages/SeriesDetail.tsx` — Single series page showing products in that series, hero, features, product grid

**Route added:** `/series/:seriesId`

---

## 8. PROJECTS PAGE — Before/After + Single Project Pages

**Improvements:**
- Before/After image slider toggle on project cards (hover to reveal before/after)
- Single project detail page: `src/pages/ProjectDetail.tsx`
- Route: `/projects/:projectId`
- Shows: full gallery, project stats, before/after comparison, furniture used, client testimonial

---

## 9. VIRTUAL SHOWROOM PAGE — Improved 3D Configurator

**Improvements:**
- Realistic 3D room configurator UI using CSS transforms + interactive panels
- Room type selector with animated transitions
- Furniture drag-and-drop simulation (CSS-based, no 3D lib needed to avoid complexity)
- Color/material selector panel
- "Save & Download Layout" button
- Showrooms link now connects utility bar "Showrooms" to this page

**Also create:** `src/pages/Showrooms.tsx` — dedicated showroom locations page linked from utility bar

---

## 10. MATERIALS & WARRANTY PAGES

**New pages:**
- `src/pages/Materials.tsx` — Material and Colors page with fabric swatches, wood finishes, metal options, interactive color picker
- `src/pages/Warranty.tsx` — Warranty information page with coverage tables, claim process, FAQ

---

## 11. HOME PAGE (Index.tsx) — Enhanced

**Improvements:**
- Hero slides updated with new categories (Home furniture too)
- New "Shop by Category" mega grid with all new subcategories
- Home furniture section added to homepage
- More featured products section
- Improved SEO content (meta-like descriptions, proper H1/H2 hierarchy)
- Before/After workspace transformation section
- Customer testimonials section with ratings

---

## 12. ABOUT PAGE — Improved

**Improvements:**
- Better hero with factory imagery
- Timeline section (company milestones)
- Certifications & awards section with icons
- Expanded team section with proper cards
- Manufacturing process visual steps
- Pakistan map showing distribution

---

## 13. CONTACT PAGE — Improved

**Improvements:**
- Embedded Google Maps iframe (placeholder)
- Better showroom cards with images
- FAQ section at bottom
- WhatsApp quick contact button
- Multiple contact reasons (Sales, Support, Custom, Media)

---

## 14. SERVICES PAGE — Improved

**Improvements:**
- Better hero image
- Service detail cards with numbered steps
- Pricing tiers for services
- Client testimonials specific to services
- Process timeline visualization

---

## 15. B2B PAGE — Improved

**Improvements:**
- Market-specific sections with dedicated content
- Pricing/feature comparison table for B2B tiers
- Partnership benefits section
- Lead form specifically for B2B inquiries

---

## 16. SEO IMPROVEMENTS (All Pages)

- Add `<title>` and `<meta description>` via document.title updates in useEffect on each page
- Proper H1/H2/H3 hierarchy on all pages
- Schema-ready product descriptions
- FAQ sections on Shop, Services, About pages
- Keyword-rich content for Pakistan office furniture market
- Alt text on all images
- Canonical-ready URL structure

---

## Technical Implementation Order

```text
Phase 1 — Core Infrastructure
  ├── src/contexts/QuoteContext.tsx (new)
  ├── src/data/products.ts (expanded with all categories + PKR prices)
  └── src/App.tsx (new routes)

Phase 2 — Global Components
  ├── src/components/Header.tsx (mega nav)
  ├── src/components/Footer.tsx (5-column)
  └── src/components/QuoteBasket.tsx (new)

Phase 3 — New Pages
  ├── src/pages/SeriesDetail.tsx (new)
  ├── src/pages/ProjectDetail.tsx (new)
  ├── src/pages/Showrooms.tsx (new)
  ├── src/pages/Materials.tsx (new)
  └── src/pages/Warranty.tsx (new)

Phase 4 — Page Improvements
  ├── Index.tsx, Shop.tsx, ProductDetail.tsx
  ├── Series.tsx, Projects.tsx, VirtualShowroom.tsx
  ├── About.tsx, Contact.tsx, Services.tsx
  ├── B2B.tsx, RoomPackages.tsx, Quotation.tsx
  └── All pages get SEO useEffect + FAQ
```

---

## Files to Create (New)
1. `src/contexts/QuoteContext.tsx`
2. `src/components/QuoteBasket.tsx`
3. `src/pages/SeriesDetail.tsx`
4. `src/pages/ProjectDetail.tsx`
5. `src/pages/Showrooms.tsx`
6. `src/pages/Materials.tsx`
7. `src/pages/Warranty.tsx`

## Files to Heavily Modify (Existing)
1. `src/App.tsx` — add all new routes
2. `src/data/products.ts` — complete expansion
3. `src/components/Header.tsx` — mega nav rebuild
4. `src/components/Footer.tsx` — 5-column rebuild
5. `src/pages/Index.tsx` — homepage enhancements
6. `src/pages/Shop.tsx` — subcategories + FAQ
7. `src/pages/ProductDetail.tsx` — Add to Quote integration
8. `src/pages/Series.tsx` — 4 new series
9. `src/pages/Projects.tsx` — before/after system
10. `src/pages/Quotation.tsx` — basket integration + PDF
11. `src/pages/VirtualShowroom.tsx` — improved 3D configurator
12. `src/pages/About.tsx` — timeline + certifications
13. `src/pages/Contact.tsx` — maps + FAQ
14. `src/pages/Services.tsx` — pricing tiers
15. `src/pages/B2B.tsx` — market sections
16. `src/pages/RoomPackages.tsx` — pricing system

All prices will be in PKR. All content will be Pakistan-specific. All pages will be fully responsive.
