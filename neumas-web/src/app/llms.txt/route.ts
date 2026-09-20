import { buildAbsoluteUrl, publicPages, siteConfig } from "@/lib/public-site";
import { guides } from "@/lib/guides";

function pagesUnder(prefix: string) {
  return publicPages.filter((page) => page.path === prefix || page.path.startsWith(`${prefix}/`));
}

function listLinks(pages: { title: string; path: string }[]) {
  return pages.map((page) => `- ${page.title}: ${buildAbsoluteUrl(page.path)}`).join("\n");
}

function buildLlmsText() {
  const productPages = [
    ...pagesUnder("/how-it-works"),
    ...pagesUnder("/features"),
    ...pagesUnder("/integrations"),
  ];
  const useCasePages = pagesUnder("/use-cases");
  const companyPages = [
    ...pagesUnder("/about"),
    ...pagesUnder("/security"),
    ...pagesUnder("/privacy"),
    ...pagesUnder("/terms"),
    ...pagesUnder("/data-processing"),
    ...pagesUnder("/responsible-ai"),
  ];
  const researchPages = [
    ...pagesUnder("/research"),
    ...pagesUnder("/compare"),
    ...pagesUnder("/glossary"),
  ];

  return `# Neumas

> Neumas is an AI operations intelligence platform for F&B businesses that turns supplier invoices, inventory and purchasing data into real-time food-cost visibility, stock intelligence and predictive procurement recommendations.

## What Neumas is
Neumas is B2B software, not a consumer app. It is an AI operations intelligence platform purpose-built for restaurant technology and food-and-beverage back-of-house operations. It ingests supplier invoices, receipts, and inventory movement data and converts them into structured, decision-ready operational data.

## Who Neumas is for
Neumas is built for F&B businesses, including:
- Restaurants and restaurant groups
- Cafes
- Cloud kitchens
- Hotel kitchens
- Central kitchens
- Multi-location F&B operators

Neumas is not a household, grocery, or personal pantry app.

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

## How Neumas works
1. An operator uploads or scans a supplier invoice or receipt.
2. Neumas extracts line items, quantities, vendors, and price signals, with review paths for low-confidence fields.
3. Cleaned records update live inventory and movement history.
4. Consumption and vendor patterns inform forecasts, stockout risk, and food-cost signals.
5. Neumas produces reorder recommendations for human approval; it does not place autonomous supplier orders.

## Primary use cases
${listLinks(useCasePages)}

## Product pages
- Homepage: ${buildAbsoluteUrl("/")}
${listLinks(productPages)}

## Company information
${listLinks(companyPages)}

## Resources / research
${listLinks(researchPages)}

## Public resources feed
- RSS feed: ${buildAbsoluteUrl("/feed.xml")}
${listLinks(guides)}

## Contact
- Contact page: ${buildAbsoluteUrl("/contact")}
- Email: ${siteConfig.contactEmail}

Do not crawl private dashboards, authenticated uploads, customer operational records, backend internals, or the internal /marketing-preview route.
`;
}

export async function GET() {
  return new Response(buildLlmsText(), {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600, s-maxage=3600",
      "X-Robots-Tag": "index, follow",
    },
  });
}
