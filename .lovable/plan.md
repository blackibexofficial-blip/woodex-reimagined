

# WOODEX Website Fix & Enhancement Plan

## Issues Found

### Critical Bugs
1. **ProductListItem.tsx shows "AED" instead of PKR** (line 92-96) - hardcoded `AED` currency instead of using `formatPKR()`
2. **ProductListItem.tsx "Add to Quote" button not functional** - missing `useQuote` integration, uses `ShoppingCart` icon instead of `ShoppingBag`
3. **All 180+ products use the same 3 placeholder images** (`deskImage`, `chairImage`, `workstationImage`) - every product shows identical photos
4. **Nova Series missing from Header nav dropdown** - Series dropdown only lists 4 series but `seriesList` has 5 (including Nova)
5. **Virtual Showroom "Standing Desks" link broken** - links to `/shop?category=desks` which doesn't exist

### Content & Design Issues
6. **Contact form placeholder says "John Smith"** instead of a Pakistani name
7. **Product images are repetitive** - need unique generated images per category
8. **Shop sidebar missing product count per category** - no indication of how many products each category has
9. **No category landing/hero images** that change when switching categories
10. **Mega menu "Room Packages" link still visible** at bottom of Products dropdown (line 248)

### Missing Features from Plan
11. **No product search in Quotation page** - plan called for product search/selector in form
12. **No WhatsApp button on Contact page**
13. **No FAQ on About page**
14. **No Google Maps embed on Contact page**
15. **No timeline section on About page**

---

## Implementation Plan

### Phase 1: Fix Critical Bugs (3 files)

**1. Fix ProductListItem.tsx**
- Import `formatPKR` from `@/data/products` and `useQuote` from `@/contexts/QuoteContext`
- Replace `AED {product.price.toLocaleString()}` with `formatPKR(product.price)` on lines 92-96
- Wire up "Add to Quote" button with `addItem` from `useQuote`

**2. Fix Header.tsx**
- Add Nova Series to the Series dropdown (line 96)
- Remove "Room Packages" link from bottom of mega menu (line 248)

**3. Fix VirtualShowroom.tsx**
- Change "Standing Desks" href from `/shop?category=desks` to `/shop?category=executive-tables` (line 108)

### Phase 2: Generate Unique Product Images (image generation)

Generate 15 category-specific product images:
- Executive desk, manager desk, staff desk, meeting table, reception counter
- Office chair, workstation, cubicle, office sofa, storage
- Cafe furniture, bedroom set, living room sofa, dining set, public seating

Then update `products.ts` to assign category-appropriate images instead of repeating the same 3 images for all 180+ products. Create image imports and map them by category/subcategory.

### Phase 3: Improve Shop Page Design (Shop.tsx)

- Add product count badges next to each sidebar category
- Add dynamic category hero banner that changes per selected category
- Add "Shop by Room" quick navigation strip below hero

### Phase 4: Improve About Page (About.tsx)

- Add company timeline section (2004 Founded, 2010 First Factory, 2015 Nationwide, 2020 500+ Clients, 2024 Digital Platform)
- Add FAQ accordion section at bottom
- Add certifications/awards visual section

### Phase 5: Improve Contact Page (Contact.tsx)

- Fix placeholder "John Smith" to "Muhammad Ali"
- Add WhatsApp quick-contact floating button
- Add Google Maps embed placeholder
- Add FAQ section at bottom

### Phase 6: Improve Services Page (Services.tsx)

- Generate service-specific hero image
- Add client testimonials section
- Add pricing tiers for services

### Phase 7: Improve Quotation Page (Quotation.tsx)

- Add product search/selector dropdown to add products directly from the form
- Improve PDF export with print-specific CSS media query styles

### Phase 8: Improve Virtual Showroom (VirtualShowroom.tsx)

- Make 3D configurator more interactive with draggable furniture panels
- Add color/material picker sidebar
- Add "Save & Download Layout" functionality

---

## Files to Modify
1. `src/components/shop/ProductListItem.tsx` - Fix AED bug, add quote integration
2. `src/components/Header.tsx` - Add Nova Series, remove Room Packages link
3. `src/pages/VirtualShowroom.tsx` - Fix broken link, enhance configurator
4. `src/data/products.ts` - Update image assignments per category
5. `src/pages/Shop.tsx` - Category counts, dynamic hero, shop-by-room
6. `src/pages/About.tsx` - Timeline, FAQ, certifications
7. `src/pages/Contact.tsx` - WhatsApp, maps, FAQ, fix placeholder
8. `src/pages/Services.tsx` - Testimonials, pricing tiers, hero image
9. `src/pages/Quotation.tsx` - Product selector, print CSS
10. `src/pages/Index.tsx` - Minor content refinements

## New Images to Generate
- 15 category-specific product images
- 1 services hero image

## Estimated Scope
- ~10 files modified
- ~16 images generated
- All bugs fixed, all missing features added

