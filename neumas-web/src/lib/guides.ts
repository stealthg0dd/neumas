import {
  buildBreadcrumbSchema,
  buildFaqSchema,
  entityIds,
  makeBreadcrumbs,
  siteConfig,
  type JsonLd,
  type PublicFaq,
  type PublicLink,
} from "@/lib/public-site";
import {
  buildContentArticleSchema,
  buildContentMetadata,
  buildContentWebPageSchema,
  type IndexableContent,
  validateIndexableContent,
} from "@/lib/content-seo";

export type GuideCitation = {
  claim: string;
  source: string;
  url: string;
  publishedDate: string;
};

export type GuideSectionType =
  | "definition"
  | "context"
  | "workflow"
  | "failure-points"
  | "metrics"
  | "example"
  | "decision-framework"
  | "neumas-fit";

export type GuideSection = {
  heading: string;
  type: GuideSectionType;
  body: string[];
  bullets?: string[];
  relatedLinks?: PublicLink[];
};

export type GuideContent = IndexableContent & {
  path: string;
  h1: string;
  dek: string;
  readingTime: string;
  sections: GuideSection[];
  citations: GuideCitation[];
  faq: PublicFaq[];
  relatedSolutionLinks: PublicLink[];
  ctaTitle: string;
  ctaBody: string;
};

const nraSalesCitation: GuideCitation = {
  claim:
    "Eating and drinking places posted total U.S. sales of roughly $105.1 billion on a seasonally adjusted basis in August 2026, up from $103.8 billion in July — the industry's fifth straight month of sales growth.",
  source: "National Restaurant Association, \"Total restaurant industry sales\" (U.S. Census Bureau data)",
  url: "https://restaurant.org/research-and-media/research/restaurant-economic-insights/economic-indicators/total-restaurant-industry-sales/",
  publishedDate: "2026-09-16",
};

const usdaFoodExpenditureCitation: GuideCitation = {
  claim:
    "The USDA's Economic Research Service tracks food-away-from-home spending as one of its core national food expenditure categories, alongside food-at-home spending, as part of its long-running Food Expenditure Series.",
  source: "USDA Economic Research Service, \"Food Expenditure Series\"",
  url: "https://www.ers.usda.gov/data-products/food-expenditure-series/",
  publishedDate: "2026-09-18",
};

