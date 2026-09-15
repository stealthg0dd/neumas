import {
  BarChart3,
  Boxes,
  Building2,
  ClipboardCheck,
  FileScan,
  FileText,
  LineChart,
  LucideIcon,
  MapPinned,
  PackageCheck,
  ReceiptText,
  RefreshCcw,
  ShieldCheck,
  ShoppingCart,
  Sparkles,
  Store,
  TrendingDown,
  TriangleAlert,
  UsersRound,
  Utensils,
} from "lucide-react";

export type MarketingAsset = {
  src: string;
  alt: string;
};

export type Metric = {
  value: string;
  label: string;
  note: string;
  tone: "blue" | "yellow" | "green";
};

export type WorkflowStep = {
  title: string;
  body: string;
  icon: LucideIcon;
};

export type PlatformFlowItem = {
  label: string;
  detail: string;
  tone: "action" | "data";
  icon: LucideIcon;
};

export type ReceiptWorkflowStep = WorkflowStep & {
  microcopy: string;
};

export type ProductStory = {
  eyebrow: string;
  headline: string;
  body: string;
  bullets: string[];
  scene: "inventory" | "prediction" | "vendors" | "cost" | "locations";
};

export type Module = {
  title: string;
  body: string;
  bullets: string[];
  icon: LucideIcon;
};

export type TeamMember = {
  name: string;
  role: string;
  initials: string;
  image?: MarketingAsset;
};

export type MarketingVideo = {
  title: string;
  role: string;
  src: string;
  poster: string;
  posterAlt: string;
};

export const marketingAssets = {
  logo: {
    src: "/marketing/neumas/brand/neumas-icon-hex.png",
    alt: "Neumas logo",
  },
  hero: {
    src: "/marketing/neumas/hero/neumas-hero-ai-operating-system-fbop.png",
    alt: "Neumas AI operating system for F&B operations dashboard and kitchen workflow",
  },
  cta: {
    src: "/marketing/neumas/hero/neumas-cta-ready-transform-fbop.png",
    alt: "Neumas F&B operations call to action artwork",
  },
  workflow: {
    src: "/marketing/neumas/product/neumas-fbop-operator-journey-8step.png",
    alt: "Neumas F&B operator journey from receipt capture to reorder approval",
  },
} satisfies Record<string, MarketingAsset>;

export const hero = {
  eyebrow: "AI Operations For F&B",
  headline: "Run a smarter back of house.",
  body:
    "Neumas turns invoices, receipts, inventory movements, and consumption history into cleaner stock records, forecasts, reorder plans, and operational intelligence for F&B teams.",
  primaryCta: { label: "Book a demo", href: "/pilot" },
  secondaryCta: { label: "See how Neumas works", href: "#workflow" },
};

export const metrics: Metric[] = [
  {
    value: "1,510+",
    label: "items tracked",
    note: "Current inventory footprint across active F&B operations.",
    tone: "blue",
  },
  {
    value: "100+",
    label: "users",
    note: "Operators and team members using Neumas workflows.",
    tone: "yellow",
  },
  {
    value: "92%",
    label: "ordering accuracy",
    note: "Measured Neumas operational metric.",
    tone: "green",
  },
  {
    value: "6-10%",
    label: "food cost opportunity",
    note: "Verified benchmark, presented as savings opportunity.",
    tone: "yellow",
  },
];

export const workflow: WorkflowStep[] = [
  {
    title: "Scan invoice or receipt",
    body: "AI extracts items, quantities, prices, and vendor details from daily purchasing paperwork.",
    icon: FileScan,
  },
  {
    title: "Check the data",
    body: "Neumas flags mismatches, confirms new items, and keeps the operating record clean.",
    icon: ClipboardCheck,
  },
  {
    title: "Update inventory",
    body: "Ingredient levels, costs, expiry risk, and outlet-level visibility stay current.",
    icon: Boxes,
  },
  {
    title: "Predict and approve",
    body: "Forecast shortages, surface waste risk, and turn reorder suggestions into purchase action.",
    icon: ShoppingCart,
  },
];

export const platformInputs: PlatformFlowItem[] = [
  { label: "Invoices", detail: "Supplier bills, delivery notes, and purchase context", tone: "action", icon: FileText },
  { label: "Receipts", detail: "Daily purchasing proof captured by operators", tone: "action", icon: ReceiptText },
  { label: "Inventory", detail: "On-hand stock, movement, par levels, and expiry risk", tone: "data", icon: Boxes },
  { label: "Vendors", detail: "Supplier records, reorder history, and price movement", tone: "data", icon: Store },
];

