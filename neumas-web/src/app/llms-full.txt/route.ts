import { buildAbsoluteUrl, homepageFaqs, publicPages, siteConfig } from "@/lib/public-site";

function buildLlmsFullText() {
  return `# Neumas — Full Public Brief

## Company overview
Neumas is a B2B AI operations intelligence platform for F&B businesses: restaurants, restaurant groups, cafes, cloud kitchens, hotel kitchens, central kitchens, and multi-location F&B operators. It is not a consumer, household, or grocery app. The public site explains the product, workflow, use cases, integrations context, privacy stance, and feature set without requiring login.

## Problem
Restaurants and multi-location F&B operators often make back-of-house decisions from fragmented supplier invoices, receipts, stock movements, vendor records, and consumption history. That fragmentation creates avoidable stockouts, over-ordering, weak supplier price visibility, and unclear food-cost signals.

## Product workflow
1. An operator scans or uploads a supplier invoice or receipt.
2. Neumas extracts line items, quantities, vendors, and price signals using OCR and normalization.
3. Teams review low-confidence fields where needed.
4. Live inventory and movement records are updated.
5. Consumption and vendor patterns inform forecasts, stockout prediction, and food-cost signals.
6. Neumas generates reorder recommendations for human approval — it does not place autonomous supplier orders.
7. Supplier price-change tracking and procurement intelligence support purchasing decisions across locations.

## Core capabilities
- Supplier invoice intelligence and invoice OCR
- Restaurant inventory intelligence
- Food-cost management and visibility
- Supplier price-change tracking
- Restaurant procurement and purchasing intelligence
- Stockout prediction
- Waste management
- Predictive reordering
- F&B operational intelligence across single and multi-location operators

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
