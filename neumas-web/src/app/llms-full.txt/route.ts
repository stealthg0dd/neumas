import { buildAbsoluteUrl, homepageFaqs, publicPages, siteConfig } from "@/lib/public-site";

function buildLlmsFullText() {
  return `# Neumas Full Public Brief

## Company overview
Neumas is an AI operations platform for F&B teams in Singapore and Southeast Asia. The public site explains the product, workflow, use cases, integrations context, privacy stance, and feature set without requiring login.

## Problem
Restaurants, cafes, cloud kitchens, and multi-location F&B operators often make back-of-house decisions from fragmented invoices, receipts, stock movements, vendor records, and consumption history. That creates avoidable shortages, over-order risk, weak vendor visibility, and unclear cost signals.

## Product workflow
1. An operator scans or uploads an invoice or receipt.
2. Neumas extracts line items, quantities, vendors, and price signals.
3. Teams review low-confidence fields where needed.
4. Live inventory and movement records are updated.
5. Consumption patterns inform forecasts and shortage or over-order risk.
6. Neumas generates reorder recommendations for approval.
7. Vendor intelligence and cost signals support operational decisions.

## Features
- Receipt and invoice processing
- Inventory intelligence
- Forecasts
- Reorder planning
- Vendor intelligence
- Operational alerts
- Multi-location visibility

## Personas
- Restaurants
- Cafes and bakeries
- Cloud kitchens
- Hawker and quick-service operators
- Multi-location F&B groups
- Hospitality and F&B teams

## FAQs
${homepageFaqs.map((item) => `- Q: ${item.question}\n  A: ${item.answer}`).join("\n")}

## Privacy stance
Public pages are crawlable and contain only company, product, use-case, research, and policy information. Private dashboards, authenticated uploads, settings, customer operating records, and user data should not be crawled. The internal /marketing-preview route is noindex.

## Technical high-level architecture
- Frontend: Next.js App Router with server-rendered public pages
- Backend: FastAPI APIs and async workers
- Data: Supabase PostgreSQL
- AI workflow: receipt and invoice extraction, normalization, inventory updates, forecast generation, reorder recommendations, vendor intelligence, and operational alerts

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
