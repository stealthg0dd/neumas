import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, CheckCircle2, ScanSearch, Sparkles, TrendingDown } from "lucide-react";

import { buildAbsoluteUrl, buildOrganizationSchema, buildWebPageSchema, buildWebSiteSchema, entityIds, siteConfig } from "@/lib/public-site";
import { StructuredData } from "@/components/public/StructuredData";

const PAGE_TITLE = "Menu X-Ray — Analyse Your Menu Economics | Neumas";
const PAGE_DESCRIPTION =
  "Upload a restaurant menu to reveal estimated food cost, ingredient exposure, margin-risk dishes and monthly opportunity. Free to try. No supplier data required.";
const CANONICAL = buildAbsoluteUrl("/menu-xray");

export const metadata: Metadata = {
  title: PAGE_TITLE,
  description: PAGE_DESCRIPTION,
  alternates: { canonical: CANONICAL },
  openGraph: {
    title: PAGE_TITLE,
    description: PAGE_DESCRIPTION,
    url: CANONICAL,
    type: "website",
    siteName: siteConfig.name,
    images: [{ url: siteConfig.ogImagePath, width: 1200, height: 630, alt: "Neumas Menu X-Ray — restaurant menu economics analysis" }],
  },
  twitter: {
    card: "summary_large_image",
    title: PAGE_TITLE,
    description: PAGE_DESCRIPTION,
    images: [siteConfig.ogImagePath],
  },
  robots: { index: true, follow: true },
};

function buildMenuXRaySchemas() {
  return [
    buildOrganizationSchema(),
    buildWebSiteSchema(),
    buildWebPageSchema({ path: "/menu-xray", title: PAGE_TITLE, description: PAGE_DESCRIPTION }),
    {
      "@context": "https://schema.org",
      "@type": "WebApplication",
      "@id": `${CANONICAL}#application`,
      name: "Neumas Menu X-Ray",
      description:
        "Menu X-Ray analyses restaurant menus to estimate ingredient exposure, food-cost pressure, margin-risk dishes and potential operational opportunities. It is an entry point into the Neumas autonomous procurement platform.",
      url: CANONICAL,
      applicationCategory: "BusinessApplication",
      operatingSystem: "Web",
      offers: {
        "@type": "Offer",
        price: "0",
        priceCurrency: "USD",
        description: "Free to try — upload a menu and receive an estimated economics analysis.",
      },
      provider: { "@id": entityIds.organization },
      publisher: { "@id": entityIds.organization },
      featureList: [
        "Dish-level food cost estimation",
        "Ingredient exposure analysis",
        "Margin signal classification (Healthy, Watch, Margin Risk)",
        "Category economics breakdown",
        "Simulate Fix interactive adjustments",
        "Margin opportunity prioritisation",
      ],
    },
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: [
        {
          "@type": "Question",
          name: "What is Neumas Menu X-Ray?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "Menu X-Ray is a free tool from Neumas that analyses a restaurant or F&B menu PDF or image to estimate food cost percentages, ingredient exposures, and margin risks per dish. It is designed for F&B operators and restaurant groups.",
          },
        },
        {
          "@type": "Question",
          name: "How accurate are Menu X-Ray estimates?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "Menu X-Ray uses AI to infer ingredient costs from typical market benchmarks. Estimates indicate direction and relative risk rather than exact figures. Connecting real supplier invoices, recipes, and inventory through Neumas produces verified economics.",
          },
        },
        {
          "@type": "Question",
          name: "Is Menu X-Ray only for restaurants?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "Menu X-Ray works for any F&B operator with a priced menu, including restaurants, cafes, cloud kitchens, hotel F&B, and catering operations.",
          },
        },
        {
          "@type": "Question",
          name: "What happens after Menu X-Ray?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "Menu X-Ray is an entry point into Neumas. After reviewing estimated economics, operators can connect real supplier data, recipes, and inventory to move from estimated to verified margin intelligence and automate procurement decisions.",
          },
        },
      ],
    },
  ];
}

