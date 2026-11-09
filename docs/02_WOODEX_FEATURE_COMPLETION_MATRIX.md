# WOODEX feature completion matrix

Status: **audit in progress**, 2026-11-08. The matrix triages the requested individual capabilities from local code and recorded local tests. It is not a line-by-line complete audit and no row is certified production-complete. Hosted data, real providers, live site and real permissions were not examined. `Testing` means a limited local regression exists, not that the full acceptance criterion passed; `Blocked` means required external access, decision or security control is missing. “Not Started” means no complete implementation was established by this review, not proof that no partial code exists anywhere.

Task status values: Not Started / In Progress / Blocked / Testing / Complete / Deferred. All current evidence and acceptance remain scoped; revisit every row after a real workflow test.

Coverage: **19 requested module categories and 265 feature rows triaged**. Current task-status counts: Blocked: 15, In Progress: 199, Not Started: 25, Testing: 26. These are triage counts, not a verified business completion percentage.
## B1 Admin dashboard
**Evidence:** `src/admin/pages/{Dashboard,Analytics}.tsx; src/api/{demo/db,supabase,bagisto/admin}.ts`  
**Priority:** P1  
**Required verification:** Dashboard integrity tests; then reconcile full datasets and approved definitions on isolated staging.

| Feature | Task status | Local finding / remaining work |
|---|---|---|
| Dashboard KPIs | Testing | Existing cards; sources and semantics vary, full dataset not guaranteed. |
| Revenue analytics | Testing | Local order-sample safeguards; order totals are not recognized revenue. |
| Orders analytics | Testing | Locally date-filtered first-page sample; not full server-side aggregates. |
| Customer analytics | In Progress | Customer/client views exist; reliable customer metrics not established. |
| Lead pipeline | In Progress | Lead board and quote counts exist; conversion measurement incomplete. |
| Inventory watchlist | Testing | First-50-product watchlist is explicitly a sample; thresholds differ. |
| Recent orders | Testing | Recent-order table and explicit empty/error states exist. |
| Notifications | In Progress | Polling bell exists; partially failed sources can appear as zero. |
| Date filters | Testing | Analytics has 7/30/90 UTC days applied only to loaded sample; no full report filter. |
| Drill-down links | In Progress | Some overview links exist; no complete date-filtered, per-KPI drill-down. |

## B2 Website CMS
**Evidence:** `src/admin/pages/{Pages,PageEditor}.tsx; supabase/migrations/20261107000002_page_rpcs.sql; docs/08-master-plan/PHASE1-CMS-SNAPSHOTS.md`  
**Priority:** P1  
**Required verification:** Test scoped role/CRUD with synthetic pages and isolated staging, including errors, reload, publish, unpublish and rollback.

| Feature | Task status | Local finding / remaining work |
|---|---|---|
| Pages list | In Progress | Page list exists; hosted permissions and all adapter behavior need verification. |
| Page creation | In Progress | Create path exists; Supabase creates blank pages and folder support differs. |
| Page editing | In Progress | Puck editor and save path exist; live full-document persistence is unverified. |
| Page deletion | In Progress | Page deletion code exists; dependency and hosted behavior need tests. |
| Draft saving | Testing | Local snapshot tests cover draft isolation; same-editor in-flight save races are mitigated and tested; cross-editor conflicts remain open. |
| Publishing | Testing | Local permission and SEO checks exist; public route is limited and off by default. |
| Unpublishing | Testing | Local snapshot boundary tests exist; real-host cache invalidation remains open. |
| Preview | In Progress | Legacy /lab preview and opt-in published-only /p route have different boundaries. |
| Version history | In Progress | History rail and page versions exist; legacy shapes and hosted coverage vary. |
| Revision restoration | Testing | P0 regression covers complete and legacy snapshots; demo and Supabase unpublish semantics differ. |
| Page status | In Progress | Draft/published controls exist; consistency with deployed read model unverified. |
| Slug management | In Progress | Slug handling exists; published slug collisions fail closed but are not prevented transactionally. |

## B3 Visual website builder
**Evidence:** `src/admin/pages/PageEditor.tsx; src/pages-builder/{library,blocks,elements,richtext}.tsx; src/pages-builder/inspector.ts; docs/08-master-plan/PHASE1-CMS-SNAPSHOTS.md`  
**Priority:** P1  
**Required verification:** Exercise the exact action, save/reload, restore and supported public rendering in an isolated browser; audit unsafe HTML/styles before exposure.

