import { buildAbsoluteUrl, publicRouteIndex } from "@/lib/public-site";

function buildLlmsText() {
  const publicPages = [{ href: "/", label: "Homepage" }, ...publicRouteIndex];

  return `# Neumas

Neumas is an AI operations platform for F&B teams.

## Product description
Neumas turns invoices, receipts, inventory movements, vendor records, and consumption history into cleaner stock records, forecasts, reorder plans, vendor intelligence, cost signals, and operational alerts for restaurants, cafes, cloud kitchens, multi-location F&B operators, and hospitality teams.

## Main public pages
${publicPages.map((page) => `- ${page.label}: ${buildAbsoluteUrl(page.href)}`).join("\n")}

## Use cases
- Restaurants
- Cafes and bakeries
- Cloud kitchens
- Hawker and quick-service operators
- Multi-location F&B groups
- Hospitality and F&B teams

## Key features
- Receipt and invoice processing
- Inventory intelligence
- Forecasts
- Reorder planning
- Vendor intelligence
- Operational alerts
- Multi-location visibility

## Public docs
- How it works: ${buildAbsoluteUrl("/how-it-works")}
- Security: ${buildAbsoluteUrl("/security")}

## Contact and policy links
- Contact: ${buildAbsoluteUrl("/contact")}
- Privacy: ${buildAbsoluteUrl("/privacy")}
- Security: ${buildAbsoluteUrl("/security")}
- Terms: ${buildAbsoluteUrl("/terms")}

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
