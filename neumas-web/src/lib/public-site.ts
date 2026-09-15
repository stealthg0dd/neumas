import type { Metadata } from "next";

import { getCanonicalAppUrl } from "@/lib/app-url";

export type PublicLink = {
  href: string;
  label: string;
};

export type PublicSection = {
  title: string;
  body: string;
  bullets?: string[];
};

export type PublicFaq = {
  question: string;
  answer: string;
};

export type PublicPageContent = {
  path: string;
  title: string;
  description: string;
  h1: string;
  eyebrow: string;
  intro: string;
  keywords: string[];
  sections: PublicSection[];
  faq?: PublicFaq[];
  ctaTitle?: string;
  ctaBody?: string;
  relatedLinks: PublicLink[];
};

export type JsonLd = Record<string, unknown>;

export const siteConfig = {
  name: "Neumas",
  url: getCanonicalAppUrl(),
  description:
    "AI operations for F&B teams. Neumas turns invoices, receipts, inventory movements, and consumption history into cleaner stock records, forecasts, reorder plans, vendor intelligence, and operational alerts.",
  contactEmail: "info@neumas.ai",
  companyName: "Neumas",
  region: "Singapore and Southeast Asia",
  ogImagePath: "/opengraph-image",
};

export const homepageFaqs: PublicFaq[] = [
  {
    question: "What is Neumas?",
    answer:
      "Neumas is an AI operations platform for F&B teams. It turns invoices, receipts, inventory movements, vendors, and consumption history into inventory intelligence, forecasts, reorder plans, cost signals, and operational alerts.",
  },
  {
    question: "Who is Neumas built for?",
    answer:
      "Neumas is built for restaurants, cafes, cloud kitchens, hawker and quick-service operators, multi-location F&B groups, and hospitality teams that need cleaner back-of-house operating data.",
  },
  {
    question: "Does Neumas automatically place supplier orders?",
    answer:
      "No. Neumas supports reorder recommendations and approval workflows. Public materials should not describe the product as universal autonomous purchasing.",
  },
  {
    question: "Are private dashboards and operational records public?",
    answer:
      "No. Public pages describe the company and product. Authenticated dashboards, uploads, inventory records, and customer data remain private and should not be crawled.",
  },
];

const defaultRelatedLinks: PublicLink[] = [
  { href: "/how-it-works", label: "How it works" },
  { href: "/about", label: "About Neumas" },
  { href: "/security", label: "Security" },
  { href: "/contact", label: "Contact" },
];