| Feature | Task status | Local finding / remaining work |
|---|---|---|
| Three-panel editor | In Progress | Puck editor/plugins and rails are wired; full workflow and responsive usability not certified. |
| Widget library | In Progress | Element and section catalogue exists; feature coverage differs by public profile. |
| Section library | In Progress | Library lists section cards with insert actions; persistence of all section types unverified. |
| Drag and drop | In Progress | Puck drag UI exists; persistence and keyboard parity not established by a handle. |
| Reordering | In Progress | Puck and outline support shown; end-to-end saved order across revisions unverified. |
| Nested containers | In Progress | Builder block schemas need dedicated nested-drop and persistence verification; public preflight rejects additional zones. |
| Duplicate | In Progress | Puck layer permissions include duplicate; behavior and unique IDs need regression. |
| Delete | In Progress | Puck layer permissions include delete; protected blocks and persistence need regression. |
| Undo | In Progress | Editor framework capabilities not verified across remount, save and library insertion. |
| Redo | In Progress | Editor framework capabilities not verified across remount, save and library insertion. |
| Layers | In Progress | Outline plugin labelled Layers is configured; complex nested consistency unverified. |
| Navigator | In Progress | Layers outline exists; complete requested navigator behavior unverified. |
| Inline editing | In Progress | Editor onChange and inline fields exist; persistence on every widget not verified. |
| Text editor | In Progress | Rich text exists with custom sanitizer; public profile rejects formatted HTML. |
| Image replacement | In Progress | Image fields and Media screen exist; replacement reference correctness unverified. |
| Image cropping | Not Started | No complete tested editor crop workflow was established. |
| Image positioning | In Progress | Image/style properties exist; end-to-end crop/position persistence unverified. |
| HTML widget | Blocked | Arbitrary HTML public safety not established; public preflight rejects formatted HTML. |
| Custom CSS | Blocked | Public preflight rejects linked/inspector styles; safe CSS policy not established. |
| Typography | In Progress | Inspector controls and theme tokens exist; public support limited. |
| Background | In Progress | Inspector controls exist; public profile currently rejects custom styles. |
| Border | In Progress | Inspector controls exist; public profile currently rejects custom styles. |
| Shadow | In Progress | Inspector controls exist; public profile currently rejects custom styles. |
| Spacing | In Progress | Inspector controls exist; public profile currently rejects custom styles. |
| Hover states | In Progress | Inspector hover variables exist; public style profile and safety unverified. |
| Responsive controls | In Progress | Builder responsive controls present; correct rendered results across devices unverified. |
| Desktop preview | In Progress | Editor/Puck preview exists; current responsive rendering unverified. |
| Tablet preview | In Progress | Viewport capability requires direct verified test. |
| Mobile preview | In Progress | Viewport capability requires direct verified test. |
| Global styles | In Progress | Theme and linked styles exist; public preflight rejects linked styles. |
| Reusable templates | In Progress | Some section/page template concepts exist; library template tab is marked planned. |
| Autosave | Not Started | PageEditor exposes manual save; no verified autosave behavior found. |
| Manual save | In Progress | Local 12/12 browser safety checks cover delayed saves, restore and publish; router-wide leave protection and real cross-editor concurrency remain unverified. |
| Draft | Testing | Local draft persistence and snapshot isolation have targeted coverage. |
| Preview | In Progress | Editor/LAB and staging public preview have different security boundaries. |
| Publish | Testing | Capability and draft/public tests are local; public builder rollout remains blocked. |
| Revision history | In Progress | History rail and restore exist; multiple snapshot shapes and backend behavior remain. |

## B3.1 Additional builder library, global controls and WOODEX widgets
**Evidence:** `src/pages-builder/library.tsx`, `src/pages-builder/sections/home-blocks.tsx`, `src/pages-builder/sections/catalogue-a.tsx`, `src/pages-builder/public-document.ts`, `src/admin/pages/PageEditor.tsx`.  
**Priority:** P1. **Required verification:** Exercise each control in the existing editor and persisted revision; only enable safe public widgets after source, permissions, content and end-to-end tests.