export const platformOutputs: PlatformFlowItem[] = [
  { label: "Inventory intelligence", detail: "Cleaner live stock records by outlet", tone: "data", icon: PackageCheck },
  { label: "Forecasts", detail: "Usage patterns and shortage signals", tone: "data", icon: LineChart },
  { label: "Reorder plans", detail: "Recommended quantities ready for approval", tone: "action", icon: ShoppingCart },
  { label: "Cost signals", detail: "Food-cost and price-variance opportunities", tone: "action", icon: TrendingDown },
  { label: "Operational alerts", detail: "Low stock, over-order risk, and expiry warnings", tone: "action", icon: TriangleAlert },
];

export const receiptWorkflow: ReceiptWorkflowStep[] = [
  {
    title: "Scan invoice or receipt",
    body: "Capture supplier paperwork at the outlet without manual spreadsheet entry.",
    microcopy: "Receipt OCR",
    icon: FileScan,
  },
  {
    title: "Review extracted line items",
    body: "Check item names, quantities, prices, and vendor matches before records update.",
    microcopy: "AI extracted 32 lines",
    icon: ClipboardCheck,
  },
  {
    title: "Update live inventory",
    body: "Push confirmed purchases into stock levels, values, and movement history.",
    microcopy: "SGD 4,250 on hand",
    icon: Boxes,
  },
  {
    title: "Detect usage patterns",
    body: "Learn how ingredients move by outlet, category, and operating cadence.",
    microcopy: "Produce usage rising",
    icon: BarChart3,
  },
  {
    title: "Forecast shortage and over-order risk",
    body: "Surface likely stock-outs, excess buying, and expiry pressure before service is affected.",
    microcopy: "Low stock in 2 days",
    icon: TriangleAlert,
  },
  {
    title: "Generate reorder recommendation",
    body: "Suggest supplier-linked quantities based on par levels, usage, and recent purchasing.",
    microcopy: "Recommended reorder",
    icon: LineChart,
  },
  {
    title: "Approve the plan",
    body: "Keep managers in control with approval before supplier or staff action.",
    microcopy: "Approve & send",
    icon: ShoppingCart,
  },
  {
    title: "Track outcomes",
    body: "Measure stock-outs avoided, waste risk, and ordering accuracy over time.",
    microcopy: "92% measured ordering accuracy",
    icon: PackageCheck,
  },
];

export const modules: Module[] = [
  {
    title: "Inventory intelligence",
    body: "Always know what is on hand before it becomes margin leakage.",
    bullets: ["Live ingredient levels by outlet", "Expiry and spoilage risk", "Inventory value on hand"],
    icon: PackageCheck,
  },
  {
    title: "Predictive purchasing",
    body: "Order exactly what each outlet needs before the kitchen runs short.",
    bullets: ["AI reorder suggestions", "Vendor-linked purchase flow", "Minimum and maximum rules"],
    icon: LineChart,
  },
  {
    title: "Vendor intelligence",
    body: "Understand supplier behavior with the same clarity as kitchen stock.",
    bullets: ["Vendor directory management", "Invoice price variance", "Reorder history by vendor"],
    icon: Store,
  },
  {
    title: "Waste and cost control",
    body: "Catch over-ordering and expiry risk earlier in the operating cycle.",
    bullets: ["Projected waste reduction potential of up to 30%", "Cost savings tracking", "Stock-outs avoided"],
    icon: TrendingDown,
  },
  {
    title: "Multi-location operations",
    body: "Give central teams a single picture across outlets without losing local detail.",
    bullets: ["Property-level inventory views", "Centralized purchasing", "Outlet health comparison"],
    icon: Building2,
  },
  {
    title: "Operational reports",
    body: "Turn daily purchasing and inventory work into decision-ready reporting.",
    bullets: ["Usage patterns by category", "Margin and waste signals", "Weekly operating summaries"],
    icon: BarChart3,
  },
];

export const productStories: ProductStory[] = [
  {
    eyebrow: "Inventory Intelligence",
    headline: "Know what you have. Before it costs you.",
    body:
      "Give operators a live view of outlet inventory, stock movement, low-stock risk, and inventory value without changing the underlying dashboard workflow.",
    bullets: ["Outlet inventory", "Stock levels and movement", "Low-stock risk", "Inventory value"],
    scene: "inventory",
  },
  {
    eyebrow: "Predictive Purchasing",
    headline: "Know what you'll need next.",
    body:
      "Use forecasts and reorder recommendations to prepare supplier-linked plans for manager approval. Neumas recommends; operators stay in control.",
    bullets: ["Forecasts", "Reorder recommendations", "Approval workflow", "Supplier linkage"],
    scene: "prediction",
  },
  {
    eyebrow: "Vendor Intelligence",
    headline: "Know your suppliers as well as your kitchen.",
    body:
      "Turn vendor records, spend, price movement, alerts, and reorder history into a clearer supplier operating picture.",
    bullets: ["Vendor directory", "Spend and price movement", "Comparisons and alerts", "Reorder history"],
    scene: "vendors",
  },
  {
    eyebrow: "Waste Risk & Cost Control",
    headline: "Act before waste becomes cost.",
    body:
      "Track risk signals before they turn into lost margin, using projected waste reduction potential and food-cost benchmarks responsibly.",
    bullets: ["Projected waste reduction potential up to 30%", "6-10% food-cost benchmark opportunity", "Expiry and over-order signals", "Measured ordering accuracy"],
    scene: "cost",
  },
  {
    eyebrow: "Multi-location Operations",
    headline: "One dashboard. Every outlet.",
    body:
      "Show organization-level roll-ups across properties, outlet health, inventory, alerts, and operating follow-up with anonymized outlet labels.",
    bullets: ["Organization and properties", "Outlet health", "Inventory and alerts", "Group-level roll-up"],
    scene: "locations",
  },
];

