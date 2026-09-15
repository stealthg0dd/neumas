import {
  BarChart3,
  Boxes,
  Building2,
  ClipboardCheck,
  FileScan,
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
    "From invoices and receipts to live inventory, predictive reordering, and waste control, Neumas gives F&B operators the operational intelligence they have been missing.",
  primaryCta: { label: "Book a demo", href: "/pilot" },
  secondaryCta: { label: "See workflow", href: "#workflow" },
};

export const metrics: Metric[] = [
  {
    value: "1,510",
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
    role: "Intro film",
    src: "/marketing/neumas/videos/neumas-intro-web.mp4",
    poster: marketingAssets.hero.src,
  },
  {
    title: "Receipt capture flow",
    role: "Product demo",
    src: "/marketing/neumas/videos/neumas-receipt-capture-demo.mp4",
    poster: marketingAssets.workflow.src,
  },
  {
    title: "Operations workflow",
    role: "Demo walkthrough",
    src: "/marketing/neumas/videos/neumas-operations-demo.mp4",
    poster: marketingAssets.cta.src,
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
