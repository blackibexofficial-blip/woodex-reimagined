

# WOODEX Website Comprehensive Fix & Enhancement Plan

## Analysis Summary

After thorough codebase review, here are all identified issues and missing features:

---

## Phase 1: Shop Sidebar Category Restructure

**Problem:** Current sidebar is flat with inconsistent grouping. User wants grouped/expandable sections matching their category list.

**Fix in `Shop.tsx`:** Restructure `categoryTree` to group categories properly:
- **Office Tables** (expand) — Executive, Manager, Staff, Meeting, Reception
- **Office Chairs** (flat)
- **Workstations** (flat)
- **Cubicle Workstations** (flat)
- **Office Storage** (flat)
- **Lounge / Office Sofas** (flat)
- **Acoustic Furniture** (flat)
- **Collaborative Furniture** (flat)
- **Cafe Furniture** (flat)
- **Bedroom Furniture** (expand) — Bed Sets, Bedside, Dressing, Mirrors, Bench
- **Living Room** (expand) — Sofa, Center Tables, Coffee, Console, TV Units
- **Dining** (expand) — Sets, Chairs, Tables

Also improve sidebar UI with group section headers (Office vs Home), product count badges, and better expand/collapse UX.

---

## Phase 2: Missing Pages — Blog

**Problem:** No Blog page exists. User wants a blog page.

**Create `src/pages/Blog.tsx`:** Static blog listing page with placeholder articles about office design trends, ergonomic tips, workspace productivity, WOODEX project case studies. Add route in `App.tsx`.

---

## Phase 3: Navigation Mega Menu Improvements

**Problem:** Mega menu needs pictures and missing links (Shop, Blog).

**Fix in `Header.tsx`:**
- Add category images to mega menu sections (small thumbnail next to each group heading)
- Add "Shop All" and "Blog" links to the mega menu bottom bar
- Add utility nav links for Shop and Blog in utility bar

---

## Phase 4: Generate All Missing Images

**Problem:** Multiple pages use same placeholder images or have no hero images.

**Generate images using AI image generation:**
1. **Services page** — 6 service-specific images (Space Planning, Custom Manufacturing, Delivery, Project Management, After-Sales, Ergonomic Consulting)
2. **Contact page** — hero/header image
3. **Projects page** — ensure all 6 project images are unique and contextual
4. **Series page** — missing Nova Series image (currently falls back to `execImg`)
5. **B2B page** — pricing tier illustrations
6. **About page** — team member photos or better placeholders
7. **Index page** — home category images for Bedroom, Living, Dining sections

Update all page files to use the generated images.

---

## Phase 5: Services Page — Add Pictures per Service

**Problem:** Services cards have icons only, no images.

**Fix in `Services.tsx`:**
- Generate 6 service images
- Add image to each service card (image on top, content below)
- Improve service card layout to be more visual

---

## Phase 6: B2B Pricing Tiers — Price to Features/Benefits

**Problem:** Current tiers show just discount percentage. User wants feature-focused benefit comparison.

**Fix in `B2B.tsx`:**
- Restructure tiers to show actual pricing ranges prominently
- Add comparison table format showing which features are included per tier
- Add checkmarks/crosses for feature availability
- Add "What's Included" breakdown per tier

---

## Phase 7: Virtual Showroom — Improve 3D Configurator Section

**Problem:** 3D Configurator is a static placeholder with just a button.

**Fix in `VirtualShowroom.tsx`:**
- Add interactive furniture category tabs within the configurator section
- Add drag-and-drop style product panels (simulated with click-to-place UI)
- Add material/color picker sidebar
- Add "Save Layout" and "Download Layout" buttons
- Make it more interactive with product thumbnails that can be "placed"

---

## Phase 8: Contact Page — Add Hero Image

**Problem:** Contact page has no hero image, just a dark background.

**Fix in `Contact.tsx`:**
- Add hero image behind the header section
- Generate appropriate office/showroom image

---

## Phase 9: Series Page — Fix Missing Image

**Problem:** `seriesImages` map missing `nova-series` entry, falls back to default.

**Fix in `Series.tsx`:**
- Generate Nova Series image
- Add to `seriesImages` map

---

## Phase 10: SEO Improvements for Shop Categories

**Problem:** No per-category meta descriptions or structured heading hierarchy.

**Fix in `Shop.tsx`:**
- Add dynamic meta descriptions per category
- Add category description text below category heading
- Add structured breadcrumb for SEO

---

## Files to Create/Modify

| File | Action |
|------|--------|
| `src/pages/Blog.tsx` | **Create** — New blog listing page |
| `src/App.tsx` | **Edit** — Add Blog route |
| `src/pages/Shop.tsx` | **Edit** — Restructure sidebar, add SEO descriptions |
| `src/components/Header.tsx` | **Edit** — Improve mega menu with images, add Blog/Shop links |
| `src/pages/Services.tsx` | **Edit** — Add service images to cards |
| `src/pages/B2B.tsx` | **Edit** — Improve pricing tiers to feature-comparison |
| `src/pages/VirtualShowroom.tsx` | **Edit** — Enhance 3D configurator interactivity |
| `src/pages/Contact.tsx` | **Edit** — Add hero image |
| `src/pages/Series.tsx` | **Edit** — Fix Nova Series image |
| `src/components/Footer.tsx` | **Edit** — Add Blog link |
| 6-8 new image assets | **Generate** — Service, series, contact images |

## Estimated Scope
- 10 files modified, 1 new page created
- 6-8 images generated
- Improved navigation, sidebar, SEO, and visual polish across entire site