const guideDefinitions: GuideContent[] = [
  {
    slug: "restaurant-inventory-management",
    path: "/guides/restaurant-inventory-management",
    title: "Restaurant Inventory Management: A Practical Guide for Modern F&B Operators",
    description:
      "A practical guide to restaurant inventory management: definitions, workflow, common failure points, key metrics, and a decision framework for modern F&B operators.",
    h1: "Restaurant Inventory Management: A Practical Guide for Modern F&B Operators",
    dek:
      "For restaurant operators, restaurant groups, and multi-location F&B teams, inventory is where purchasing decisions, food cost, and service reliability meet. This guide walks through what restaurant inventory management actually involves, where it typically breaks down, and how to think about upgrading it.",
    summary:
      "A practical guide to restaurant inventory management, covering workflow, failure points, metrics, and a decision framework for F&B operators.",
    publishedAt: "2026-09-20",
    updatedAt: "2026-09-20",
    category: "Guide",
    author: "Neumas",
    canonicalUrl: "https://www.neumas.cc/guides/restaurant-inventory-management",
    readingTime: "11 min read",
    keywords: [
      "restaurant inventory management software",
      "restaurant inventory intelligence",
      "multi-location restaurant operations",
    ],
    sections: [
      {
        heading: "What restaurant inventory management actually means",
        type: "definition",
        body: [
          "Restaurant inventory management is the practice of tracking what stock a food and beverage business has on hand, what has moved in and out, and what that stock is worth, so purchasing and menu decisions are based on current reality rather than memory or guesswork.",
          "A few terms come up constantly in this space, and it helps to be precise about them:",
        ],
        bullets: [
          "Stock ledger — the running record of what was received, used, transferred, wasted, or counted, item by item.",
          "Par level — the target quantity of an item you want on hand before reordering, usually set per outlet and per item.",
          "Theoretical usage — how much of an item should have been consumed, calculated from recipes and sales.",
          "Actual usage — how much of an item was actually consumed or removed from stock, based on counts and movements.",
          "Variance — the difference between theoretical and actual usage, usually the first place waste, over-portioning, or shrinkage shows up.",
          "COGS (cost of goods sold) — the cost of the inventory actually consumed to generate the revenue in a given period.",
        ],
      },
      {
        heading: "Why inventory accuracy matters more at scale",
        type: "context",
        body: [
          "A single-location restaurant can sometimes get by with a notebook and a weekly count, because the owner or head chef has direct visibility into the walk-in and the storeroom. That visibility breaks down quickly once you add outlets, shifts, and purchasing managers who are not physically present in every kitchen.",
          "Restaurant and foodservice sales represent a large and still-growing share of consumer spending in aggregate, which is part of why even small percentage improvements in inventory accuracy or waste can represent meaningful amounts of money once you are operating at multi-location scale.",
        ],
      },
      {
        heading: "The core inventory workflow",
        type: "workflow",
        body: [
          "Most restaurant inventory processes — whether they run on paper, spreadsheets, or software — follow the same underlying sequence:",
        ],
        bullets: [
          "1. Receiving — goods arrive against a supplier invoice or delivery note, and quantities, units, and condition are checked against what was ordered.",
          "2. Posting — received quantities are added to the stock ledger, ideally itemized rather than lumped into a single generic category.",
          "3. Usage and depletion — stock is consumed through prep and service, transferred between outlets, or removed as waste.",
          "4. Counting — periodic physical counts (full or cycle counts) establish what is actually on the shelf.",
          "5. Variance review — actual counts are compared against theoretical usage to spot shrinkage, over-portioning, or data entry errors.",
          "6. Reordering — par levels, recent usage, and any pending deliveries inform what gets ordered next, and from which supplier.",
        ],
      },
      {
        heading: "Where the process typically breaks down",
        type: "failure-points",
        body: [
          "In practice, most inventory problems are not caused by any single dramatic failure. They come from small gaps that compound over weeks:",
        ],
        bullets: [
          "Invoices and receipts are filed but never actually turned into structured, item-level data, so the stock ledger lags behind reality.",
          "Manual spreadsheets rely on someone remembering to update them consistently across every shift and every outlet.",
          "The same ingredient is named differently across suppliers or outlets, making it hard to see true usage or price trends for that item.",
          "Nobody reconciles what was billed on an invoice against what was actually delivered and counted, so errors and short deliveries go unnoticed.",
          "Multi-location groups often have per-outlet visibility but no shared, group-level view, which makes it hard to compare performance or standardize purchasing.",
          "Low-stock or unusual-usage alerts either do not exist or arrive too late to prevent a stockout or an obvious waste pattern.",
        ],
      },
      {
        heading: "Metrics worth tracking",
        type: "metrics",
        body: [
          "You do not need a large dashboard to get value from inventory metrics, but a few are worth tracking consistently, defined here rather than benchmarked against an invented industry-wide number:",
        ],
        bullets: [
          "Inventory turnover — how many times inventory is used and replaced over a period; calculated as cost of goods sold divided by average inventory value.",
          "Days of inventory on hand — roughly, average inventory value divided by average daily usage, which indicates how much cash is tied up in stock.",
          "Variance percentage — the gap between theoretical and actual usage for a given item or category, tracked over time rather than compared to a universal target.",
          "Stockout frequency — how often a given item hits zero available stock during service, which affects both revenue and guest experience.",
          "Food cost percentage — cost of goods sold divided by food sales for a period, the standard way operators express how much of revenue went to ingredients.",
        ],
      },
      {
        heading: "A practical, illustrative example",
        type: "example",
        body: [
          "This example is illustrative only — it is not a customer case study or a claimed result.",
          "Consider a four-location cafe group where each outlet manager keeps its own spreadsheet, updated inconsistently. Head office only sees inventory value once a month, after a manual roll-up. One outlet quietly runs low on a popular pastry ingredient every Friday because nobody notices the usage pattern until the shelf is empty. Another outlet is over-ordering the same ingredient because its manager, without visibility into the other outlets, orders conservatively 'just in case.'",
          "In this scenario, the underlying problem is not effort — every manager is trying to do the right thing — it is the lack of a shared, current view of stock across outlets. Centralizing invoice and receipt data into one live ledger, with outlet-level detail and a group-level roll-up, is what turns four separate guesses into one coordinated picture.",
        ],
      },
      {
        heading: "A decision framework: do you need dedicated inventory software?",
        type: "decision-framework",
        body: [
          "There is no universal threshold at which a restaurant 'needs' software instead of spreadsheets. These questions are a more useful way to think about it than a headcount or revenue cutoff:",
        ],
        bullets: [
          "Does anyone currently reconcile supplier invoices against physical counts, or are the two processes disconnected?",
          "If you operate more than one location, does anyone have a single, current view across all of them — or does each outlet manage its own spreadsheet?",
          "How much staff time goes into manual data entry each week, and could that time be spent on service or menu quality instead?",
          "Do stockouts or over-ordering happen often enough that a manager could describe a recent, specific example without thinking hard?",
          "When a supplier's price changes, does anyone notice quickly, or does it only show up later in a monthly cost review?",
        ],
      },
      {
        heading: "Where Neumas fits",
        type: "neumas-fit",
        body: [
          "Everything above is general restaurant operations practice — it applies whether or not you ever use Neumas. Here is specifically what Neumas provides, so the distinction is clear.",
          "Neumas extracts line items from supplier invoices and receipts, posts them to a live inventory ledger, and gives multi-location operators outlet-level detail alongside a group-level roll-up. Operational alerts surface low stock and unusual movement, and reorder recommendations route through an approval workflow rather than placing orders automatically.",
        ],
        relatedLinks: [
          { href: "/features/inventory-intelligence", label: "Inventory intelligence feature" },
          { href: "/solutions/restaurant-inventory-management", label: "Restaurant inventory management solution" },
          { href: "/solutions/invoice-intelligence", label: "Invoice intelligence solution" },
        ],
      },
    ],
    citations: [nraSalesCitation],
    faq: [
      {
        question: "How is inventory management different from what my POS system already does?",
        answer:
          "A POS system tracks sales transactions. Inventory management tracks what stock you have, what it cost, and how it moves — informed by supplier invoices, receipts, and counts, not just sales data. The two are complementary: POS data can help estimate theoretical usage, but it is not itself a stock ledger.",
      },
      {
        question: "Do I need barcode scanning or special hardware to manage inventory well?",
        answer:
          "No. Many operators run effective inventory processes using invoice and receipt data plus periodic manual counts. Barcode or RFID scanning can add convenience at higher volumes, but it is not a prerequisite for getting accurate, current stock records.",
      },
      {
        question: "How often should we do physical counts if we already use software?",
        answer:
          "Software reduces how much you depend on physical counts for day-to-day visibility, but periodic counts (weekly or monthly, depending on the item and its cost) remain good practice for reconciling the ledger against physical reality and catching data entry or process errors.",
      },
      {
        question: "What is a good variance percentage to aim for?",
        answer:
          "There is no single, universal benchmark, and treating one as a target can create false confidence. It is more useful to track your own variance trend by category over time, investigate outliers, and focus on whether variance is improving or worsening rather than comparing to an external number.",
      },
    ],
    relatedSolutionLinks: [
      { href: "/solutions/restaurant-inventory-management", label: "Restaurant inventory management" },
      { href: "/solutions/invoice-intelligence", label: "Invoice intelligence" },
      { href: "/solutions/predictive-reordering", label: "Predictive reordering" },
    ],
    ctaTitle: "See how Neumas keeps inventory records current",
    ctaBody: "Read the inventory intelligence feature page, or start a pilot to see it against your own invoices.",
  },
  {
    slug: "restaurant-food-cost-control",
    path: "/guides/restaurant-food-cost-control",
    title: "Restaurant Food Cost Control: From Supplier Invoice to Margin Visibility",
    description:
      "A practical guide to restaurant food cost control: definitions, the invoice-to-margin workflow, common failure points, key metrics, and how to think about upgrading your process.",
    h1: "Restaurant Food Cost Control: From Supplier Invoice to Margin Visibility",
    dek:
      "Food cost is decided line item by line item, invoice by invoice, long before it shows up as a disappointing number on a P&L. This guide walks through how food cost control actually works, from the supplier invoice to menu-level margin visibility.",
    summary:
      "A practical guide to food cost control, from supplier invoice processing through to restaurant margin visibility.",
    publishedAt: "2026-09-20",
    updatedAt: "2026-09-20",
    category: "Guide",
    author: "Neumas",
    canonicalUrl: "https://www.neumas.cc/guides/restaurant-food-cost-control",
    readingTime: "12 min read",
    keywords: ["restaurant food cost management", "supplier price tracking", "restaurant purchasing software"],
    sections: [
      {
        heading: "What food cost control actually means",
        type: "definition",
        body: [
          "Food cost control is the discipline of understanding, at the ingredient and menu-item level, how much it costs to produce what you sell, and catching cost changes early enough to act on them rather than discovering them at month-end.",
          "A few terms are worth defining precisely:",
        ],
        bullets: [
          "Food cost — the cost of the ingredients used to produce food sold in a given period.",
          "Food cost percentage — food cost divided by food sales for the same period, expressed as a percentage.",
          "Prime cost — food cost plus labor cost combined, often treated as the single most important controllable cost line in a restaurant.",
          "Recipe (or plate) costing — calculating the ingredient cost of a specific menu item based on its recipe and current ingredient prices.",
          "Contribution margin — the amount a menu item contributes toward fixed costs and profit after its direct food cost is subtracted from its price.",
        ],
      },
      {
        heading: "Why the supplier invoice is the foundation",
        type: "context",
        body: [
          "Menu prices are usually set deliberately, but ingredient costs move constantly and often quietly — a few cents per kilogram here, a case-pack size change there. Because supplier invoices are the first place those changes appear, they are also the earliest point at which a business can catch cost drift, well before it is visible in an aggregated monthly report.",
          "Food away from home is tracked as a distinct, significant category of national food spending, which is part of why supplier and menu pricing dynamics in foodservice get sustained attention from operators, analysts, and policymakers alike.",
        ],
      },
      {
        heading: "The core invoice-to-margin workflow",
        type: "workflow",
        body: ["A functioning food cost control process generally moves through the same stages:"],
        bullets: [
          "1. Invoice capture — supplier invoices and receipts are collected, whether as paper, PDF, or a portal export.",
          "2. Line-item normalization — each line is broken into item, quantity, unit, vendor, and price, with consistent naming across suppliers where possible.",
          "3. Price tracking — the same item's price is compared across time and across suppliers to catch increases or inconsistencies.",
          "4. Recipe and menu costing — ingredient prices feed into the cost of each recipe, which rolls up into the cost of each menu item.",
          "5. Margin review — menu prices are compared against current ingredient costs to see which items are under pressure and which still have healthy contribution margin.",
        ],
      },
      {
        heading: "Where food cost control typically breaks down",
        type: "failure-points",
        body: ["Most food cost problems are not one big mistake — they are a handful of small gaps that compound:"],
        bullets: [
          "Price increases arrive on an invoice and are paid without anyone reviewing whether the per-unit cost actually changed.",
          "The same ingredient is billed under different names or pack sizes by different suppliers, making it hard to compare true cost per unit.",
          "Invoice data is filed but never turned into structured records, so nobody can look back at price history for a given item.",
          "Menu prices are set once and rarely revisited, even as key ingredient costs shift meaningfully over a season.",
          "Waste is treated as an unavoidable cost of doing business rather than something to measure and reduce, even though it directly inflates food cost percentage.",
        ],
      },
      {
        heading: "Metrics worth tracking",
        type: "metrics",
        body: [
          "These are defined here as formulas and concepts, not benchmarked against a specific external percentage, since a 'good' number depends heavily on segment, region, and menu mix:",
        ],
        bullets: [
          "Food cost percentage — food cost ÷ food sales, tracked by period and ideally by category or menu item.",
          "Prime cost — food cost + labor cost, often reviewed as a combined percentage of sales.",
          "Price variance by item — how much a specific ingredient's per-unit price has moved over a chosen period, by vendor.",
          "Contribution margin by menu item — menu price minus ingredient cost, used to prioritize which items to promote, reprice, or re-engineer.",
        ],
      },
      {
        heading: "A practical, illustrative example",
        type: "example",
        body: [
          "This example is illustrative only — it is not a customer case study or a claimed result.",
          "Consider a mid-size restaurant group where a core protein ingredient's price rises gradually over several months, a few percent at a time, across multiple invoices from the same vendor. No single increase is large enough to trigger a conversation, and the finance team only notices the cumulative effect when quarterly food cost percentage comes in higher than expected.",
          "In this scenario, the individual price changes were always visible on the invoices — the gap was in turning invoice line items into a tracked price history that could show the cumulative trend early, rather than waiting for it to surface in an aggregated report weeks or months later.",
        ],
      },
      {
        heading: "A decision framework: is it time to upgrade your food-cost process?",
        type: "decision-framework",
        body: [
          "Instead of a hard threshold, these questions help identify whether your current process is keeping up:",
        ],
        bullets: [
          "If a key supplier raised prices on a specific item today, would anyone notice within the week, or only at the next cost review?",
          "Can you currently see price history for your top ten ingredients by spend, by vendor, without manual work?",
          "Are menu prices revisited on a schedule, or only when margin pressure becomes obvious?",
          "Is waste tracked as its own line item, or bundled invisibly into overall food cost?",
          "Across locations, is purchasing done consistently, or does each outlet negotiate and buy independently with no shared visibility?",
        ],
      },
      {
        heading: "Where Neumas fits",
        type: "neumas-fit",
        body: [
          "Everything above is general restaurant accounting and operations practice, independent of any specific vendor. Here is specifically what Neumas provides.",
          "As invoices are processed, Neumas tracks price signals at the line-item and vendor level so price changes become visible closer to when they happen, and surfaces vendor and cost context across outlets for multi-location groups. Neumas frames food-cost and waste-reduction opportunity as a qualified, projected benchmark rather than a guaranteed outcome for every operation — see the food-cost optimization benchmark research for how that framing is defined.",
        ],
        relatedLinks: [
          { href: "/features/vendor-intelligence", label: "Vendor intelligence feature" },
          { href: "/solutions/food-cost-control", label: "Food cost control solution" },
          { href: "/research/food-cost-benchmark", label: "Food-cost optimization benchmark research" },
        ],
      },
    ],
    citations: [usdaFoodExpenditureCitation],
    faq: [
      {
        question: "What is a healthy food cost percentage?",
        answer:
          "It varies significantly by segment, cuisine, and pricing strategy, so there is no single healthy number that applies everywhere. It is more useful to track your own food cost percentage by category over time and understand what is driving changes than to chase an external benchmark.",
      },
      {
        question: "Is prime cost more useful than food cost percentage alone?",
        answer:
          "Many operators find prime cost (food cost plus labor cost) more useful because it captures the two largest controllable cost lines together, and a change in one can offset or amplify the other — for example, a menu change that reduces food cost but increases prep labor.",
      },
      {
        question: "How quickly should we expect to see a supplier price change reflected in our numbers?",
        answer:
          "In a manual process, often not until a monthly or quarterly review. With line-item price tracking from invoices, the same change can be visible much sooner, since it is captured at the point the invoice is processed rather than reconstructed later.",
      },
      {
        question: "Does tracking food cost more closely mean menu prices need to change constantly?",
        answer:
          "Not necessarily. The goal is visibility and informed decisions, not automatic repricing. Some businesses choose to absorb minor cost movements and only adjust menu prices periodically; the value of tracking is knowing that trade-off is being made deliberately.",
      },
    ],
    relatedSolutionLinks: [
      { href: "/solutions/food-cost-control", label: "Food cost control" },
      { href: "/solutions/procurement-intelligence", label: "Procurement intelligence" },
      { href: "/solutions/invoice-intelligence", label: "Invoice intelligence" },
    ],
    ctaTitle: "Bring supplier price visibility into your food-cost process",
    ctaBody: "Read the vendor intelligence feature page, or start a pilot to see it against your own invoices.",
  },
];

export const guides: GuideContent[] = guideDefinitions.map(validateIndexableContent);

export function getGuide(slug: string): GuideContent | undefined {
  return guides.find((guide) => guide.slug === slug);
}

export function buildGuideMetadata(guide: GuideContent) {
  return buildContentMetadata(guide, {
    siteName: siteConfig.name,
    ogImagePath: siteConfig.ogImagePath,
    organizationId: entityIds.organization,
    websiteId: entityIds.website,
  }, true);
}

export function getGuideSchemas(guide: GuideContent): JsonLd[] {
  const context = {
    siteName: siteConfig.name,
    ogImagePath: siteConfig.ogImagePath,
    organizationId: entityIds.organization,
    websiteId: entityIds.website,
  };
  const schemas: JsonLd[] = [
    buildContentWebPageSchema(guide, context),
    buildBreadcrumbSchema(guide.path),
    buildContentArticleSchema(guide, context),
  ];
  if (guide.faq.length) {
    schemas.push(buildFaqSchema(guide.faq));
  }
  return schemas;
}

export function getGuideBreadcrumbs(guide: GuideContent) {
  return makeBreadcrumbs(guide.path);
}
