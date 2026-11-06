<?php

declare(strict_types=1);

/**
 * The URL map of the previous website: every old URL and where it lands now (docs/09 section 3).
 *
 * Generated from the old site's 142 HTML files; checked by tests/Feature/Website/LegacyUrlMapTest.php.
 * Since 17 Oct 2026 it holds 143 pages and no redirects: the 54 old service URLs are pages of their own.
 *
 * - `pages`     slug => page type + the old HTML file (relative to the old site root), null when the page is new.
 * - `redirects` old slug => the page it now 301s to. Empty since 17 Oct 2026: the owner asked for the complete
 *   old website to run in the CMS, so all 143 URLs are pages the studio can edit and nothing is thrown away.
 */
return [
    'pages' => [
        // Home
        '/' => ['type' => 'home', 'source' => 'index.html'],
        // Index pages
        '/insights/' => ['type' => 'listing', 'source' => 'insights/index.html'],
        '/projects/' => ['type' => 'listing', 'source' => 'projects/index.html'],
        '/services/' => ['type' => 'listing', 'source' => 'services/index.html'],
        // Core services
        '/3d-visualization/' => ['type' => 'service', 'source' => '3d-visualization/index.html'],
        '/architecture/' => ['type' => 'service', 'source' => 'architecture/index.html'],
        '/fit-out/' => ['type' => 'service', 'source' => 'fit-out/index.html'],
        '/interior-design/' => ['type' => 'service', 'source' => 'interior-design/index.html'],
        '/renovation/' => ['type' => 'service', 'source' => 'renovation/index.html'],
        // Cities
        '/bahawalpur/' => ['type' => 'city', 'source' => 'bahawalpur/index.html'],
        '/faisalabad/' => ['type' => 'city', 'source' => 'faisalabad/index.html'],
        '/gujranwala/' => ['type' => 'city', 'source' => 'gujranwala/index.html'],
        '/hyderabad/' => ['type' => 'city', 'source' => 'hyderabad/index.html'],
        '/islamabad/' => ['type' => 'city', 'source' => 'islamabad/index.html'],
        '/karachi/' => ['type' => 'city', 'source' => 'karachi/index.html'],
        '/lahore/' => ['type' => 'city', 'source' => 'lahore/index.html'],
        '/multan/' => ['type' => 'city', 'source' => 'multan/index.html'],
        '/peshawar/' => ['type' => 'city', 'source' => 'peshawar/index.html'],
        '/quetta/' => ['type' => 'city', 'source' => 'quetta/index.html'],
        '/rawalpindi/' => ['type' => 'city', 'source' => 'rawalpindi/index.html'],
        '/sialkot/' => ['type' => 'city', 'source' => 'sialkot/index.html'],
        // Lahore areas
        '/lahore/bahria-town/' => ['type' => 'area', 'source' => 'lahore/bahria-town/index.html'],
        '/lahore/cantt/' => ['type' => 'area', 'source' => 'lahore/cantt/index.html'],
        '/lahore/dha/' => ['type' => 'area', 'source' => 'lahore/dha/index.html'],
        '/lahore/gulberg/' => ['type' => 'area', 'source' => 'lahore/gulberg/index.html'],
        '/lahore/johar-town/' => ['type' => 'area', 'source' => 'lahore/johar-town/index.html'],
        '/lahore/lake-city/' => ['type' => 'area', 'source' => 'lahore/lake-city/index.html'],
        '/lahore/model-town/' => ['type' => 'area', 'source' => 'lahore/model-town/index.html'],
        '/lahore/wapda-town/' => ['type' => 'area', 'source' => 'lahore/wapda-town/index.html'],
        // Insights
        '/insights/1-kanal-house-interior-cost-lahore/' => ['type' => 'insight', 'source' => 'insights/1-kanal-house-interior-cost-lahore/index.html'],
        '/insights/10-marla-house-interior-lahore/' => ['type' => 'insight', 'source' => 'insights/10-marla-house-interior-lahore/index.html'],
        '/insights/3d-interior-design-cost-pakistan/' => ['type' => 'insight', 'source' => 'insights/3d-interior-design-cost-pakistan/index.html'],
        '/insights/3d-visualization-guide/' => ['type' => 'insight', 'source' => 'insights/3d-visualization-guide/index.html'],
        '/insights/5-marla-house-renovation-cost-lahore/' => ['type' => 'insight', 'source' => 'insights/5-marla-house-renovation-cost-lahore/index.html'],
        '/insights/apartment-interior-ideas-lahore/' => ['type' => 'insight', 'source' => 'insights/apartment-interior-ideas-lahore/index.html'],
        '/insights/apartment-small-space-planning-lahore/' => ['type' => 'insight', 'source' => 'insights/apartment-small-space-planning-lahore/index.html'],
        '/insights/architect-fee-lahore-2026/' => ['type' => 'insight', 'source' => 'insights/architect-fee-lahore-2026/index.html'],
        '/insights/bathroom-renovation-lahore/' => ['type' => 'insight', 'source' => 'insights/bathroom-renovation-lahore/index.html'],
        '/insights/clinic-interior-design-lahore/' => ['type' => 'insight', 'source' => 'insights/clinic-interior-design-lahore/index.html'],
        '/insights/design-process-explained/' => ['type' => 'insight', 'source' => 'insights/design-process-explained/index.html'],
        '/insights/dha-lahore-house-interior-guide/' => ['type' => 'insight', 'source' => 'insights/dha-lahore-house-interior-guide/index.html'],
        '/insights/dha-vs-bahria-town-interior-cost-lahore/' => ['type' => 'insight', 'source' => 'insights/dha-vs-bahria-town-interior-cost-lahore/index.html'],
        '/insights/false-ceiling-cost-lahore-2026/' => ['type' => 'insight', 'source' => 'insights/false-ceiling-cost-lahore-2026/index.html'],
        '/insights/false-ceiling-ideas-living-room/' => ['type' => 'insight', 'source' => 'insights/false-ceiling-ideas-living-room/index.html'],
        '/insights/flooring-options-pakistan/' => ['type' => 'insight', 'source' => 'insights/flooring-options-pakistan/index.html'],
        '/insights/grey-structure-finishing-lahore/' => ['type' => 'insight', 'source' => 'insights/grey-structure-finishing-lahore/index.html'],
        '/insights/home-office-design-ideas/' => ['type' => 'insight', 'source' => 'insights/home-office-design-ideas/index.html'],
        '/insights/home-renovation-checklist/' => ['type' => 'insight', 'source' => 'insights/home-renovation-checklist/index.html'],
        '/insights/house-renovation-cost-lahore-2026/' => ['type' => 'insight', 'source' => 'insights/house-renovation-cost-lahore-2026/index.html'],
        '/insights/house-renovation-timeline-lahore/' => ['type' => 'insight', 'source' => 'insights/house-renovation-timeline-lahore/index.html'],
        '/insights/how-to-choose-interior-designer-lahore/' => ['type' => 'insight', 'source' => 'insights/how-to-choose-interior-designer-lahore/index.html'],
        '/insights/interior-design-cost-pakistan/' => ['type' => 'insight', 'source' => 'insights/interior-design-cost-pakistan/index.html'],
        '/insights/interior-design-trends-pakistan-2027/' => ['type' => 'insight', 'source' => 'insights/interior-design-trends-pakistan-2027/index.html'],
        '/insights/interior-designer-cost-lahore-2026/' => ['type' => 'insight', 'source' => 'insights/interior-designer-cost-lahore-2026/index.html'],
        '/insights/interior-designer-vs-contractor-lahore/' => ['type' => 'insight', 'source' => 'insights/interior-designer-vs-contractor-lahore/index.html'],
        '/insights/kitchen-cabinet-materials-pakistan/' => ['type' => 'insight', 'source' => 'insights/kitchen-cabinet-materials-pakistan/index.html'],
        '/insights/kitchen-layouts-that-work-lahore-homes/' => ['type' => 'insight', 'source' => 'insights/kitchen-layouts-that-work-lahore-homes/index.html'],
        '/insights/kitchen-renovation-cost-lahore/' => ['type' => 'insight', 'source' => 'insights/kitchen-renovation-cost-lahore/index.html'],
        '/insights/lighting-design-layers-explained/' => ['type' => 'insight', 'source' => 'insights/lighting-design-layers-explained/index.html'],
        '/insights/materials-that-survive-lahore-climate/' => ['type' => 'insight', 'source' => 'insights/materials-that-survive-lahore-climate/index.html'],
        '/insights/modular-kitchen-price-pakistan-2026/' => ['type' => 'insight', 'source' => 'insights/modular-kitchen-price-pakistan-2026/index.html'],
        '/insights/new-house-interior-checklist-lahore/' => ['type' => 'insight', 'source' => 'insights/new-house-interior-checklist-lahore/index.html'],
        '/insights/office-fit-out-cost-pakistan-2026/' => ['type' => 'insight', 'source' => 'insights/office-fit-out-cost-pakistan-2026/index.html'],
        '/insights/office-interior-guide/' => ['type' => 'insight', 'source' => 'insights/office-interior-guide/index.html'],
        '/insights/office-interior-gulberg-lahore/' => ['type' => 'insight', 'source' => 'insights/office-interior-gulberg-lahore/index.html'],
        '/insights/office-layout-mistakes-productivity/' => ['type' => 'insight', 'source' => 'insights/office-layout-mistakes-productivity/index.html'],
        '/insights/office-renovation-checklist/' => ['type' => 'insight', 'source' => 'insights/office-renovation-checklist/index.html'],
        '/insights/paint-colours-pakistani-homes/' => ['type' => 'insight', 'source' => 'insights/paint-colours-pakistani-homes/index.html'],
        '/insights/restaurant-cafe-interior-cost-lahore/' => ['type' => 'insight', 'source' => 'insights/restaurant-cafe-interior-cost-lahore/index.html'],
        '/insights/restaurant-planning-guide/' => ['type' => 'insight', 'source' => 'insights/restaurant-planning-guide/index.html'],
        '/insights/retail-shop-interior-guide/' => ['type' => 'insight', 'source' => 'insights/retail-shop-interior-guide/index.html'],
        '/insights/salon-interior-design-lahore/' => ['type' => 'insight', 'source' => 'insights/salon-interior-design-lahore/index.html'],
        '/insights/small-bathroom-design-ideas/' => ['type' => 'insight', 'source' => 'insights/small-bathroom-design-ideas/index.html'],
        '/insights/small-space-ideas/' => ['type' => 'insight', 'source' => 'insights/small-space-ideas/index.html'],
        '/insights/upgrade-builder-finished-house-lahore/' => ['type' => 'insight', 'source' => 'insights/upgrade-builder-finished-house-lahore/index.html'],
        '/insights/wardrobe-design-cost-pakistan-2026/' => ['type' => 'insight', 'source' => 'insights/wardrobe-design-cost-pakistan-2026/index.html'],
        '/insights/wardrobe-vs-dressing-room/' => ['type' => 'insight', 'source' => 'insights/wardrobe-vs-dressing-room/index.html'],
        // Projects
        '/projects/cafe-corner/' => ['type' => 'project', 'source' => 'projects/cafe-corner/index.html'],
        '/projects/clinic-fit-out/' => ['type' => 'project', 'source' => 'projects/clinic-fit-out/index.html'],
        '/projects/courtyard-house/' => ['type' => 'project', 'source' => 'projects/courtyard-house/index.html'],
        '/projects/office-floor/' => ['type' => 'project', 'source' => 'projects/office-floor/index.html'],
        '/projects/retail-corner/' => ['type' => 'project', 'source' => 'projects/retail-corner/index.html'],
        '/projects/small-apartment/' => ['type' => 'project', 'source' => 'projects/small-apartment/index.html'],
        // Utility
        '/about/' => ['type' => 'about', 'source' => 'about/index.html'],
        // contact
        '/contact/' => ['type' => 'contact', 'source' => 'contact/index.html'],
        // legal
        '/privacy/' => ['type' => 'legal', 'source' => 'privacy/index.html'],
        // estimator
        '/estimator/' => ['type' => 'estimator', 'source' => 'estimator/index.html'],
        // booking
        '/book-a-visit/' => ['type' => 'booking', 'source' => 'book-a-visit/index.html'],
        // Every service URL of the old site keeps a page of its own (owner's decision, 17 Oct 2026).
        // They are grouped by the core discipline they belong to, which is the breadcrumb a visitor sees.
        // -> /interior-design/
        '/apartment-interior-design/' => ['type' => 'service', 'source' => 'apartment-interior-design/index.html'],
        '/bathroom-design/' => ['type' => 'service', 'source' => 'bathroom-design/index.html'],
        '/beauty-salon-design/' => ['type' => 'service', 'source' => 'beauty-salon-design/index.html'],
        '/cafe-interior-design/' => ['type' => 'service', 'source' => 'cafe-interior-design/index.html'],
        '/commercial-interior/' => ['type' => 'service', 'source' => 'commercial-interior/index.html'],
        '/coworking-space-design/' => ['type' => 'service', 'source' => 'coworking-space-design/index.html'],
        '/false-ceiling-design/' => ['type' => 'service', 'source' => 'false-ceiling-design/index.html'],
        '/gym-design/' => ['type' => 'service', 'source' => 'gym-design/index.html'],
        '/healthcare-design/' => ['type' => 'service', 'source' => 'healthcare-design/index.html'],
        '/hotel-interior-design/' => ['type' => 'service', 'source' => 'hotel-interior-design/index.html'],
        '/office-interior-design/' => ['type' => 'service', 'source' => 'office-interior-design/index.html'],
        '/residential-basement-design/' => ['type' => 'service', 'source' => 'residential-basement-design/index.html'],
        '/residential-bedroom-design/' => ['type' => 'service', 'source' => 'residential-bedroom-design/index.html'],
        '/residential-dining-room-design/' => ['type' => 'service', 'source' => 'residential-dining-room-design/index.html'],
        '/residential-home-office-design/' => ['type' => 'service', 'source' => 'residential-home-office-design/index.html'],
        '/residential-kids-room-design/' => ['type' => 'service', 'source' => 'residential-kids-room-design/index.html'],
        '/residential-living-room-design/' => ['type' => 'service', 'source' => 'residential-living-room-design/index.html'],
        '/restaurant-interior-design/' => ['type' => 'service', 'source' => 'restaurant-interior-design/index.html'],
        '/retail-design/' => ['type' => 'service', 'source' => 'retail-design/index.html'],
        '/showroom-design/' => ['type' => 'service', 'source' => 'showroom-design/index.html'],
        '/spa-design/' => ['type' => 'service', 'source' => 'spa-design/index.html'],
        // -> /architecture/
        '/1-kanal-house-design/' => ['type' => 'service', 'source' => '1-kanal-house-design/index.html'],
        '/10-marla-house-design/' => ['type' => 'service', 'source' => '10-marla-house-design/index.html'],
        '/2-kanal-house-design/' => ['type' => 'service', 'source' => '2-kanal-house-design/index.html'],
        '/5-marla-house-design/' => ['type' => 'service', 'source' => '5-marla-house-design/index.html'],
        '/educational-buildings-design/' => ['type' => 'service', 'source' => 'educational-buildings-design/index.html'],
        '/farmhouse-design/' => ['type' => 'service', 'source' => 'farmhouse-design/index.html'],
        '/front-elevation-design/' => ['type' => 'service', 'source' => 'front-elevation-design/index.html'],
        '/healthcare-facilities-design/' => ['type' => 'service', 'source' => 'healthcare-facilities-design/index.html'],
        '/master-planning/' => ['type' => 'service', 'source' => 'master-planning/index.html'],
        '/office-buildings-design/' => ['type' => 'service', 'source' => 'office-buildings-design/index.html'],
        '/restaurant-cafe-building-design/' => ['type' => 'service', 'source' => 'restaurant-cafe-building-design/index.html'],
        '/retail-buildings-design/' => ['type' => 'service', 'source' => 'retail-buildings-design/index.html'],
        '/shopping-mall-design/' => ['type' => 'service', 'source' => 'shopping-mall-design/index.html'],
        // -> /renovation/
        '/commercial-renovation/' => ['type' => 'service', 'source' => 'commercial-renovation/index.html'],
        '/complete-home-redesign/' => ['type' => 'service', 'source' => 'complete-home-redesign/index.html'],
        '/healthcare-renovation/' => ['type' => 'service', 'source' => 'healthcare-renovation/index.html'],
        '/interior-home-refurbishment/' => ['type' => 'service', 'source' => 'interior-home-refurbishment/index.html'],
        '/kitchen-renovation/' => ['type' => 'service', 'source' => 'kitchen-renovation/index.html'],
        '/office-renovation/' => ['type' => 'service', 'source' => 'office-renovation/index.html'],
        '/residential-renovation/' => ['type' => 'service', 'source' => 'residential-renovation/index.html'],
        '/restaurant-cafe-renovation/' => ['type' => 'service', 'source' => 'restaurant-cafe-renovation/index.html'],
        '/retail-showroom-renovation/' => ['type' => 'service', 'source' => 'retail-showroom-renovation/index.html'],
        '/specialized-renovation-services/' => ['type' => 'service', 'source' => 'specialized-renovation-services/index.html'],
        // -> /fit-out/
        '/commercial-fit-out/' => ['type' => 'service', 'source' => 'commercial-fit-out/index.html'],
        '/healthcare-fit-out/' => ['type' => 'service', 'source' => 'healthcare-fit-out/index.html'],
        '/office-fit-out/' => ['type' => 'service', 'source' => 'office-fit-out/index.html'],
        '/pharmacy-fit-out/' => ['type' => 'service', 'source' => 'pharmacy-fit-out/index.html'],
        '/restaurant-fit-out/' => ['type' => 'service', 'source' => 'restaurant-fit-out/index.html'],
        '/retail-fit-out/' => ['type' => 'service', 'source' => 'retail-fit-out/index.html'],
        '/turnkey-design-build/' => ['type' => 'service', 'source' => 'turnkey-design-build/index.html'],
        '/dressing-room-design/' => ['type' => 'service', 'source' => 'dressing-room-design/index.html'],
        '/kitchen-design/' => ['type' => 'service', 'source' => 'kitchen-design/index.html'],
        '/wardrobe-design/' => ['type' => 'service', 'source' => 'wardrobe-design/index.html'],
    ],
    'redirects' => [
        // Empty on purpose since 17 Oct 2026: every URL of the old site is a page now, so nothing 301s.
        // A redirect added here (or in Admin -> Website -> SEO & Redirects) still works exactly the same way.
    ],
];