| Feature | Task status | Local finding / remaining work |
|---|---|---|
| Colours | In Progress | Inspector colour controls exist; public styles are currently excluded. |
| Gradients | In Progress | Style capability requires saved/rendered cross-device verification. |
| Add section | In Progress | Existing library insert action appends a block; exact persistence must be tested. |
| Remove section | In Progress | Existing editor deletion controls require save/reload tests. |
| Save section | In Progress | Saved-sections data exists; actual reusable library integration unverified. |
| Reuse section | In Progress | Library has catalogue inserts; saved-section workflow is not proven. |
| Import template | Not Started | Template tab is marked planned; a complete safe import flow was not found. |
| Export template | Not Started | Full safe, versioned template export was not established. |
| New page from template | In Progress | Starter/template concepts exist; Supabase page creation is blank. |
| Global header control | In Progress | Existing header exists; builder-owned global publishing not proven. |
| Global footer control | In Progress | Existing footer exists; builder-owned global publishing not proven. |
| Global navigation control | In Progress | Existing header links exist; managed menu publishing not proven. |
| Theme tokens | In Progress | Theme/linked style concepts exist; public style profile is limited. |
| Global typography | In Progress | Typography/style controls exist; full global publication and safety unverified. |
| Global buttons | In Progress | Button elements exist; full global design propagation unverified. |
| Responsive breakpoints | In Progress | Existing editor styles exist; complete persisted/public behavior unverified. |
| Product grids | In Progress | Catalogue blocks exist; authoritative source and public profile not established. |
| Product carousels | In Progress | ProductRail uses seed catalogue; locally reproduced broken URL was repaired, 5/5 synthetic checks pass. Live source still unverified. |
| Category grids | In Progress | CategoryCircles content exists; current backend and public profile not established. |
| Product details widget | Not Started | A full product-detail builder widget was not demonstrated. |
| Product customization widget | Not Started | Full configurator-to-order builder widget not demonstrated. |
| Quote request form widget | Blocked | Preview-only form is not a working lead submission and public preflight excludes it. |
| Project galleries | In Progress | Project/image sections exist; public data boundary and full integration unverified. |
| Services widget | In Progress | Service sections exist; live-authoritative service binding not established. |
| Testimonials widget | In Progress | Section catalogue includes content blocks; source/approval/public profile unverified. |
| Blog posts widget | In Progress | Blog content and blocks exist; published-source binding unverified. |
| Appointment form widget | Blocked | Preview-only forms do not provide a tested booking/slot service. |
| WhatsApp CTA | In Progress | Links exist; provider consent, correct owner contact and delivery unverified. |
| Virtual showroom widget | In Progress | Standalone configurator exists; integrated safe public builder widget unverified. |

## B4 Live storefront
**Evidence:** `src/App.tsx; src/pages-builder/{LabPreview,PublishedPagePreview}.tsx; docs/08-master-plan/PHASE1-CMS-SNAPSHOTS.md`  
**Priority:** P1  
**Required verification:** On restricted staging with synthetic page and independent anon/editor sessions, test full draft→preview→publish→restore and HTTP/crawler behavior.

| Feature | Task status | Local finding / remaining work |
|---|---|---|
| Homepage rendering | In Progress | Existing homepage is separate from builder publication; existing route must remain intact. |
| Header | In Progress | Existing shared header renders; global CMS control not established. |
| Footer | In Progress | Existing shared footer renders; global CMS control not established. |
| Dynamic pages | Testing | Opt-in /p/:slug supports only a strict 13-block published profile and is off by default. |
| Page templates | In Progress | Builder structures exist; production template governance not completed. |
| Product pages | In Progress | Existing public route exists; backend parity and published product data unverified. |
| Category pages | In Progress | Shop taxonomy/filter routes exist; full dynamic category pages unverified. |
| Blog pages | In Progress | Public blog routes exist; source/publishing behavior depends on mode. |
| Service pages | In Progress | Public service routes exist; source/publishing behavior depends on mode. |
| Project pages | In Progress | Portfolio projections and routes exist; staged privacy review required. |
| Public navigation | In Progress | Header links exist; managed menu publishing is not established. |
| Preview URLs | In Progress | /lab is not certified published-only; /p is staging-only and browser noindex is insufficient. |
| Published page data | Testing | Local SQL and demo tests check published snapshots; props/theme are publicly exposed. |
| Cache invalidation | Not Started | No verified open-tab/cache invalidation on publish or unpublish. |
| Responsive rendering | In Progress | Responsive CSS exists; all builder blocks/devices not tested. |
| Controlled draft→preview→publish→restore | Blocked | Local sub-tests exist; complete real-host end-to-end scenario not authorized or run. |

## B5 Media library
**Evidence:** `src/admin/pages/Media.tsx; src/api/{supabase,demo/db,bagisto/admin}.ts`  
**Priority:** P1  
**Required verification:** Test synthetic files and storage roles, usage references and reload across isolated staging.

