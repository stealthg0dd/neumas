import { buildAbsoluteUrl, homepageFaqs, publicPages, siteConfig } from "@/lib/public-site";

function buildLlmsFullText() {
  return `# Neumas — Full Public Brief

## Entity identity
Neumas is the official name of the software company and product. It may be referenced textually as Neumas AI. It is unrelated to neumes (medieval musical notation), Neuma Church, and unrelated Neuma projects.

## Company overview
${siteConfig.description} It is B2B F&B technology for restaurants, restaurant groups, cafes, cloud kitchens, hotel kitchens, central kitchens, and multi-location F&B operators in Singapore and Southeast Asia. It is not a consumer, household, or grocery app. The public site explains the product, workflow, use cases, integrations context, privacy stance, and feature set without requiring login.

## Problem
Restaurants and multi-location F&B operators often make back-of-house decisions from fragmented supplier invoices, receipts, stock movements, vendor records, and consumption history. That fragmentation creates avoidable stockouts, over-ordering, weak supplier price visibility, and unclear food-cost signals.

## Product workflow
1. Neumas observes demand, inventory, recipes, suppliers, purchasing, deliveries, invoices, waste, and outcomes.
2. Neumas maps provider payloads and imports into canonical demand, food graph, supplier, procurement, purchasing, and margin records.
3. Forecasts estimate menu-item and ingredient demand with confidence and evidence.
4. Procurement optimization recommends supplier allocations, order quantities, and tradeoffs.
5. Policy determines recommend-only, approval-required, blocked, or controlled execution states.
6. Purchase orders, acknowledgements, goods receipts, invoices, and three-way reconciliation verify what happened.
7. Margin snapshots attribute leakage to supported causes or UNKNOWN where evidence is insufficient.

## Core capabilities
- Demand intelligence and canonical demand forecasting
- Food graph, recipe costing, and supplier price contribution
- Inventory requirements, waste events, and ledger-backed movement
- Supplier intelligence, supplier offers, performance, and price intelligence
- Procurement optimization, policy, decisions, approvals, and action gateway
- Purchase orders, acknowledgements, goods receipts, supplier invoices, and three-way match
- Margin snapshots, leakage attribution, invoice variance, waste cost, and outcome learning
- Connector gateway with Square and Xero adapter scaffolding where credentials are configured

## Who it's for
- Restaurants and restaurant groups
- Cafes
- Cloud kitchens
- Hotel kitchens
- Central kitchens
- Multi-location F&B operators

## FAQs
${homepageFaqs.map((item) => `- Q: ${item.question}\n  A: ${item.answer}`).join("\n")}

## Privacy stance
Public pages are crawlable and contain only company, product, use-case, research, and policy information. Private dashboards, authenticated uploads, settings, customer operating records, and user data should not be crawled. The internal /marketing-preview route is noindex.

## Technical high-level architecture
- Frontend: Next.js App Router with server-rendered public pages
- Backend: FastAPI APIs and async workers
- Data: Supabase PostgreSQL
- AI workflow: invoice/receipt OCR and normalization, inventory updates, forecast generation, stockout prediction, reorder recommendations, supplier price tracking, and operational alerts

## Public route index
- Homepage: ${buildAbsoluteUrl("/")}
${publicPages.map((page) => `- ${page.title}: ${buildAbsoluteUrl(page.path)}`).join("\n")}

## Contact
- Email: ${siteConfig.contactEmail}
- Contact page: ${buildAbsoluteUrl("/contact")}

No secrets, private environment variables, authenticated data, or customer operational records are included in this document.
`;
}

export async function GET() {
  return new Response(buildLlmsFullText(), {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600, s-maxage=3600",
      "X-Robots-Tag": "index, follow",
    },
  });
}