const b2bPublicPages: PublicPageContent[] = [
  {
    path: "/about",
    title: "About Neumas",
    description:
      "Learn why Neumas is building AI operations intelligence for restaurants, cafes, cloud kitchens, and multi-location F&B teams.",
    h1: "Built around the decisions F&B teams make every day.",
    eyebrow: "About",
    intro:
      "Neumas exists to help F&B teams turn messy operating inputs into cleaner decisions. Invoices, receipts, stock movements, vendor records, and consumption history become a practical layer of inventory intelligence, forecasts, reorder planning, and operational alerts.",
    keywords: ["about Neumas", "AI operations for F&B", "restaurant operations software"],
    sections: [
      {
        title: "Why Neumas exists",
        body:
          "Back-of-house teams often make decisions from fragmented records: supplier invoices in one place, inventory adjustments in another, purchasing history in memory, and outlet health scattered across spreadsheets. Neumas gives those signals a shared operating layer so teams can see what changed, what needs attention, and what to order next.",
      },
      {
        title: "Who we serve",
        body:
          "Neumas is built for restaurants, cafes, bakeries, cloud kitchens, hawker and quick-service operators, hospitality F&B teams, and multi-outlet groups. Public pages should describe these operators clearly and should not position Neumas as a consumer pantry or shopping-list product.",
      },
      {
        title: "How we make claims",
        body:
          "Neumas uses measured product metrics where available, labels benchmarks as benchmarks, and keeps projected outcomes qualified. Public claims should describe decision support, not unsupported autonomous purchasing, unverified native apps, or guaranteed waste reduction.",
      },
    ],
    relatedLinks: [
      { href: "/how-it-works", label: "How Neumas works" },
      { href: "/features/inventory-intelligence", label: "Inventory intelligence" },
      { href: "/use-cases/restaurants", label: "Restaurants" },
      ...defaultRelatedLinks,
    ],
  },
  {
    path: "/how-it-works",
    title: "How Neumas Works",
    description:
      "See how Neumas turns receipts, invoices, inventory movements, and consumption history into forecasts, reorder recommendations, vendor signals, and alerts.",
    h1: "From receipt to reorder.",
    eyebrow: "How it works",
    intro:
      "Neumas starts with the documents and operational signals F&B teams already handle. The platform extracts line items, updates live inventory, detects usage patterns, forecasts risk, and recommends reorder plans for review.",
    keywords: ["receipt to reorder", "restaurant reorder planning", "F&B operations workflow"],
    sections: [
      {
        title: "Scan invoice or receipt",
        body:
          "Operators upload or scan invoices and receipts so purchasing and consumption signals can enter the system without rebuilding the workflow from scratch.",
      },
      {
        title: "Review extracted line items",
        body:
          "Neumas structures item names, quantities, vendors, and price signals, with review paths where extraction confidence or business context needs an operator decision.",
      },
      {
        title: "Update inventory intelligence",
        body:
          "Cleaned records feed inventory visibility, movement history, shortage risk, over-order risk, reorder recommendations, and vendor intelligence across outlets.",
      },
    ],
    faq: homepageFaqs,
    relatedLinks: [
      { href: "/features/receipt-invoice-processing", label: "Receipt and invoice processing" },
      { href: "/features/reorder-planning", label: "Reorder planning" },
      ...defaultRelatedLinks,
    ],
  },
  {
    path: "/features/receipt-invoice-processing",
    title: "Receipt and Invoice Processing",
    description:
      "Neumas extracts F&B invoices and receipts into structured line-item data for inventory, vendor, and reorder workflows.",
    h1: "Turn receipts and invoices into operating data.",
    eyebrow: "Feature",
    intro:
      "Receipt and invoice processing is the ingestion layer for Neumas. It converts supplier documents and operator uploads into structured records that can support stock updates, vendor analysis, cost signals, and forecast inputs.",
    keywords: ["invoice processing F&B", "restaurant receipt processing", "line item extraction"],
    sections: [
      {
        title: "Line-item extraction",
        body:
          "Neumas extracts item names, units, quantities, vendor context, and price signals so teams can spend less time reconstructing orders manually.",
      },
      {
        title: "Review before action",
        body:
          "The workflow supports review where needed. Public positioning should describe decision support and operator approval rather than unqualified hands-off automation.",
      },
    ],
    relatedLinks: [
      { href: "/features/inventory-intelligence", label: "Inventory intelligence" },
      { href: "/how-it-works", label: "How it works" },
      ...defaultRelatedLinks,
    ],
  },
  {
    path: "/features/inventory-intelligence",
    title: "Inventory Intelligence",
    description:
      "Neumas helps F&B teams understand stock levels, inventory movement, low-stock risk, inventory value, and outlet health.",
    h1: "Know what you have. Before it costs you.",
    eyebrow: "Feature",
    intro:
      "Inventory intelligence gives F&B teams a cleaner view of stock levels, movements, value, and risk across everyday operations. It connects receipt and invoice data with inventory workflows so decisions are grounded in fresher records.",
    keywords: ["F&B inventory intelligence", "restaurant inventory software", "stock level visibility"],
    sections: [
      {
        title: "Live stock context",
        body:
          "Teams can track stock levels, inventory movement, low-stock risk, and inventory value by outlet or group view without relying only on memory or disconnected sheets.",
      },
      {
        title: "Operational alerts",
        body:
          "Neumas surfaces alerts for shortage risk, over-order risk, cost movement, and operational follow-up so teams can act before small inventory issues become expensive.",
      },
    ],
    relatedLinks: [
      { href: "/features/reorder-planning", label: "Reorder planning" },
      { href: "/features/multi-location-operations", label: "Multi-location operations" },
      ...defaultRelatedLinks,
    ],
  },
  {
    path: "/features/reorder-planning",
    title: "Forecasts and Reorder Planning",
    description:
      "Neumas uses consumption history and inventory signals to support forecasts, shortage risk detection, and reorder recommendations for F&B teams.",
    h1: "Know what you will need next.",
    eyebrow: "Feature",
    intro:
      "Neumas helps operators move from reactive ordering to forecast-informed planning. The system identifies usage patterns, highlights shortage and over-order risk, and generates reorder recommendations for approval.",
    keywords: ["restaurant forecasting", "F&B reorder planning", "predictive purchasing"],
    sections: [
      {
        title: "Forecast-informed planning",
        body:
          "Consumption history, stock movement, and recent activity feed reorder recommendations and risk signals. Public pages should not claim universal automatic supplier ordering unless the product evidence supports it.",
      },
      {
        title: "Approval workflow",
        body:
          "Recommendations are designed for operator review and approval so teams stay in control while benefiting from cleaner signals.",
      },
    ],
    relatedLinks: [
      { href: "/features/vendor-intelligence", label: "Vendor intelligence" },
      { href: "/how-it-works", label: "How it works" },
      ...defaultRelatedLinks,
    ],
  },
  {
    path: "/features/vendor-intelligence",
    title: "Vendor Intelligence",
    description:
      "Neumas helps F&B teams understand vendors, spend, price movement, comparisons, alerts, and reorder history.",
    h1: "Know your suppliers as well as your kitchen.",
    eyebrow: "Feature",
    intro:
      "Vendor intelligence connects supplier records, spend patterns, price movement, reorder history, and alerts so F&B teams can make purchasing decisions with more context.",
    keywords: ["vendor intelligence F&B", "restaurant supplier analytics", "supplier price movement"],
    sections: [
      {
        title: "Supplier context",
        body:
          "Teams can review vendor directories, spend, price movement, comparisons, alerts, and reorder history using product-supported operating data.",
      },
      {
        title: "Cost signals",
        body:
          "Vendor and item movement can expose cost pressure and ordering patterns. Neumas presents these as decision-support signals, not guaranteed savings claims.",
      },
    ],
    relatedLinks: [
      { href: "/features/reorder-planning", label: "Reorder planning" },
      { href: "/features/inventory-intelligence", label: "Inventory intelligence" },
      ...defaultRelatedLinks,
    ],
  },
  {
    path: "/features/multi-location-operations",
    title: "Multi-location Operations",
    description:
      "Neumas gives F&B groups a shared view of organization, outlets, inventory, alerts, and group-level operating health.",
    h1: "One dashboard. Every outlet.",
    eyebrow: "Feature",
    intro:
      "Multi-location operators need a shared view of outlet health without inventing fake customer locations or hiding operational reality. Neumas supports group-level visibility across organization, properties, outlets, inventory, alerts, and roll-ups.",
    keywords: ["multi-location F&B operations", "restaurant group inventory", "outlet health dashboard"],
    sections: [
      {
        title: "Outlet visibility",
        body:
          "Neumas helps teams compare stock, alerts, and operating signals across outlets using demo or product data rather than unsupported customer claims.",
      },
      {
        title: "Group-level roll-up",
        body:
          "Leadership can review group-level patterns while operators keep the detailed workflows needed for day-to-day action.",
      },
    ],
    relatedLinks: [
      { href: "/use-cases/multi-outlet-groups", label: "Multi-outlet groups" },
      { href: "/features/inventory-intelligence", label: "Inventory intelligence" },
      ...defaultRelatedLinks,
    ],
  },
  {
    path: "/use-cases/restaurants",
    title: "Neumas for Restaurants",
    description:
      "AI operations intelligence for restaurants that need cleaner stock records, ordering plans, vendor signals, and cost visibility.",
    h1: "Restaurant operations, with cleaner signals.",
    eyebrow: "Use case",
    intro:
      "Restaurants can use Neumas to connect invoices, receipts, stock movement, vendors, and consumption history into a more reliable operating picture for purchasing and inventory decisions.",
    keywords: ["restaurant inventory software", "restaurant operations AI", "restaurant reorder planning"],
    sections: [
      {
        title: "Inventory decisions",
        body:
          "Kitchen and operations teams can see stock risk, usage patterns, and reorder context before shortages or over-ordering create pressure.",
      },
      {
        title: "Vendor and cost visibility",
        body:
          "Supplier records, price movement, and reorder history help teams evaluate purchasing decisions with more context.",
      },
    ],
    relatedLinks: [
      { href: "/features/inventory-intelligence", label: "Inventory intelligence" },
      { href: "/features/vendor-intelligence", label: "Vendor intelligence" },
      ...defaultRelatedLinks,
    ],
  },
  {
    path: "/use-cases/cafes-bakeries",
    title: "Neumas for Cafes and Bakeries",
    description:
      "Inventory, forecast, and reorder planning support for cafes and bakeries managing fast-moving ingredients and daily production rhythms.",
    h1: "Stay ahead of fast-moving ingredients.",
    eyebrow: "Use case",
    intro:
      "Cafes and bakeries depend on daily production rhythms, ingredient freshness, and practical stock planning. Neumas helps convert operating records into clearer inventory, forecast, and reorder signals.",
    keywords: ["cafe inventory software", "bakery inventory planning", "F&B forecasting"],
    sections: [
      {
        title: "Short-cycle planning",
        body:
          "Teams can monitor ingredients, movement, and shortage risk where small misses can quickly affect service.",
      },
      {
        title: "Waste and cost context",
        body:
          "Neumas keeps waste and food-cost language qualified, including projected waste-reduction potential and benchmark opportunities rather than guaranteed outcomes.",
      },
    ],
    relatedLinks: [
      { href: "/features/reorder-planning", label: "Reorder planning" },
      { href: "/features/inventory-intelligence", label: "Inventory intelligence" },
      ...defaultRelatedLinks,
    ],
  },
  {
    path: "/use-cases/cloud-kitchens",
    title: "Neumas for Cloud Kitchens",
    description:
      "Operational intelligence for cloud kitchens that need visibility across stock, forecasts, vendors, reorder plans, and alerts.",
    h1: "Keep cloud kitchen decisions connected.",
    eyebrow: "Use case",
    intro:
      "Cloud kitchens need fast operating visibility across menus, outlets, vendors, and inventory movement. Neumas supports the back-of-house intelligence layer behind those decisions.",
    keywords: ["cloud kitchen inventory", "cloud kitchen operations", "F&B operational alerts"],
    sections: [
      {
        title: "Forecast and reorder context",
        body:
          "Usage patterns and stock movement can feed reorder recommendations for review, reducing reliance on scattered manual assumptions.",
      },
      {
        title: "Multi-outlet readiness",
        body:
          "Cloud kitchen groups can use shared operating views to understand outlet health and group-level risk.",
      },
    ],
    relatedLinks: [
      { href: "/features/multi-location-operations", label: "Multi-location operations" },
      { href: "/features/reorder-planning", label: "Reorder planning" },
      ...defaultRelatedLinks,
    ],
  },
  {
    path: "/use-cases/multi-outlet-groups",
    title: "Neumas for Multi-outlet F&B Groups",
    description:
      "A shared operating view for F&B groups managing multiple restaurants, cafes, outlets, or hospitality properties.",
    h1: "One operating layer for every outlet.",
    eyebrow: "Use case",
    intro:
      "Multi-outlet F&B groups need cleaner roll-ups without losing the local detail operators rely on. Neumas connects outlet inventory, alerts, vendors, and reorder context into one operating view.",
    keywords: ["multi-outlet restaurant software", "F&B group operations", "outlet inventory visibility"],
    sections: [
      {
        title: "Group visibility",
        body:
          "Leadership can review outlet health, inventory, alerts, and cost signals without fabricating customer locations or unsupported case studies.",
      },
      {
        title: "Operator workflow",
        body:
          "Operators keep a practical receipt-to-reorder workflow while the group gets cleaner visibility into what is happening across properties.",
      },
    ],
    relatedLinks: [
      { href: "/features/multi-location-operations", label: "Multi-location operations" },
      { href: "/how-it-works", label: "How it works" },
      ...defaultRelatedLinks,
    ],
  },
  {
    path: "/integrations",
    title: "F&B Ecosystem Integrations",
    description:
      "Neumas integration context for F&B operations, including StoreHub and Qashier where appropriate.",
    h1: "Connect your F&B stack.",
    eyebrow: "Integrations",
    intro:
      "Neumas presents StoreHub and Qashier only in an integration context. Public materials should not label them as customers, proof logos, pilots, or endorsements unless separate evidence supports that claim.",
    keywords: ["StoreHub integration", "Qashier integration", "F&B integrations"],
    sections: [
      {
        title: "Integration context",
        body:
          "F&B teams often operate across POS, receipts, invoices, vendor records, and inventory workflows. Neumas positions integrations as operating context, not as unsupported customer proof.",
        bullets: ["StoreHub", "Qashier"],
      },
      {
        title: "Scope discipline",
        body:
          "Public pages should not invent unsupported POS, accounting, or supplier connectors. New integration claims should be added only when the product and go-to-market evidence support them.",
      },
    ],
    relatedLinks: [
      { href: "/features/vendor-intelligence", label: "Vendor intelligence" },
      { href: "/contact", label: "Contact" },
      ...defaultRelatedLinks,
    ],
  },
  {
    path: "/research/restaurant-inventory-operations",
    title: "Restaurant Inventory Operations Research",
    description:
      "A public research brief on why restaurant and F&B inventory operations need cleaner receipt, invoice, forecast, reorder, and vendor signals.",
    h1: "F&B inventory operations need cleaner signals.",
    eyebrow: "Research",
    intro:
      "Restaurant inventory work is a system of repeated decisions. Neumas research pages frame the operating problem around receipts, invoices, inventory movement, vendor records, forecasts, reorder planning, and multi-location visibility.",
    keywords: ["restaurant inventory operations", "F&B inventory research", "restaurant operations intelligence"],
    sections: [
      {
        title: "The operating gap",
        body:
          "Many F&B teams know what was ordered and what feels low, but the connective tissue between purchase, movement, usage, and reorder planning is fragmented.",
      },
      {
        title: "Where AI helps",
        body:
          "AI can support extraction, normalization, pattern detection, forecasting, and alerting when outputs remain reviewable and grounded in operating data.",
      },
    ],
    relatedLinks: [
      { href: "/features/inventory-intelligence", label: "Inventory intelligence" },
      { href: "/how-it-works", label: "How Neumas works" },
      ...defaultRelatedLinks,
    ],
  },
  {
    path: "/research/receipt-to-reorder",
    title: "Receipt-to-Reorder Workflow",
    description:
      "A public research page explaining the receipt-to-reorder workflow for F&B teams using Neumas.",
    h1: "From receipt capture to reorder decisions.",
    eyebrow: "Research",
    intro:
      "The receipt-to-reorder workflow turns operational documents and inventory movement into reorder recommendations, vendor context, and alerts for F&B teams.",
    keywords: ["receipt to reorder", "invoice to inventory", "AI reorder workflow"],
    sections: [
      {
        title: "Capture and review",
        body:
          "Invoices and receipts provide the starting signal. Extracted line items become useful only when teams can review ambiguity and preserve trust in the operating record.",
      },
      {
        title: "Forecast and recommend",
        body:
          "Consumption patterns and inventory movement support shortage forecasting, over-order risk detection, and reorder recommendations for approval.",
      },
    ],
    relatedLinks: [
      { href: "/how-it-works", label: "How it works" },
      { href: "/features/reorder-planning", label: "Reorder planning" },
      ...defaultRelatedLinks,
    ],
  },
  {
    path: "/research/food-cost-benchmark",
    title: "Food-cost Optimization Benchmark",
    description:
      "How Neumas frames the 6-10% food-cost optimization opportunity as a benchmark, not a guaranteed customer outcome.",
    h1: "A benchmark for cost opportunity, not a universal promise.",
    eyebrow: "Research",
    intro:
      "Neumas public pages may reference a verified 6-10% food-cost optimization benchmark as an opportunity area. It should not be presented as a guaranteed outcome for every customer or site.",
    keywords: ["food cost benchmark", "F&B cost control", "restaurant waste reduction"],
    sections: [
      {
        title: "Benchmark language",
        body:
          "The benchmark should be described as an industry or operating opportunity that motivates better controls, not as a universal Neumas customer result.",
      },
      {
        title: "Projected waste reduction",
        body:
          "Waste language must remain qualified as projected waste-reduction potential up to 30%. Public copy should never shorten that to an achieved or guaranteed claim.",
      },
    ],
    relatedLinks: [
      { href: "/features/inventory-intelligence", label: "Inventory intelligence" },
      { href: "/responsible-ai", label: "Responsible AI" },
      ...defaultRelatedLinks,
    ],
  },
  {
    path: "/compare/manual-ordering-vs-ai-operations",
    title: "Manual Ordering vs AI Operations",
    description:
      "Compare manual F&B ordering workflows with AI operations support for forecasts, reorder plans, vendor intelligence, and alerts.",
    h1: "Manual ordering versus AI operations support.",
    eyebrow: "Compare",
    intro:
      "Manual ordering often depends on memory, spreadsheets, and last-minute checks. Neumas adds structured signals from receipts, invoices, inventory movement, consumption history, and vendors so teams can review better recommendations.",
    keywords: ["manual ordering vs AI operations", "restaurant ordering software", "F&B reorder automation"],
    sections: [
      {
        title: "Manual workflow",
        body:
          "Manual workflows can work at small scale, but they become harder to audit as outlet count, vendor count, and item complexity increase.",
      },
      {
        title: "AI operations workflow",
        body:
          "AI operations support can surface forecast risk, cost signals, reorder recommendations, and alerts while keeping approval in operator hands.",
      },
    ],
    relatedLinks: [
      { href: "/features/reorder-planning", label: "Reorder planning" },
      { href: "/features/multi-location-operations", label: "Multi-location operations" },
      ...defaultRelatedLinks,
    ],
  },
  {
    path: "/compare/receipt-scanner-vs-inventory-intelligence",
    title: "Receipt Scanner vs Inventory Intelligence",
    description:
      "Compare basic receipt scanning with the broader inventory intelligence, forecast, reorder, vendor, and alert workflows Neumas supports.",
    h1: "A scanner captures data. Intelligence changes decisions.",
    eyebrow: "Compare",
    intro:
      "Receipt scanning is useful, but F&B operators need the next layer: line-item review, stock updates, movement history, forecasts, reorder recommendations, vendor signals, and operational alerts.",
    keywords: ["receipt scanner vs inventory intelligence", "restaurant receipt AI", "inventory intelligence"],
    sections: [
      {
        title: "Receipt scanner",
        body:
          "A scanner digitizes documents and may extract line items. On its own, it does not create a full operating view.",
      },
      {
        title: "Inventory intelligence",
        body:
          "Inventory intelligence connects extracted records to stock, consumption, forecasts, reorders, vendors, and alerts.",
      },
    ],
    relatedLinks: [
      { href: "/features/receipt-invoice-processing", label: "Receipt and invoice processing" },
      { href: "/features/inventory-intelligence", label: "Inventory intelligence" },
      ...defaultRelatedLinks,
    ],
  },
  {
    path: "/glossary",
    title: "F&B Operations Glossary",
    description:
      "Definitions for Neumas concepts including inventory intelligence, receipt and invoice processing, reorder planning, vendor intelligence, and operational alerts.",
    h1: "F&B operations terms, in plain language.",
    eyebrow: "Glossary",
    intro:
      "A short public glossary for the operating language behind Neumas: receipt and invoice processing, inventory intelligence, forecasts, reorder planning, vendor intelligence, alerts, and multi-location visibility.",
    keywords: ["F&B operations glossary", "inventory intelligence definition", "reorder planning definition"],
    sections: [
      {
        title: "Inventory intelligence",
        body:
          "Inventory intelligence connects stock levels, movements, value, consumption patterns, shortage risk, and alerts into a practical operating view.",
      },
      {
        title: "Reorder planning",
        body:
          "Reorder planning turns stock and consumption signals into recommendations that operators can review and approve.",
      },
    ],
    relatedLinks: [
      { href: "/glossary/inventory-intelligence", label: "Inventory intelligence" },
      { href: "/glossary/reorder-planning", label: "Reorder planning" },
      ...defaultRelatedLinks,
    ],
  },
  {
    path: "/glossary/inventory-intelligence",
    title: "Glossary: Inventory Intelligence",
    description:
      "Inventory intelligence means turning F&B stock, movement, consumption, and vendor data into actionable operating signals.",
    h1: "Inventory intelligence.",
    eyebrow: "Glossary",
    intro:
      "Inventory intelligence is the operating layer that helps F&B teams understand what they have, what moved, what is at risk, and what action may be needed next.",
    keywords: ["inventory intelligence", "restaurant inventory intelligence", "F&B inventory definition"],
    sections: [
      {
        title: "Definition",
        body:
          "For Neumas, inventory intelligence includes stock levels, movement history, low-stock risk, inventory value, consumption patterns, forecasts, and operational alerts.",
      },
    ],
    relatedLinks: [
      { href: "/features/inventory-intelligence", label: "Inventory intelligence feature" },
      { href: "/glossary", label: "Glossary" },
      ...defaultRelatedLinks,
    ],
  },
  {
    path: "/glossary/receipt-invoice-processing",
    title: "Glossary: Receipt and Invoice Processing",
    description:
      "Receipt and invoice processing converts F&B documents into structured line-item data for inventory and vendor workflows.",
    h1: "Receipt and invoice processing.",
    eyebrow: "Glossary",
    intro:
      "Receipt and invoice processing is the extraction and review workflow that turns supplier and operator documents into usable operating records.",
    keywords: ["receipt invoice processing", "F&B invoice OCR", "restaurant receipt extraction"],
    sections: [
      {
        title: "Definition",
        body:
          "The workflow extracts item names, quantities, units, vendors, and price signals so inventory, forecast, reorder, and vendor workflows have cleaner inputs.",
      },
    ],
    relatedLinks: [
      { href: "/features/receipt-invoice-processing", label: "Receipt and invoice processing feature" },
      { href: "/glossary", label: "Glossary" },
      ...defaultRelatedLinks,
    ],
  },
  {
    path: "/glossary/reorder-planning",
    title: "Glossary: Reorder Planning",
    description:
      "Reorder planning helps F&B teams turn inventory and consumption signals into reviewed purchasing recommendations.",
    h1: "Reorder planning.",
    eyebrow: "Glossary",
    intro:
      "Reorder planning is the workflow of deciding what to purchase next based on stock, usage, vendor, cost, and operational risk signals.",
    keywords: ["reorder planning", "restaurant reorder recommendations", "F&B purchasing planning"],
    sections: [
      {
        title: "Definition",
        body:
          "In Neumas, reorder planning means generating recommendations for operator approval. It should not be described as universal autonomous supplier ordering.",
      },
    ],
    relatedLinks: [
      { href: "/features/reorder-planning", label: "Reorder planning feature" },
      { href: "/glossary", label: "Glossary" },
      ...defaultRelatedLinks,
    ],
  },
  {
    path: "/security",
    title: "Security at Neumas",
    description:
      "Security and public/private data boundaries for Neumas F&B operating data, dashboards, uploads, and public pages.",
    h1: "Security boundaries for operational F&B data.",
    eyebrow: "Security",
    intro:
      "Neumas separates public marketing and crawler-facing content from authenticated F&B operating data. Public pages describe the product; private dashboards, uploads, inventory records, and backend workflows remain protected.",
    keywords: ["Neumas security", "F&B data security", "restaurant operations data"],
    sections: [
      {
        title: "Public versus private surfaces",
        body:
          "Marketing, policy, and documentation pages are public. Authenticated dashboards, uploads, settings, customer records, and internal APIs are excluded from crawler guidance.",
      },
      {
        title: "No secrets in public code",
        body:
          "Browser code should only use NEXT_PUBLIC values intended for exposure. Service role keys, backend secrets, and operational tokens must remain server-side.",
      },
    ],
    faq: homepageFaqs,
    relatedLinks: [
      { href: "/privacy", label: "Privacy" },
      { href: "/data-processing", label: "Data processing" },
      ...defaultRelatedLinks,
    ],
  },
  {
    path: "/privacy",
    title: "Privacy at Neumas",
    description:
      "How Neumas frames privacy for public pages and authenticated F&B operating data.",
    h1: "Privacy for F&B operating intelligence.",
    eyebrow: "Privacy",
    intro:
      "Invoices, receipts, inventory records, vendors, and ordering history can reveal sensitive operating patterns. Neumas keeps public positioning discoverable while authenticated operational data remains private.",
    keywords: ["Neumas privacy", "F&B operations privacy", "restaurant data privacy"],
    sections: [
      {
        title: "Public content",
        body:
          "Public pages explain Neumas positioning, product workflow, use cases, and policy stance for search engines, AI assistants, prospects, and evaluators.",
      },
      {
        title: "Private operations",
        body:
          "Customer uploads, extracted line items, vendor records, inventory, alerts, and dashboards are authenticated product surfaces and should not appear in public crawler files.",
      },
    ],
    faq: homepageFaqs,
    relatedLinks: [
      { href: "/security", label: "Security" },
      { href: "/contact", label: "Contact" },
      ...defaultRelatedLinks,
    ],
  },
  {
    path: "/terms",
    title: "Neumas Terms",
    description: "Public terms summary for evaluating Neumas AI operations software for F&B teams.",
    h1: "Public terms for evaluating Neumas.",
    eyebrow: "Terms",
    intro:
      "This public terms summary explains the boundary between public product information and authenticated use of Neumas. It does not publish private customer agreements, credentials, or operational data.",
    keywords: ["Neumas terms", "F&B software terms", "restaurant operations software"],
    sections: [
      {
        title: "Public content use",
        body:
          "Public pages may be viewed and referenced for informational evaluation. They should not be read as guaranteed outcomes, customer endorsements, or unsupported automation claims.",
      },
      {
        title: "Authenticated service use",
        body:
          "Authenticated use may require account registration, appropriate authorization to upload operational records, and compliance with applicable service terms.",
      },
    ],
    relatedLinks: [
      { href: "/privacy", label: "Privacy" },
      { href: "/security", label: "Security" },
      ...defaultRelatedLinks,
    ],
  },
  {
    path: "/contact",
    title: "Contact Neumas",
    description:
      "Contact Neumas about AI operations intelligence for restaurants, cafes, cloud kitchens, multi-location F&B groups, and hospitality teams.",
    h1: "Talk to Neumas about your operation.",
    eyebrow: "Contact",
    intro:
      "Use this public contact path for demo requests, partnership questions, security and privacy inquiries, or evaluation of Neumas for an F&B operation.",
    keywords: ["contact Neumas", "Neumas demo", "F&B operations software demo"],
    sections: [
      {
        title: "Demo inquiries",
        body:
          "Restaurants, cafes, cloud kitchens, multi-location groups, and hospitality teams can contact Neumas to discuss the receipt-to-reorder workflow and operational fit.",
      },
      {
        title: "Partnership and integration questions",
        body:
          "Use this path for integration discussions, partner inquiries, and questions about operating context. Public pages do not imply unsupported connectors or endorsements.",
      },
    ],
    ctaTitle: "Book a demo",
    ctaBody: "Tell us about your F&B operation, outlet count, and current inventory or ordering workflow.",
    relatedLinks: [
      { href: "mailto:info@neumas.ai", label: "Email info@neumas.ai" },
      { href: "/integrations", label: "Integrations" },
      ...defaultRelatedLinks,
    ],
  },
  {
    path: "/data-processing",
    title: "Data Processing at Neumas",
    description:
      "How Neumas thinks about processing invoices, receipts, inventory movements, vendor records, and operational alerts for F&B teams.",
    h1: "Data processing for receipt-to-reorder workflows.",
    eyebrow: "Data processing",
    intro:
      "Neumas processes F&B operating inputs to support inventory intelligence, forecasts, reorder planning, vendor intelligence, cost signals, and operational alerts.",
    keywords: ["F&B data processing", "invoice processing AI", "inventory data processing"],
    sections: [
      {
        title: "Operating inputs",
        body:
          "Inputs may include invoices, receipts, inventory movements, vendors, item records, outlet context, and consumption history submitted through authenticated product workflows.",
      },
      {
        title: "Decision outputs",
        body:
          "Outputs include cleaner stock records, forecasts, reorder recommendations, cost signals, vendor intelligence, and alerts. These support human decisions and review workflows.",
      },
    ],
    relatedLinks: [
      { href: "/privacy", label: "Privacy" },
      { href: "/security", label: "Security" },
      ...defaultRelatedLinks,
    ],
  },
  {
    path: "/responsible-ai",
    title: "Responsible AI at Neumas",
    description:
      "Responsible AI boundaries for Neumas receipt extraction, forecasts, reorder recommendations, and operational alerts.",
    h1: "Responsible AI for F&B operations.",
    eyebrow: "Responsible AI",
    intro:
      "Neumas uses AI as decision support for extraction, forecasting, reorder planning, and alerting. The product should communicate confidence, review paths, and limitations rather than pretending every operational answer is automatic.",
    keywords: ["responsible AI F&B", "AI inventory forecasting", "AI reorder recommendations"],
    sections: [
      {
        title: "Human review",
        body:
          "Operators should be able to review extracted line items and approve reorder recommendations. Public pages should avoid unsupported claims of universal autonomous supplier ordering.",
      },
      {
        title: "Claim discipline",
        body:
          "Measured metrics, benchmarks, and projections should be labeled clearly. Neumas should not present projected waste reduction as a guaranteed customer outcome.",
      },
    ],
    relatedLinks: [
      { href: "/how-it-works", label: "How it works" },
      { href: "/security", label: "Security" },
      ...defaultRelatedLinks,
    ],
  },
  {
    path: "/crawler-readiness",
    title: "Crawler Readiness",
    description:
      "Public-safe crawler diagnostics showing Neumas positioning for AI operations in F&B while private dashboards remain excluded.",
    h1: "Crawler readiness for Neumas public positioning.",
    eyebrow: "Diagnostics",
    intro:
      "This page summarizes the public crawl surface for Neumas: AI operations for F&B, public policy pages, sitemap, robots, and LLM guidance. Authenticated product data remains outside crawler scope.",
    keywords: ["crawler readiness", "AI crawler diagnostics", "Neumas technical SEO"],
    sections: [
      {
        title: "What public crawlers should understand",
        body:
          "Neumas is an AI operations platform for F&B teams. Crawlers should associate Neumas with receipt and invoice processing, inventory intelligence, forecasts, reorder planning, vendor intelligence, operational alerts, and multi-location visibility.",
      },
      {
        title: "What remains excluded",
        body:
          "Private dashboards, authenticated uploads, operational records, customer data, backend APIs, and the internal marketing preview route are excluded from public indexing.",
      },
    ],
    faq: homepageFaqs,
    relatedLinks: [
      { href: "/llms.txt", label: "llms.txt" },
      { href: "/sitemap.xml", label: "sitemap.xml" },
      { href: "/robots.txt", label: "robots.txt" },
      ...defaultRelatedLinks,
    ],
  },
];

