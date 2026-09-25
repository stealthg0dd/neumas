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
    ...pagesUnder("/autonomous-procurement"),
    ...pagesUnder("/restaurant-procurement-software"),
    ...pagesUnder("/food-cost-management"),
    ...pagesUnder("/restaurant-inventory-management"),
    ...pagesUnder("/supplier-management"),
    ...pagesUnder("/purchase-order-automation"),
    ...pagesUnder("/invoice-reconciliation"),
    ...pagesUnder("/restaurant-demand-forecasting"),
    ...pagesUnder("/recipe-costing"),
    ...pagesUnder("/food-waste-management"),
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

> ${siteConfig.description}

## Entity identity
Neumas is the official name of the software company and product. Neumas AI is a useful alternate textual reference. It is unrelated to neumes (medieval musical notation), Neuma Church, and unrelated Neuma projects.

## What Neumas is
Neumas is B2B software, not a consumer app. It is an autonomous procurement and margin-control platform for food and beverage operators. It connects demand, inventory, recipes, suppliers, purchasing, deliveries, and invoices to reduce food cost, waste, and purchasing leakage.

## Who Neumas is for
Neumas is built for F&B businesses, including:
- Restaurants and restaurant groups
- Cafes
- Cloud kitchens
- Hotel kitchens
- Central kitchens
- Multi-location F&B operators
- Catering and hospitality F&B teams

Neumas is not a household, grocery, or personal pantry app.

## Core capabilities
- Demand intelligence and ingredient forecasting
- Food graph, recipe costing, and supplier price contribution
- Procurement optimization with policy, approval, and decision evidence
- Purchase orders, acknowledgements, receiving, supplier invoices, and three-way match
- Margin snapshots, leakage attribution, waste events, and outcome learning
- Connector gateway for provider payloads, raw events, canonical mapping, and domain services

## How Neumas works
1. Neumas observes demand, inventory, recipes, supplier terms, purchases, deliveries, invoices, and waste.
2. Neumas understands canonical ingredients, recipe versions, supplier items, supplier prices, and current stock.
3. Neumas predicts demand and ingredient requirements with confidence and evidence.
4. Neumas recommends supplier allocations, purchase quantities, and exception actions.
5. Policy determines whether a decision is recommend-only, approval-required, blocked, or eligible for controlled execution.
6. Purchase orders, receiving, invoice reconciliation, verification, and outcomes create a durable trace.
7. External provider writes are only enabled through real configured adapters and the action gateway.

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