| Feature | Task status | Local finding / remaining work |
|---|---|---|
| Upload | In Progress | UI and adapter operations exist; hosted storage and file validation not certified. |
| Multiple uploads | In Progress | Media interface needs full safe-file browser regression. |
| Search | In Progress | UI and query support exist; backend results unverified. |
| Filter | In Progress | Folder/query filtering exists; persistence differs by adapter. |
| Preview | In Progress | UI preview exists; MIME and untrusted asset security unverified. |
| Replace | In Progress | Asset reference update across every content type not proven. |
| Crop | Not Started | Complete crop-to-persist workflow not demonstrated. |
| Rename | In Progress | Name metadata update exists; asset link behavior unverified. |
| Delete | In Progress | Deletion path exists; reference safety and hosted storage cleanup unverified. |
| Alt text | In Progress | Metadata field exists; propagation and accessibility coverage unverified. |
| Folders | In Progress | Metadata folder support exists; policies and storage semantics need test. |
| Storage management | Blocked | Hosted bucket configuration/grants/quotas and secure file policy unknown. |
| Asset usage tracking | Not Started | No comprehensive reference index/deletion guard demonstrated. |

## B6 Product management
**Evidence:** `src/admin/pages/{Products,ProductEdit,Taxonomy}.tsx; src/pages/{Shop,ProductDetail}.tsx; src/api`  
**Priority:** P1  
**Required verification:** Use synthetic product variants, media and statuses; check real approved backend and public catalogue consistency.

| Feature | Task status | Local finding / remaining work |
|---|---|---|
| Product CRUD | In Progress | Admin UI and adapters exist; full hosted parity and safe deletion unverified. |
| Categories | In Progress | Taxonomy CRUD exists; public category source and backend mapping unverified. |
| Subcategories | In Progress | Product/category data exists; live relationships and restrictions unverified. |
| SKUs | In Progress | SKU fields/generation exist; global uniqueness and integrations unverified. |
| Variants | In Progress | Option selections and variant display exist; authoritative variant stock unverified. |
| Dimensions | In Progress | Product dimension fields exist; validation and public consistency unverified. |
| Materials | In Progress | Taxonomy and product attributes exist; end-to-end mapping unverified. |
| Finishes | In Progress | Option fields exist; per-variant persistence/availability unverified. |
| Colours | In Progress | Options and cart attributes exist; source consistency unverified. |
| Product images | In Progress | Image fields and catalogue assets exist; correct hosted media references unverified. |
| Pricing | In Progress | Admin price/trade display exists; server-authoritative price and currency unverified. |
| Stock | In Progress | Inventory quantities and controls exist; real concurrent transactions unverified. |
| Product specifications | In Progress | Spec fields exist; public rendering and validation unverified. |
| Related products | In Progress | Storefront product code exists; relationship source and correctness unverified. |
| Product SEO | In Progress | SEO/schema components exist; actual published HTML and crawler output unverified. |
| Product publishing | In Progress | Product status exists; storefront source and draft isolation need independent test. |

## B7 Commerce
**Evidence:** `src/pages/{Shop,Checkout}.tsx; src/contexts/CartContext.tsx; src/api`  
**Priority:** P1  
**Required verification:** Use isolated staging with synthetic identity, stock and orders; prove retries, payment state and reversal.

| Feature | Task status | Local finding / remaining work |
|---|---|---|
| Product catalogue | In Progress | Shop and product routes exist; hosted source completeness unverified. |
| Search | In Progress | Shop search exists; backend behavior and all product states unverified. |
| Filters | In Progress | Category and product filters exist; backend consistency unverified. |
| Cart | Testing | Browser cart and local safeguards exist; not a synchronized server cart. |
| Cart persistence | Testing | LocalStorage cart persists; multi-tab atomicity and storage failure recovery incomplete. |
| Checkout | Testing | Unknown-outcome warning and cart mitigation are local; no reliable server idempotency. |
| Customer registration | Not Started | No public customer account route found. |
| Orders | In Progress | Order adapters and admin views exist; real transaction and provider semantics unverified. |
| Payment records | In Progress | Invoice payment entries exist; settlement/provider evidence unavailable. |
| Order status | In Progress | Status controls and mapping exist; enforced production transitions not established. |
| Invoices | In Progress | Invoice UI and RPC paths exist; accounting/legal validation unverified. |
| Returns | In Progress | RMA UI/data exists; Bagisto unsupported and financial reversal unverified. |
| Exchanges | In Progress | Exchange UI/data exists; Bagisto unsupported and integrated settlement unverified. |

## B8 Quotations
**Evidence:** `src/pages/Quotation.tsx; src/admin/pages/{Quotes,Quote}.tsx; supabase/migrations/20261108000016_quote_acceptance_gate.sql`  
**Priority:** P1  
**Required verification:** Synthetic enquiry→structured quote→revision→independent approval→concurrent conversion with identity and stock checks.

