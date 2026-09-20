# Semrush SEO Cleanup Record

## Scope

Semrush findings treated as the cleanup baseline:

- Missing public parent routes: `/compare`, `/features`, `/research`, `/solutions`, and `/use-cases`.
- 19 public pages with broken internal links.
- Homepage structured-data validation error.
- Overlong guide title elements.

`/auth` and `/pilot` remain intentionally `noindex, follow`; they are not indexable content defects.

## Before and after

| Check | Before | After (local production build) |
| --- | --- | --- |
| Public hub routes | Five reported 4xx destinations | Five indexable `200` hub routes |
| Rendered internal link errors | Semrush reported 19 affected pages | 0 rendered same-origin links returning `4xx` or `5xx` |
| Canonical indexable sitemap entries | 37 | 42 |
| Homepage JSON-LD | Included `SoftwareApplication` markup that could not satisfy the relevant validation requirements | Five parseable blocks: `Organization`, `WebSite`, `WebPage`, `BreadcrumbList`, and `FAQPage` |
| Guide title elements | Long inventory and food-cost titles | 51 and 34 characters respectively |

## Singapore Restaurant Inventory Content

**Commercial page:** `/solutions/restaurant-inventory-management`

- Primary keyword: restaurant inventory management software Singapore
- Secondary keywords: restaurant inventory software, F&B inventory management, restaurant inventory management software
- Intent: evaluate an operational inventory system for a Singapore F&B business
- Title: Restaurant Inventory Management Software Singapore
- H1: Restaurant inventory management for Singapore F&B teams.
- Internal links: invoice intelligence, food cost control, procurement intelligence, predictive reordering

**Educational page:** `/guides/restaurant-inventory-management`

- Primary keyword: Restaurant Inventory Management in Singapore
- Secondary keywords: inventory management for restaurants, restaurant stock management, food inventory management, restaurant inventory best practices
- Intent: learn the operating workflow and evaluate implementation readiness
- Title: Restaurant Inventory Management Guide for Singapore
- H1: Restaurant Inventory Management
- Internal links: restaurant inventory management, invoice intelligence, food cost control, procurement intelligence, predictive reordering

No external citations were added because the revised content makes no external statistical, regulatory, integration, or market claims. Product statements remain constrained to existing, supportable public capabilities.

## Verification

- `pnpm tsc --noEmit`
- `pnpm run lint`
- `pnpm run test` (62 passed)
- `pnpm run build`
- `pnpm run seo:audit` (42 canonical indexable pages, zero rendered internal error responses)
- Rendered homepage JSON-LD parse/assertion

Production crawl and Semrush recrawl should be rerun after deployment; third-party crawl reporting is not instantaneous.