export default function MenuXRayPublicPage() {
  return (
    <>
      <StructuredData data={buildMenuXRaySchemas()} />
      <main className="bg-[#f8fbff]">

        {/* ── Hero ──────────────────────────────────────────────────────────── */}
        <section className="mx-auto max-w-5xl px-6 py-16 sm:py-24">
          <div className="max-w-2xl">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#0b4fd8] mb-4">
              Neumas Menu X-Ray
            </p>
            <h1 className="text-4xl font-bold tracking-tight text-[#0b1736] sm:text-5xl leading-tight">
              See the economics hiding inside your menu.
            </h1>
            <p className="mt-5 text-lg leading-8 text-slate-600 max-w-xl">
              Upload a restaurant or café menu and Neumas will estimate food cost percentages,
              flag margin-risk dishes, surface ingredient exposure, and quantify monthly opportunity.
              No supplier data required to start.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
              <Link
                href="/onboard/menu-xray"
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#0071a3] px-6 py-3.5 text-sm font-bold text-white shadow-sm hover:bg-[#005f8a]"
              >
                <ScanSearch className="h-4 w-4" />
                X-Ray My Menu
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href="/#platform"
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-[#0b1736]/15 bg-white px-6 py-3.5 text-sm font-bold text-[#0b1736] hover:border-[#0b4fd8]/40"
              >
                Explore the Platform
              </Link>
            </div>
          </div>
        </section>

        {/* ── What you get ─────────────────────────────────────────────────── */}
        <section className="bg-white py-16">
          <div className="mx-auto max-w-5xl px-6">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#0b4fd8] mb-6">What Menu X-Ray delivers</p>
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {[
                {
                  icon: ScanSearch,
                  title: "Dish-level food cost",
                  body: "Every dish on your menu gets an estimated ingredient cost, food cost percentage, and a margin signal — Healthy, Watch, or Margin Risk.",
                },
                {
                  icon: TrendingDown,
                  title: "Ingredient exposure",
                  body: "See which ingredients are driving the most cost pressure across your menu, and how many dishes share a single supply risk.",
                },
                {
                  icon: Sparkles,
                  title: "Margin opportunities",
                  body: "AI-ranked list of procurement, pricing, waste, and recipe opportunities — each with estimated per-dish saving and effort rating.",
                },
                {
                  icon: CheckCircle2,
                  title: "Category economics",
                  body: "Average food cost percentage by category so you can see which parts of your menu are healthy and which need attention.",
                },
                {
                  icon: Sparkles,
                  title: "Simulate Fix",
                  body: "Adjust ingredient cost or portion size assumptions and watch the food cost percentage recalculate instantly, per dish.",
                },
                {
                  icon: TrendingDown,
                  title: "Monthly opportunity",
                  body: "An estimated monthly margin recovery figure based on the aggregate gap between your current economics and an achievable benchmark.",
                },
              ].map(({ icon: Icon, title, body }) => (
                <div key={title} className="rounded-xl border border-gray-100 bg-[#f8fbff] p-5">
                  <Icon className="h-5 w-5 text-[#0071a3] mb-3" />
                  <h2 className="text-[14px] font-bold text-gray-900 mb-1.5">{title}</h2>
                  <p className="text-[13px] text-slate-600 leading-relaxed">{body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── How it works ─────────────────────────────────────────────────── */}
        <section className="py-16">
          <div className="mx-auto max-w-5xl px-6">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#0b4fd8] mb-6">How it works</p>
            <div className="grid gap-5 sm:grid-cols-3">
              {[
                { step: "1", title: "Upload your menu", body: "Drop a PDF, JPEG, PNG or WebP of your menu — up to 20 MB. Menu photos and printed menus both work." },
                { step: "2", title: "Neumas analyses it", body: "AI extracts dishes, infers ingredient compositions, estimates costs against market benchmarks, and scores each dish." },
                { step: "3", title: "Review your economics", body: "See food cost percentages, margin signals, ingredient exposures, and prioritised opportunities in a clear dashboard." },
              ].map(({ step, title, body }) => (
                <div key={step} className="flex gap-4">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 border-[#0071a3] text-[13px] font-bold text-[#0071a3]">
                    {step}
                  </div>
                  <div>
                    <h3 className="text-[14px] font-bold text-gray-900 mb-1">{title}</h3>
                    <p className="text-[13px] text-slate-600 leading-relaxed">{body}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── From estimated to verified ───────────────────────────────────── */}
        <section className="bg-white py-16">
          <div className="mx-auto max-w-5xl px-6">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#0b4fd8] mb-6">From estimated to verified</p>
            <div className="grid gap-8 lg:grid-cols-2 lg:items-center">
              <div>
                <h2 className="text-3xl font-bold text-[#0b1736] leading-tight mb-4">
                  Menu X-Ray is the start, not the end.
                </h2>
                <p className="text-base leading-7 text-slate-600 mb-5">
                  Estimates from a menu give you direction. Neumas can then connect real recipes,
                  supplier invoices, purchase orders, inventory, and demand to replace estimates with
                  verified economics — and progressively automate the procurement decisions that protect margin.
                </p>
                <ul className="space-y-2.5 text-sm text-slate-600">
                  {[
                    "ESTIMATED → upload your menu, see the direction",
                    "VERIFIED → connect supplier data, recipes, and invoices",
                    "ACTION → autonomous procurement with human oversight",
                  ].map((item) => (
                    <li key={item} className="flex items-start gap-2.5">
                      <CheckCircle2 className="h-4 w-4 shrink-0 text-[#0071a3] mt-0.5" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="rounded-2xl border border-[#0071a3]/15 bg-gradient-to-br from-[#f0f7fb] to-white p-6">
                <p className="text-[11px] font-bold uppercase tracking-widest text-[#0071a3] mb-3">Neumas Platform</p>
                <p className="text-[15px] font-bold text-gray-900 mb-2">
                  Autonomous procurement for the food economy
                </p>
                <p className="text-[13px] text-slate-600 mb-5">
                  Neumas connects menus, demand, inventory, recipes, suppliers, purchasing, deliveries
                  and invoices to protect margin and progressively automate procurement.
                </p>
                <Link
                  href="/onboard/menu-xray"
                  className="inline-flex items-center gap-2 rounded-lg bg-amber-500 px-5 py-3 text-sm font-bold text-white hover:bg-amber-600"
                >
                  <ScanSearch className="h-4 w-4" />
                  X-Ray My Menu — Free
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            </div>
          </div>
        </section>

        {/* ── FAQ ──────────────────────────────────────────────────────────── */}
        <section className="py-16">
          <div className="mx-auto max-w-3xl px-6">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#0b4fd8] mb-6">Frequently asked questions</p>
            <div className="space-y-5">
              {[
                {
                  q: "What file formats does Menu X-Ray accept?",
                  a: "PDF, JPEG, PNG, and WebP up to 20 MB. Scanned menus, photographed menus, and digital PDFs all work.",
                },
                {
                  q: "How accurate are the food cost estimates?",
                  a: "Estimates are based on AI inference from typical market benchmarks for the detected ingredients. They indicate direction and relative risk — not precise invoice costs. Connecting supplier data through Neumas produces verified figures.",
                },
                {
                  q: "Is my menu data private?",
                  a: "Analysis results are private by default. Only you can view your results once authenticated. You can optionally generate a private share link.",
                },
                {
                  q: "Is Menu X-Ray free?",
                  a: "Menu X-Ray is free to try. You can also try a sample menu without uploading anything.",
                },
                {
                  q: "What is Neumas?",
                  a: "Neumas is an autonomous procurement, margin intelligence and agentic-commerce platform for the food economy. It connects menus, demand, inventory, recipes, suppliers, purchasing, deliveries and invoices to help F&B operators protect margin and progressively automate procurement. It is B2B software for restaurants, cafes, cloud kitchens, hotel kitchens, and multi-location F&B operators.",
                },
              ].map(({ q, a }) => (
                <div key={q} className="rounded-xl border border-gray-100 bg-white p-5">
                  <h3 className="text-[14px] font-bold text-gray-900 mb-2">{q}</h3>
                  <p className="text-[13px] text-slate-600 leading-relaxed">{a}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── CTA ──────────────────────────────────────────────────────────── */}
        <section className="bg-[#0b1736] py-16">
          <div className="mx-auto max-w-3xl px-6 text-center">
            <h2 className="text-3xl font-bold text-white mb-4">Start with your menu.</h2>
            <p className="text-slate-300 text-base leading-7 mb-8">
              Upload a PDF or photo of your menu and get an estimated economics report in seconds.
              No supplier data or account required to start.
            </p>
            <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
              <Link
                href="/onboard/menu-xray"
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-amber-400 px-6 py-3.5 text-sm font-bold text-[#0b1736] hover:bg-amber-300"
              >
                <ScanSearch className="h-4 w-4" />
                X-Ray My Menu — Free
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href="/pilot"
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-white/20 px-6 py-3.5 text-sm font-bold text-white hover:border-white/40"
              >
                See Neumas in Action
              </Link>
            </div>
          </div>
        </section>

      </main>
    </>
  );
}