| Feature | Task status | Local finding / remaining work |
|---|---|---|
| Quote requests | Testing | Text summary and v2 bounded capture implemented locally; structured request not complete. |
| Product selection | In Progress | Quote basket and admin quote lines exist; authoritative structured intake missing. |
| Custom dimensions | In Progress | Product configuration exists; complete request-to-quote structured persistence unverified. |
| Material options | In Progress | Options/variant labels exist; structured quote linkage unverified. |
| File attachments | Not Started | No complete safe quote-attachment intake workflow demonstrated. |
| Quote creation | In Progress | Admin quote creation exists; real provider and identity transaction unverified. |
| Quote editing | In Progress | Editable quote lines and totals exist; accepted prices are not frozen. |
| Discounts | In Progress | Quote discount computations exist; approval and server integrity need staging. |
| Delivery costs | In Progress | Shipping fields exist; owner-approved pricing and server confirmation needed. |
| PDF generation | In Progress | Printable quote route exists; reliable PDF generation/export not certified. |
| Quote revisions | In Progress | Versions and audit data exist; full revision restore/approval not proven. |
| Customer approval | Not Started | Staff-editable accepted status is not independent customer approval. |
| Quote-to-order conversion | Testing | Local accepted-state SQL lock test passes; independent concurrent staging and identity binding pending. |

## B9 CRM
**Evidence:** `src/admin/pages/{Leads,Clients,Customers,Tasks}.tsx; src/api/supabase.ts`  
**Priority:** P1  
**Required verification:** Exercise synthetic CRM identity matching, links and concurrent conversions on approved staging.

| Feature | Task status | Local finding / remaining work |
|---|---|---|
| Lead creation | Testing | Contact/quote/chat intake local v2 path exists; hosting and retention unverified. |
| Customer profiles | In Progress | Customers and Clients views exist; no unified master identity demonstrated. |
| Lead assignments | In Progress | Assignee fields and filters exist; permissions and real staff identity unverified. |
| Lead statuses | In Progress | Status board exists; hosted transition rules need testing. |
| Follow-ups | In Progress | Next action fields and task model exist; reminders not established. |
| Tasks | In Progress | Admin task list and links exist; real assignment and reliability unverified. |
| Customer history | In Progress | Some links and order events exist; full lifecycle timeline missing. |
| Conversation history | In Progress | Demo inbox exists; hosted conversations unavailable in Supabase adapter. |
| Customer conversion | In Progress | Site-visit path can create client but linking is best-effort and not atomic. |
| Sales pipeline | In Progress | Lead status board and quote state exist; end-to-end conversion incomplete. |
| Reporting | In Progress | Sample analytics and CRM data exist; full reconciled pipeline reporting missing. |

## B10 AI sales agent
**Evidence:** `supabase/functions/ai-agent/{index.ts,handler.mjs}; src/components/chat; docs/08-master-plan/PHASE1-AI-USAGE.md`  
**Priority:** P2  
**Required verification:** Keep hosted AI disabled until approved; test server grounding, privacy, quotas, provider budget and adversarial cases on staging.

| Feature | Task status | Local finding / remaining work |
|---|---|---|
| Chat interface | In Progress | Demo chat UI exists; hosted AI customer interface not proven. |
| Agent configuration | In Progress | Local environment quota settings exist; managed safe agent settings incomplete. |
| Knowledge base | Not Started | No trusted versioned customer-facing grounding store established. |
| Product information retrieval | Not Started | Trusted product retrieval and citation validation not demonstrated. |
| Product recommendations | Not Started | Accurate real-catalogue recommendations not established. |
| Lead qualification | In Progress | Offline chat can create leads; validated AI qualification flow missing. |
| CRM integration | In Progress | Some lead/chat references exist; grounded secure agent workflow incomplete. |
| Conversation storage | Blocked | Supabase live conversation methods are unwired in inspected adapter. |
| Human handover | In Progress | Demo conversation flows exist; hosted handover not verified. |
| Staff assignment | In Progress | Lead assignments exist; secure AI-to-staff handoff unverified. |
| Notifications | In Progress | Admin bell exists; actual agent handover notifications unverified. |
| Agent feedback | Not Started | No complete evaluated staff feedback loop established. |

## B11 Live chat and WhatsApp
**Evidence:** `src/components/chat; src/admin/pages/ChatInbox.tsx; src/api/supabase.ts; src/config/site.ts`  
**Priority:** P2  
**Required verification:** Use approved staging/provider sandbox and synthetic identities; verify auth, delivery, consent and isolation.