export const integrations = [
  "StoreHub",
  "Qashier",
  "POS systems",
  "Supplier catalogs",
  "Accounting tools",
] as const;

export const outcomes = [
  { title: "Fewer stock-outs", body: "Keep service levels steady with better demand visibility." },
  { title: "Less waste", body: "Projected waste reduction potential of up to 30%." },
  { title: "Better margins", body: "Use the verified 6-10% food cost benchmark as an opportunity lens." },
  { title: "Aligned teams", body: "Give managers, kitchen teams, and operators the same operating picture." },
] as const;

export const useCases = [
  { title: "Cafes", body: "Daily restocking, perishables, and supplier follow-up.", icon: Utensils },
  { title: "Cloud kitchens", body: "Forecast-led purchasing across fast-moving menus.", icon: Sparkles },
  { title: "Hawker and kopitiam teams", body: "Simple mobile workflows for practical daily ordering.", icon: MapPinned },
  { title: "Multi-outlet groups", body: "Central visibility with outlet-level accountability.", icon: UsersRound },
] as const;

export const team: TeamMember[] = [
  {
    name: "Varun Srivastava",
    role: "CEO & Co-founder",
    initials: "VS",
  },
  {
    name: "Anupama Sarraf",
    role: "COO & Co-founder",
    initials: "AS",
    image: {
      src: "/marketing/neumas/team/team-anupama-sarraf-headshot.jpg",
      alt: "Anupama Sarraf, COO and Co-founder of Neumas",
    },
  },
  {
    name: "Vy Nguyen",
    role: "Co-founder",
    initials: "VN",
  },
  {
    name: "Alpesh Bijlani",
    role: "Singapore Operations",
    initials: "AB",
  },
];

export const videos: MarketingVideo[] = [
  {
    title: "F&B operations overview",
    role: "Hero storytelling loop",
    src: "/marketing/neumas/videos/neumas-intro-hero-loop.mp4",
    poster: "/marketing/neumas/videos/neumas-intro-poster.jpg",
    posterAlt: "Neumas founder introducing the F&B operations platform",
  },
  {
    title: "Founder intro",
    role: "Full intro video",
    src: "/marketing/neumas/videos/neumas-intro-full-web.mp4",
    poster: "/marketing/neumas/videos/neumas-intro-poster.jpg",
    posterAlt: "Neumas founder introducing the F&B operations platform",
  },
  {
    title: "Receipt capture flow",
    role: "Product how-it-works video",
    src: "/marketing/neumas/videos/neumas-receipt-capture-demo.mp4",
    poster: "/marketing/neumas/videos/neumas-demo-v1-poster.jpg",
    posterAlt: "Neumas product demo showing supplier receipts and extracted costs",
  },
  {
    title: "Deeper product walkthrough",
    role: "Product demo section",
    src: "/marketing/neumas/videos/neumas-operations-demo.mp4",
    poster: "/marketing/neumas/videos/neumas-demo-v2-poster.jpg",
    posterAlt: "Neumas product demo showing procurement recommendations and dashboards",
  },
];

export const trustNotes = [
  { title: "Operationally grounded", body: "Built around receipts, stock, suppliers, and purchase decisions." },
  { title: "SEA ready", body: "Singapore-facing product visuals and copy avoid misleading global assumptions." },
  { title: "Private by design", body: "Public marketing stays separate from authenticated dashboards and tenant data." },
  { title: "Integration aware", body: "StoreHub and Qashier are listed only as integrations, never as customers." },
  { title: "Responsible claims", body: "Quantitative claims are qualified where they are benchmarked or projected." },
  { title: "B2B first", body: "This preview does not alter the existing household homepage." },
] as const;

export const cta = {
  title: "Ready to transform F&B operations?",
  body:
    "Book a pilot conversation and map Neumas to your outlets, vendors, purchasing cadence, and current inventory workflow.",
  href: "/pilot",
  label: "Book a demo",
};

export const complianceSignals = [
  { label: "Authenticated dashboard remains private", icon: ShieldCheck },
  { label: "Existing pilot lead flow reused", icon: RefreshCcw },
  { label: "No customer logo claims", icon: ReceiptText },
] as const;
