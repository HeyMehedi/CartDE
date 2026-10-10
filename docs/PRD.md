# CartDE — Product Requirements Document (PRD)

| | |
| --- | --- |
| Status | Draft v0.1 |
| Date | 2026-10-10 |
| Owner | CartDE project owner |
| Companion documents | [SRS.md](SRS.md), [DEVELOPMENT_PLAN.md](DEVELOPMENT_PLAN.md) |

## 1. Overview

CartDE (Cart Digital Engine) is an open-source commerce platform that a developer deploys to their own Cloudflare account and a small merchant runs from a web dashboard. The first release is a single-store online shop with cash-on-delivery (COD) checkout and manual order management.

Positioning: **"Open-source commerce. Your store. Your infrastructure. AI-ready."**

CartDE is built on [EmDash CMS](https://github.com/emdash-cms/emdash) (MIT, version 1.2.0 as of 2026-10-10) and Astro, running on Cloudflare Workers with D1 for data and R2 for media. EmDash supplies the admin shell, authentication, media library, content pages, site settings and an MCP server. CartDE adds the commerce engine: catalogue, inventory, cart, checkout, orders and the storefront.

CartDE is not a hosted service. There are no subscriptions, paid tiers or transaction fees in the initial product. The long-term aim is one store that can be operated through a dashboard, a CLI, APIs and AI agents, all using the same validated business operations.

**Document status.** First draft, written before any code exists. The repository was empty on 2026-10-10. Requirements marked P0 define the first usable store. P1 and P2 are planned but not committed to a date.

## 2. Problem statement

Small sellers in Bangladesh, especially those selling through Facebook pages, run their businesses from Messenger threads, WhatsApp, phone calls and handwritten or spreadsheet order lists. They typically lack:

- a website of their own with professional product pages;
- a structured catalogue with prices, variants and photos in one place;
- reliable stock tracking, so they oversell or forget what is left;
- a single order list with status, delivery details and history;
- an orderly checkout that captures name, phone and delivery address correctly;
- any practical way to manage the business with AI assistants.

Existing platforms are expensive relative to local margins, complex to set up, or tie the merchant's data and store to a central SaaS provider. CartDE lets a merchant own and run a store on accessible infrastructure. A developer deploys it from a public GitHub repository into a Cloudflare account with minimal manual configuration, and the result is a working storefront plus a merchant dashboard, not just a static site.

## 3. Goals and non-goals

### Goals for the first usable release (0.3)

1. A shopper can open the store on a phone, browse products, choose a variant, add to cart and place a COD order in under two minutes.
2. A merchant can create and publish a product with images, variants, prices and stock from the dashboard without touching code.
3. Every order is persisted with a snapshot of what was bought and where it ships, and stock cannot be oversold by concurrent checkouts.
4. A merchant can find an order, confirm or cancel it, mark it shipped and delivered, and see the full history of changes.
5. The storefront is responsive, accessible and indexable by search engines.

### Goals for the deployable release (0.4)

6. A new user can deploy CartDE to their own Cloudflare account from the GitHub repository and complete first-run setup without editing source code.
7. Setup is idempotent and secure: no default admin password, no unauthenticated reset endpoint, no duplicate administrators on retry.

### Goals for the AI-ready release (0.5)

8. An authorised AI client can query products and orders and create drafts through MCP tools that enforce the same validation and permissions as the dashboard.

### Non-goals (for releases 0.1 to 0.6)

- A hosted multi-tenant CartDE service, subdomains such as `shop.cartde.com`, billing or plans.
- Online payment gateways (bKash, Nagad, SSLCommerz, Stripe). COD validates the order engine first.
- Courier, WhatsApp or Facebook inbox integrations.
- A visual drag-and-drop theme editor.
- Multiple staff accounts with granular commerce roles (the owner account is the merchant in these releases).
- Mandatory AI. The store must work without any model API key.

## 4. Users and personas

| Persona | Who they are | What they need | Success looks like |
| --- | --- | --- | --- |
| Merchant owner | A Facebook seller in Bangladesh, often on a phone, comfortable with Facebook but not with servers | A catalogue, order list and stock they can trust; simple status changes; a link to share | Receives and fulfils COD orders from the dashboard daily without help |
| Developer / deployer | A freelancer or agency developer setting up stores for clients | One-click deployment, clear docs, a codebase they can extend and theme | Deploys a store in one sitting and hands it over configured |
| Shopper | A customer arriving from a Facebook post or search, on a mobile device | Fast pages, clear prices in BDT, size/colour choice, a short checkout with phone and address | Places an order and gets a confirmation with an order number |
| AI operator (0.5+) | The merchant or developer using an AI assistant (Claude, an IDE agent) connected over MCP | Safe tools to search products, list orders, draft products and update stock | The assistant does routine work without bypassing permissions |
| Contributor | An open-source developer | Clear architecture, tests, contribution guide, stable extension points | Lands a focused pull request without breaking the commerce core |

## 5. Core user journeys

### 5.1 Deploy and set up a store (0.4)

1. The developer opens the CartDE GitHub repository and clicks "Deploy to Cloudflare".
2. Cloudflare clones the repository into the developer's GitHub account, provisions the D1 database and R2 bucket named in the Wrangler configuration, prompts for the secrets listed in `.env.example`, builds and deploys the Worker.
3. The developer opens the Worker URL. CartDE detects incomplete setup and shows the first-run wizard.
4. The owner creates the first administrator account (passkey or a configured login provider; no password is ever pre-set).
5. The owner enters store name, currency, locale, contact phone and delivery charge.
6. The storefront is live at the Worker URL. Retrying any step does not duplicate data.

### 5.2 Publish a product (0.2)

1. The merchant opens Products and clicks New product.
2. They enter a name, description, category, and upload one or more images.
3. They add options (for example Size: S, M, L) and set price and stock per variant, or use a single default variant.
4. They save as draft, preview the public page, then publish.
5. The product appears in listings, category pages and search within seconds.

### 5.3 Place a COD order (0.3)

1. The shopper opens the storefront from a Facebook link on a phone.
2. They open a product, pick a variant, and add it to the cart.
3. At checkout they enter name, mobile number, district/area, address and an optional note.
4. They review the subtotal, delivery charge and total in BDT and confirm the order.
5. CartDE validates the input, checks and reserves stock atomically, creates the order with snapshots and shows an order number and confirmation page.
6. A second submission of the same form does not create a second order.

### 5.4 Manage an order (0.3)

1. The merchant sees the new order on the Overview and in Orders, filtered to Pending.
2. They open it, check the items and delivery details, and phone the customer if needed.
3. They confirm the order (or cancel it, which restores stock).
4. After dispatch they mark it Shipped, and after collection of cash, Delivered.
5. Every change is recorded with who made it and when. Invalid changes (for example Delivered straight from Pending) are rejected.

## 6. Functional requirements

Priority: P0 = required for the release named; P1 = planned next; P2 = later. Release shows where the requirement is scheduled in the Development Plan.

### 6.1 Storefront

| ID | Requirement | Priority | Release |
| --- | --- | --- | --- |
| PR-SF-1 | Homepage showing store name, logo, featured products and navigation | P0 | 0.1 (brand), 0.3 (products) |
| PR-SF-2 | Product listing page with pagination and category filter | P0 | 0.3 |
| PR-SF-3 | Product detail page with images, description, variant selector, price, stock state | P0 | 0.3 |
| PR-SF-4 | Category pages | P0 | 0.3 |
| PR-SF-5 | Cart page with quantity changes and removal | P0 | 0.3 |
| PR-SF-6 | Checkout form for COD with validation of name, mobile number, district/area and address | P0 | 0.3 |
| PR-SF-7 | Order confirmation page with order number | P0 | 0.3 |
| PR-SF-8 | Content pages (About, Delivery policy, Contact) managed in EmDash | P0 | 0.1 (reused) |
| PR-SF-9 | Responsive layout, mobile first | P0 | 0.1 onward |
| PR-SF-10 | Search-engine friendly titles, descriptions, canonical URLs, Open Graph, product structured data | P0 | 0.3 |
| PR-SF-11 | Useful empty and error states (no products, out of stock, checkout failure) | P0 | 0.3 |
| PR-SF-12 | Storefront search | P1 | 0.6 |
| PR-SF-13 | Bengali and English storefront strings | P1 | 0.6 |

### 6.2 Catalogue and inventory

| ID | Requirement | Priority | Release |
| --- | --- | --- | --- |
| PR-CAT-1 | Create, edit, archive products with name, slug, description, status, SEO fields | P0 | 0.2 |
| PR-CAT-2 | Upload and order product images through the EmDash media library (R2) | P0 | 0.2 |
| PR-CAT-3 | Categories with name, slug, description, sort order; a product may belong to several | P0 | 0.2 |
| PR-CAT-4 | Options and variants (for example size, colour) with per-variant SKU, price, compare-at price, stock | P0 | 0.2 |
| PR-CAT-5 | Prices stored and calculated as integer minor units in the store currency (BDT by default) | P0 | 0.2 |
| PR-CAT-6 | Stock quantity per variant with manual adjustment and an inventory event log | P0 | 0.2 |
| PR-CAT-7 | Publish and unpublish products; drafts never appear on the storefront | P0 | 0.2 |
| PR-CAT-8 | Preview the public product page from the editor | P0 | 0.2 |
| PR-CAT-9 | Low-stock threshold per store and low-stock list | P1 | 0.5 |
| PR-CAT-10 | CSV import of products | P1 | 0.5 |
| PR-CAT-11 | Discount codes | P2 | after 0.6 |

### 6.3 Orders and customers

| ID | Requirement | Priority | Release |
| --- | --- | --- | --- |
| PR-ORD-1 | Create an order from checkout with snapshots of items, prices, customer and shipping address | P0 | 0.3 |
| PR-ORD-2 | Human-friendly sequential order numbers | P0 | 0.3 |
| PR-ORD-3 | Atomic stock reservation; concurrent checkouts cannot oversell | P0 | 0.3 |
| PR-ORD-4 | Duplicate-submission protection (idempotency key per checkout attempt) | P0 | 0.3 |
| PR-ORD-5 | Orders list with search by order number, phone and name, and filter by status | P0 | 0.3 |
| PR-ORD-6 | Order detail with items, totals, customer, address, note, history | P0 | 0.3 |
| PR-ORD-7 | Documented status transitions: pending, confirmed, shipped, delivered, cancelled, returned | P0 | 0.3 |
| PR-ORD-8 | Cancellation and return restore stock; the merchant can opt out of restock on return | P0 | 0.3 |
| PR-ORD-9 | Printable or copyable order summary for the courier | P1 | 0.3 |
| PR-ORD-10 | Customers list derived from orders (name, phone, order count), with order history | P1 | 0.3 |
| PR-ORD-11 | Payment status for COD: unpaid until delivered, then paid | P0 | 0.3 |

### 6.4 Admin dashboard

| ID | Requirement | Priority | Release |
| --- | --- | --- | --- |
| PR-ADM-1 | Sidebar navigation: Overview, Products, Orders, Customers, Storefront, Settings | P0 | 0.3 |
| PR-ADM-2 | Overview with recent orders, orders awaiting action, product counts, computed from real data | P0 | 0.3 |
| PR-ADM-3 | Searchable, paginated product and order tables | P0 | 0.3 |
| PR-ADM-4 | Only authenticated administrators can reach admin pages and APIs (server-side checks) | P0 | 0.2 |
| PR-ADM-5 | Store settings: name, logo, currency, locale, time zone, contact, delivery charge | P0 | 0.2 (data), 0.4 (wizard) |
| PR-ADM-6 | Sales summary (orders and revenue by day for the last 7 and 30 days) | P1 | 0.5 |
| PR-ADM-7 | Audit log of administrative mutations | P1 | 0.5 |
| PR-ADM-8 | Multiple staff accounts with commerce roles | P2 | after 0.6 |

### 6.5 Setup and deployment

| ID | Requirement | Priority | Release |
| --- | --- | --- | --- |
| PR-DEP-1 | Local development with one command after install | P0 | 0.1 |
| PR-DEP-2 | Deploy with Wrangler using the committed configuration; D1 and R2 created on first deploy | P0 | 0.1 |
| PR-DEP-3 | "Deploy to Cloudflare" button in the README that works from a clean account | P0 | 0.4 |
| PR-DEP-4 | Database migrations run automatically and safely on deploy | P0 | 0.2 (local), 0.4 (automated) |
| PR-DEP-5 | First-run setup wizard: first administrator, store settings; idempotent; resumable | P0 | 0.4 |
| PR-DEP-6 | No default credentials; no unauthenticated initialise or reset endpoint | P0 | 0.4 |
| PR-DEP-7 | Documented secrets, backup, restore and troubleshooting | P0 | 0.4 |
| PR-DEP-8 | CLI (`cartde create`, `dev`, `deploy`, `migrate`, `doctor`, `export`) | P2 | after 0.6 |

### 6.6 Themes and AI

| ID | Requirement | Priority | Release |
| --- | --- | --- | --- |
| PR-THM-1 | One well-designed default theme with configurable name, logo, colours, typography, footer and SEO defaults stored as validated settings | P0 | 0.3 (base), 0.6 (settings) |
| PR-THM-2 | Content separated from presentation so a theme change never touches products or orders | P0 | 0.6 |
| PR-THM-3 | Additional themes and presets | P2 | after 0.6 |
| PR-AI-1 | Typed commerce operations shared by dashboard and MCP | P0 | 0.5 |
| PR-AI-2 | Read-only MCP tools: search products, list orders, get order, sales summary | P0 | 0.5 |
| PR-AI-3 | Draft and permission-aware mutation tools: create product draft, update inventory, update order status with confirmation | P1 | 0.5 |
| PR-AI-4 | AI provider optional and configurable; no key required for store operation | P0 | 0.5 |

## 7. Non-functional requirements

| Area | Requirement |
| --- | --- |
| Security | Server-side authorisation on every admin page and API; input validation on all untrusted input; CSRF protection on state-changing requests; secure session cookies; no secrets in git, bundles or docs; upload size and type limits; no sensitive data in logs or error messages |
| Correctness | Exact money arithmetic in integer minor units; atomic stock changes; documented order state machine; idempotent checkout and setup |
| Performance | Storefront pages server-rendered at the edge; product and listing pages under 1.5 s Largest Contentful Paint on a mid-range phone over 4G as a target; images served responsive and optimised |
| Accessibility | Semantic HTML, labelled forms, keyboard navigation, visible focus, sufficient contrast on storefront and admin |
| Mobile | All storefront and admin pages usable at 360 px width |
| SEO | Unique titles and descriptions, canonical URLs, sitemap, robots, product structured data |
| Localisation | BDT currency formatting, Asia/Dhaka time zone, Bangladesh mobile number validation; UI strings externalised for a later Bengali translation |
| Data ownership | The merchant can export products, orders and customers as CSV or JSON; media stays in the merchant's R2 bucket |
| Cost | Runs on the Cloudflare Workers free plan by default; sandboxed plugins (paid Worker Loader) stay off; documented limits for D1, R2 and Images |
| Reliability | Redeploys never lose data; migrations are forward-only and versioned; backup and restore procedure documented and tested |
| Maintainability | TypeScript throughout, tests for domain logic and database operations, CI on every pull request, documentation updated with every behaviour change |

## 8. Release scope and milestones

Each milestone is complete only when its acceptance criterion is verified by running it, not by inspection.

1. **0.1 Foundation.** Scaffolded EmDash project branded as CartDE, documentation, CI, baseline deployed. *Acceptance:* the project builds reproducibly, admin login and media upload work locally and on Cloudflare.
2. **0.2 Commerce core.** Schema and migrations for store, categories, products, options, variants, inventory; product CRUD and media; validation; inventory adjustments; tests. *Acceptance:* a merchant creates and publishes a product and the storefront reads it reliably.
3. **0.3 COD order journey.** Listing and detail pages, cart, checkout, order creation with snapshots and atomic stock, order dashboard, documented transitions. *Acceptance:* a real test COD order is placed from a phone and managed to Delivered in the admin.
4. **0.4 Deployment experience.** Deploy button, automated migrations, first-run wizard, secure first admin, secrets and recovery docs, tested from a clean account. *Acceptance:* a new user deploys and initialises a working store without editing source.
5. **0.5 AI-ready commerce.** Typed commerce API, MCP tools (read-only first, then drafts), audit log, permission tests. *Acceptance:* an authorised AI client queries the store without bypassing business rules.
6. **0.6 Extensions and themes.** Theme settings system, extension interfaces, compatibility rules. *Acceptance:* themes and extensions evolve without uncontrolled changes to the commerce core.

Later possibilities (not promised): payment gateways, courier integrations, spreadsheet and image imports, advanced inventory, staff roles, more themes, CLI, alternative hosting, an optional hosted service.

## 9. Success metrics

Project metrics:

- A developer unfamiliar with the code deploys a store from the README in under 30 minutes (0.4).
- Build, typecheck and tests pass on every merged pull request.
- Zero known routes where admin data is reachable without authentication.

Store metrics (measured from the store's own data, never fabricated):

- Time from product creation to live page under 1 minute.
- Checkout completion without validation errors on first attempt for a test group of shoppers.
- No overselling incidents under a concurrent checkout test.

## 10. Risks, assumptions and open questions

**Risks**

- EmDash reached 1.0 on 2026-09-28 and is releasing quickly; APIs may change. Mitigation: pin versions, upgrade deliberately with the changelog.
- After a fresh deploy, the first visitor to complete the EmDash setup wizard becomes administrator. Mitigation: setup immediately after deploy, document it, and evaluate a setup token in 0.4.
- EmDash login is passkey-first with no password option; some merchants may find passkeys unfamiliar. Mitigation: document passkeys; offer magic-link login where email is configured.
- D1 has no interactive multi-statement transactions; atomicity relies on batched statements and conditional updates. Mitigation: design stock reservation around conditional `UPDATE … WHERE stock >= qty` in a batch and test it.
- Two admin surfaces (EmDash admin for content and media, CartDE admin for commerce) until navigation is integrated. Mitigation: cross-link both; integrate via a native EmDash plugin in 0.6.

**Assumptions**

- Default currency BDT, locale en-BD with Bengali later, time zone Asia/Dhaka.
- The owner account created in setup is the only merchant user in releases 0.1 to 0.6.
- The GitHub repository will be public (required by the deploy button).

**Open questions for the owner**

1. License: MIT (matches EmDash and Astro) or Apache-2.0 (adds an explicit patent grant)? Recommendation: MIT.
2. GitHub organisation and repository name.
3. Worker, database and bucket names for the baseline deployment (proposed: `cartde`, `cartde-db`, `cartde-media`).
4. Should product descriptions be plain Markdown (simplest) or EmDash Portable Text (rich editor, more coupling)? Recommendation: Markdown for 0.2, revisit in 0.6.
5. Delivery charge model for the first release: single flat charge, or inside/outside Dhaka? Recommendation: two zones (inside Dhaka, outside Dhaka) configured in settings.