| Feature | Task status | Local finding / remaining work |
|---|---|---|
| Customer chat | In Progress | Demo thread works; hosted Supabase live chat is unsupported. |
| Admin inbox | In Progress | Demo inbox exists; hosted persistence not wired in Supabase adapter. |
| Conversation assignment | In Progress | Demo workflows exist; staff permissions and hosted state unverified. |
| Message persistence | Blocked | Supabase list/get return empty/undefined and message calls are unsupported. |
| Read states | In Progress | Demo unread counts exist; durable hosted state unverified. |
| Human handover | In Progress | Demo UI exists; cross-agent routing and real behavior unverified. |
| WhatsApp provider | Blocked | Outbound wa.me links only; no verified provider integration. |
| Webhook processing | Blocked | Authenticated inbound provider contract and webhook not demonstrated. |
| Notification delivery | Blocked | No verified external delivery pipeline/provider credentials or approval. |

## B12 Booking and appointments
**Evidence:** `src/admin/pages/Leads.tsx; src/api/supabase.ts site-visit methods`  
**Priority:** P2  
**Required verification:** Test isolated real database concurrent slots and synthetic staff schedules, reminders, cancellation and rollback.

| Feature | Task status | Local finding / remaining work |
|---|---|---|
| Appointment creation | In Progress | Lead meeting fields and site visits exist; booking system incomplete. |
| Calendar | Not Started | Complete staffed calendar not demonstrated. |
| Staff availability | Not Started | No authoritative availability service demonstrated. |
| Time slots | Not Started | No booking slot lifecycle demonstrated. |
| Site visits | In Progress | Creation and lead/client link code exists; atomicity and reminders incomplete. |
| Consultations | In Progress | Meeting field exists; standalone consultation workflow unverified. |
| Rescheduling | In Progress | Site visit update exists; conflicting schedules and notifications unverified. |
| Cancellation | In Progress | Visit status model exists; reservation release/notifications unverified. |
| Notifications | Not Started | Reliable appointment reminder flow not demonstrated. |
| Double-booking protection | Not Started | No independent concurrent database reservation proof. |

## B13 Blog and services
**Evidence:** `src/admin/pages/{Blog,Services}.tsx; src/pages/{Blog,BlogPost,Services,ServiceDetail}.tsx`  
**Priority:** P2  
**Required verification:** Use synthetic drafts on isolated staging; verify public SEO, publication state, media and backend parity.

| Feature | Task status | Local finding / remaining work |
|---|---|---|
| Blog CRUD | In Progress | Admin and public views exist; full backend permission/publish behavior unverified. |
| Blog categories | In Progress | Some blog metadata exists; dedicated managed category lifecycle not established. |
| Tags | In Progress | Metadata and filtering need end-to-end verification. |
| Featured images | In Progress | Image fields exist; storage and public references unverified. |
| Authors | In Progress | Article metadata exists; author identity/source unverified. |
| Blog SEO | In Progress | Article JSON-LD exists; actual published HTML/canonical behavior unverified. |
| Blog publishing | In Progress | Status controls exist; full public source and draft access unverified. |
| Services CRUD | In Progress | Admin and public service code exists; backend parity unverified. |
| Service templates | In Progress | Service routes/template rendering exist; reusable CMS template behavior unverified. |
| Public routes | In Progress | Public routes are defined; hosted responses and indexing not verified. |

## B14 Projects and virtual showroom
**Evidence:** `src/admin/pages/{Projects,VirtualShowroom}.tsx; src/pages/{Projects,ProjectDetail,VirtualShowroom}.tsx`  
**Priority:** P2  
**Required verification:** Verify public-only projections, visualizations and enquiry linkage with synthetic records.

| Feature | Task status | Local finding / remaining work |
|---|---|---|
| Portfolio projects | Testing | Published portfolio projection local tests pass; hosted access and content review remain. |
| Project galleries | In Progress | Project media fields/rendering exist; public reference and permission tests pending. |
| Before/after images | In Progress | No fully verified content-to-public comparison workflow demonstrated. |
| Project categories | In Progress | Project categorization data exists; filtering and backend behavior unverified. |
| Virtual showroom | In Progress | Room configurator exists; full operational workflow not certified. |
| Product visualization | In Progress | Local visual assets/configurator exist; actual product-backed accuracy unverified. |
| Product customization | In Progress | Variant options exist; cart/quote persistence and pricing unverified. |
| Enquiry integration | In Progress | Enquiry pages exist; complete showroom configuration-to-lead structure missing. |