export const publicPages: PublicPageContent[] = b2bPublicPages;

export function getPublicPage(path: string): PublicPageContent | undefined {
  return publicPages.find((page) => page.path === path);
}

export function buildAbsoluteUrl(path: string): string {
  const base = siteConfig.url.replace(/\/+$/, "");
  return path === "/" ? base : `${base}${path}`;
}

export function buildPublicMetadata(page: PublicPageContent): Metadata {
  const canonical = buildAbsoluteUrl(page.path);
  return {
    title: page.title,
    description: page.description,
    keywords: page.keywords,
    alternates: {
      canonical,
    },
    openGraph: {
      type: "website",
      title: page.title,
      description: page.description,
      url: canonical,
      siteName: siteConfig.name,
      images: [
        {
          url: siteConfig.ogImagePath,
          width: 1200,
          height: 630,
          alt: `${page.title} — ${siteConfig.name}`,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: page.title,
      description: page.description,
      images: [siteConfig.ogImagePath],
    },
    robots: {
      index: true,
      follow: true,
      googleBot: {
        index: true,
        follow: true,
      },
    },
  };
}

export function makeBreadcrumbs(path: string): { name: string; item: string }[] {
  const parts = path.split("/").filter(Boolean);
  if (parts.length === 0) {
    return [{ name: "Home", item: buildAbsoluteUrl("/") }];
  }

  const crumbs = [{ name: "Home", item: buildAbsoluteUrl("/") }];
  let current = "";
  for (const part of parts) {
    current += `/${part}`;
    crumbs.push({
      name: part
        .split("-")
        .map((token) => token.charAt(0).toUpperCase() + token.slice(1))
        .join(" "),
      item: buildAbsoluteUrl(current),
    });
  }
  return crumbs;
}

export const publicRouteIndex: PublicLink[] = publicPages.map((page) => ({
  href: page.path,
  label: page.title,
}));

export function buildOrganizationSchema(): JsonLd {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: siteConfig.companyName,
    url: siteConfig.url,
    email: siteConfig.contactEmail,
    description: siteConfig.description,
    areaServed: siteConfig.region,
  };
}

export function buildContactPointSchema(): JsonLd {
  return {
    "@context": "https://schema.org",
    "@type": "ContactPoint",
    contactType: "customer support",
    email: siteConfig.contactEmail,
    areaServed: siteConfig.region,
    availableLanguage: ["en"],
  };
}

export function buildWebSiteSchema(): JsonLd {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: siteConfig.name,
    url: siteConfig.url,
    description: siteConfig.description,
    inLanguage: "en",
  };
}