## B15 Inventory and purchasing
**Evidence:** `src/admin/pages/{Inventory,Suppliers,PurchaseOrders,Transfers,Returns}.tsx; docs/08-master-plan/PHASE1-PROCUREMENT-READS.md`  
**Priority:** P1  
**Required verification:** Role matrix plus synthetic real-Postgres concurrent stock, PO receipt, transfer, return and audit reconciliation.

| Feature | Task status | Local finding / remaining work |
|---|---|---|
| Stock | In Progress | Inventory records and adjustments exist; independent transaction and source-of-truth not verified. |
| Stock movements | In Progress | Movement model/RPC exist; real permission and ledger reconciliation pending. |
| Suppliers | Testing | Local PGlite capability matrix passes; owner exposure review and hosted verification pending. |
| Purchase orders | In Progress | PO UI/receipts exist; real supplier, stock and cost reconciliation unverified. |
| Transfers | In Progress | Transfer data and UI exist; warehouse/concurrency semantics unverified. |
| Returns | In Progress | Returns model exists; financial and stock reversal correctness unverified. |
| Reorder alerts | In Progress | Low-stock list/bell exists; partial datasets and threshold mismatches remain. |
| Stock adjustment history | In Progress | Movement history exists; complete actor audit and retention unverified. |

## B16 Projects and production
**Evidence:** `src/admin/pages/{Projects,ProjectPracticeDialog,Claims}.tsx; src/api/types.ts`  
**Priority:** P2  
**Required verification:** Prove synthetic linked project, immutable approval and server-enforced production/QC/delivery/warranty transitions.

| Feature | Task status | Local finding / remaining work |
|---|---|---|
| Project creation | In Progress | Portfolio/project data exists; end-to-end order→job linkage unverified. |
| Design versions | In Progress | Practice file/BOQ concepts exist; controlled design versions unverified. |
| Client approvals | Not Started | No independently authenticated version-bound customer design acceptance demonstrated. |
| Measurements | In Progress | Project/design data exists; full survey-to-job measurement validation unverified. |
| Production stages | In Progress | Five-stage model exists in `project.practice.production`. The local workspace guards save/close races (25/25 synthetic), repairs partial/legacy payloads instead of crashing (15/15), and candidate 00022 gives revision-checked saves plus an append-only audit trail (60/60 PGlite). No enforced stage-transition workflow, and nothing is deployed. |
| QC | In Progress | Local candidates 00021/00022 block dispatch unless a `passed` inspection is recorded; the pass is derived server-side from an identity-stamped inspection row and every change is audited (50/50 PGlite). Separation of duties is enforced in the candidates: whoever last changed the production stages cannot record the pass (another `page.manage` holder must, and the same person may still record a failure). Records are not immutable at the database-owner level, single-staff sites need a second capability holder, and nothing is deployed. |
| Order → production job | Testing | Local candidate 00024 links one order to one job (`projects.order_id`, unique per order), blocks cancelled orders and re-pointing, audits link/unlink, and projects progress/QC onto the order (32/32 PGlite, 16/16 browser). Dispatch still does not change the order status and nothing is deployed. |
| Delivery | Testing | Local candidate 00025 records the delivery and installation handover after a QC pass and stored dispatch details (one each per job, no future dates, audit rows), and the projects workspace shows both (37/37 PGlite, 17/17 browser). No proof photos/signature capture, no scheduling and dispatch still does not move the order status; nothing is deployed. |
| Installation | Not Started | Complete scheduling, execution and confirmation workflow not demonstrated. |
| Warranty | Testing | Local candidate 00025 adds a per-job warranty (months, coverage, exclusions, dates from the installation, `none/active/expired/cancelled` derived server-side) with an audited cancel, and 00026 adds claims against a live warranty with explicit transitions, a resolution note and an audit trail (30/30 PGlite, 16/16 browser). Candidate 00027 adds a read-only register (`/admin/warranty-register`) with derived states, days left, expiring-soon flags and open-claim counts (16/16 PGlite, 14/14 browser). No claim cost/replacement decision, no reminders/SLA, no inventory movement, no customer portal, and nothing is deployed. |

## B17 Finance
**Evidence:** `src/admin/pages/{Invoices,Invoice,Quotes,Returns}.tsx; supabase/migrations/20261107000001_agency_os_convergence.sql`  
**Priority:** P1  
**Required verification:** Finance owner approves definitions; reconcile synthetic ledger with approved payment sandbox and reversals.