export function buildSoftwareApplicationSchema(): JsonLd {
  return {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: siteConfig.name,
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web",
    description: siteConfig.description,
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "USD",
      availability: "https://schema.org/InStock",
    },
    creator: {
      "@type": "Organization",
      name: siteConfig.companyName,
      url: siteConfig.url,
    },
  };
}

export function buildProductSchema(): JsonLd {
  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: siteConfig.name,
    brand: siteConfig.name,
    description: siteConfig.description,
    category: "AI operations software for F&B teams",
    url: siteConfig.url,
  };
}

export function buildWebPageSchema(page: Pick<PublicPageContent, "path" | "title" | "description">): JsonLd {
  return {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: page.title,
    description: page.description,
    url: buildAbsoluteUrl(page.path),
    isPartOf: {
      "@type": "WebSite",
      name: siteConfig.name,
      url: siteConfig.url,
    },
  };
}

export function buildFaqSchema(faq: PublicFaq[]): JsonLd {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faq.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: item.answer,
      },
    })),
  };
}

export function buildBreadcrumbSchema(path: string): JsonLd {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: makeBreadcrumbs(path).map((crumb, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: crumb.name,
      item: crumb.item,
    })),
  };
}

export function buildArticleSchema(page: Pick<PublicPageContent, "path" | "title" | "description" | "intro">): JsonLd {
  return {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: page.title,
    description: page.description,
    articleBody: page.intro,
    author: {
      "@type": "Organization",
      name: siteConfig.companyName,
    },
    publisher: {
      "@type": "Organization",
      name: siteConfig.companyName,
    },
    mainEntityOfPage: buildAbsoluteUrl(page.path),
  };
}