| Feature | Task status | Local finding / remaining work |
|---|---|---|
| Quotations | In Progress | Quotes and totals exist; commercial approval/pricing controls incomplete. |
| Invoices | In Progress | Invoices and printable documents exist; authoritative financial ledger unverified. |
| Payments | In Progress | Manual payment recording exists; no real settlement verified. |
| Advance payments | In Progress | Advance percentage display exists; payment receipt/reconciliation not established. |
| Partial payments | In Progress | Payment RPC exists; concurrency and external settlement unverified. |
| Outstanding balances | In Progress | Invoice balances exist; dashboard counts invoices rather than receivables amount. |
| Refunds | In Progress | Return statuses and amounts exist; real payment reversal not verified. |
| Financial reports | In Progress | Order-sample analytics exists; accounting-grade statements absent. |

## B18 SEO
**Evidence:** `src/components/{RouteHead,JsonLd}.tsx; scripts/generate-sitemap.ts; public/{robots.txt,sitemap.xml}`  
**Priority:** P2  
**Required verification:** Measure staging initial HTTP HTML, canonical/schema/indexability, actual dynamic content and sitemap/redirects.

| Feature | Task status | Local finding / remaining work |
|---|---|---|
| Page titles | In Progress | Route/document title code exists; SSR and crawler output unverified. |
| Meta descriptions | In Progress | Meta code and editor SEO fields exist; actual initial HTML unverified. |
| Canonical URLs | In Progress | RouteHead uses configured origin; owner must confirm deployed host. |
| Sitemap | In Progress | Seed-generated sitemap exists; authoritative published dynamic data not covered. |
| Robots.txt | In Progress | Static robots file exists; staging isolation/indexing settings unverified. |
| Structured data | In Progress | JSON-LD helpers exist; real crawler and schema validation pending. |
| Product schema | In Progress | Product JSON-LD code and prior demo smoke exist; live-source integrity unverified. |
| Blog schema | In Progress | Article JSON-LD code and prior demo smoke exist; hosted output unverified. |
| Image alt text | In Progress | Alt fields exist; complete coverage/manual audit pending. |
| Redirects | Not Started | Dedicated managed redirect lifecycle and URL migration strategy not demonstrated. |
| Search indexing | Blocked | Search engine/live host evidence not accessed; requires owner authorization. |

## B19 Settings and security
**Evidence:** `src/admin/auth.tsx; supabase/migrations; supabase/config.toml; docs/08-master-plan/PHASE1-STAGING-RELEASE-CHECKLIST.md`  
**Priority:** P0  
**Required verification:** Independent sessions and direct APIs against explicitly authorized isolated staging; security review and rollback exercise.

| Feature | Task status | Local finding / remaining work |
|---|---|---|
| Authentication | Testing | Local Supabase UI identity guard mocked; demo is not authorization and hosted Auth unverified. |
| Roles | Testing | Local capability tests pass; actual roles and revocation unverified. |
| Permissions | Testing | Local role matrices cover selected surfaces; complete hosted grant inventory remains. |
| RLS | Testing | Selected local PGlite policies pass; hosted additional permissive policies may widen access. |
| Storage security | Blocked | Hosted bucket policies, MIME enforcement, signed URLs and actual data not inspected. |
| API security | In Progress | Local public intake bounds and strict mode exist; default legacy fail-open and abuse controls remain. |
| User management | Not Started | Full approved staff lifecycle, offboarding and admin UI not demonstrated. |
| Activity logs | In Progress | Some order events and quote audit exist; unified immutable logs absent. |
| Integrations | Blocked | Provider credentials/contracts/production environment and approval are unavailable. |
| Backup procedures | Blocked | Verified hosted backup and restore rehearsal not performed. |

## Explicitly required integrated regression sequences

1. CMS create/edit/draft/preview/publish/restore: local components tested separately; hosted full journey **Blocked** pending isolated staging and protection against draft leaks.
2. Product/variant/media publish to public storefront: **In Progress**, not verified end-to-end with a real backend.
3. Cart/checkout/order/payment: **In Progress**, demo and mocked safety checks only; real settlement and retry concurrency **Blocked**.
4. Quote/approval/conversion: **Testing** locally; independent customer approval and real transaction concurrency not established.
5. CRM lead/assignment/follow-up/customer conversion: **In Progress**; atomic canonical links and duplicate handling not proven.
6. AI retrieval/lead/handover: **Blocked**, keep hosted AI disabled.
7. Production approval/QC/delivery/installation: **In Progress**, authoritative linked lifecycle not proven.
8. SEO published initial HTML/crawler output: **Blocked** on approved isolated hosting.
9. Direct API/RLS/storage matrix: **Testing** locally only; actual hosted policies **Blocked**.