export function getHomepageSchemas(): JsonLd[] {
  return [
    buildOrganizationSchema(),
    buildWebSiteSchema(),
    buildSoftwareApplicationSchema(),
    buildProductSchema(),
    buildWebPageSchema({
      path: "/",
      title: "Neumas — AI Operations for F&B",
      description: siteConfig.description,
    }),
    buildBreadcrumbSchema("/"),
    buildFaqSchema(homepageFaqs),
  ];
}

export function getPublicPageSchemas(page: PublicPageContent): JsonLd[] {
  const schemas: JsonLd[] = [buildWebPageSchema(page), buildBreadcrumbSchema(page.path)];
  const trustPaths = new Set([
    "/about",
    "/contact",
    "/privacy",
    "/terms",
    "/security",
    "/data-processing",
    "/responsible-ai",
  ]);

  if (page.faq?.length) {
    schemas.push(buildFaqSchema(page.faq));
  }

  if (page.path.startsWith("/research/")) {
    schemas.push(buildArticleSchema(page));
  }

  if (page.path.startsWith("/features/")) {
    schemas.push(buildProductSchema());
  }

  if (page.path.startsWith("/glossary/")) {
    schemas.push({
      "@context": "https://schema.org",
      "@type": "DefinedTerm",
      name: page.title.replace(/^Glossary:\s*/, ""),
      description: page.description,
      termCode: page.path,
      inDefinedTermSet: buildAbsoluteUrl("/glossary"),
    });
  }

  if (trustPaths.has(page.path)) {
    schemas.push(buildOrganizationSchema(), buildContactPointSchema());
  }

  return schemas;
}
