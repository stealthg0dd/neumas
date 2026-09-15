import Link from "next/link";

import type { PublicPageContent } from "@/lib/public-site";
import { getPublicPageSchemas, makeBreadcrumbs } from "@/lib/public-site";

import { PublicSiteFooter, PublicSiteHeader } from "./PublicSiteChrome";
import { StructuredData } from "./StructuredData";

const requiredLongFormPaths = new Set([
  "/research/restaurant-inventory-operations",
  "/research/receipt-to-reorder",
  "/research/food-cost-benchmark",
  "/compare/manual-ordering-vs-ai-operations",
  "/compare/receipt-scanner-vs-inventory-intelligence",
  "/glossary",
  "/glossary/inventory-intelligence",
  "/glossary/receipt-invoice-processing",
  "/glossary/reorder-planning",
  "/about",
  "/contact",
  "/privacy",
  "/terms",
  "/security",
  "/data-processing",
  "/responsible-ai",
]);

export function PublicPage({ page }: { page: PublicPageContent }) {
  const breadcrumbs = makeBreadcrumbs(page.path);
  const needsLongForm = requiredLongFormPaths.has(page.path);

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#fafafa_0%,#f5f7fb_36%,#ffffff_100%)] text-gray-900">
      <StructuredData data={getPublicPageSchemas(page)} />
      <PublicSiteHeader />

      <main>
        <section className="px-5 pb-12 pt-16 sm:px-8 sm:pt-20">
          <div className="mx-auto max-w-6xl">
            <nav aria-label="Breadcrumb" className="mb-8">
              <ol className="flex flex-wrap items-center gap-2 text-sm text-gray-500">
                {breadcrumbs.map((crumb, index) => (
                  <li key={crumb.item} className="flex items-center gap-2">
                    {index > 0 ? <span aria-hidden>/</span> : null}
                    <Link href={crumb.item.replace(/^https?:\/\/[^/]+/, "") || "/"} className="hover:text-gray-900">
                      {crumb.name}
                    </Link>
                  </li>
                ))}
              </ol>
            </nav>

            <div className="grid gap-8 lg:grid-cols-[1.35fr_0.9fr] lg:items-start">
              <div className="rounded-[32px] border border-white/70 bg-white/70 p-8 shadow-[0_12px_40px_rgba(15,23,42,0.06)] backdrop-blur-xl sm:p-12">
                <p className="font-mono text-[11px] font-medium uppercase tracking-[0.18em] text-[#0071a3]">
                  {page.eyebrow}
                </p>
                <h1 className="mt-4 max-w-4xl text-4xl font-semibold tracking-[-0.04em] text-gray-950 sm:text-5xl lg:text-6xl">
                  {page.h1}
                </h1>
                <p className="mt-6 max-w-3xl text-lg leading-8 text-gray-600">{page.intro}</p>
              </div>

              <aside className="rounded-[28px] border border-black/[0.06] bg-white/80 p-6 shadow-[0_10px_30px_rgba(15,23,42,0.04)] backdrop-blur-xl">
                <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-gray-700">On this page</h2>
                <ul className="mt-5 space-y-3">
                  {page.sections.map((section) => (
                    <li key={section.title}>
                      <a
                        href={`#${section.title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}
                        className="text-sm leading-6 text-gray-600 transition-colors hover:text-gray-900"
                      >
                        {section.title}
                      </a>
                    </li>
                  ))}
                </ul>
              </aside>
            </div>
          </div>
        </section>

        <section className="px-5 pb-16 sm:px-8 sm:pb-20">
          <div className="mx-auto max-w-6xl space-y-6">
            {page.sections.map((section, index) => {
              const sectionId = section.title.toLowerCase().replace(/[^a-z0-9]+/g, "-");
              return (
                <section
                  key={section.title}
                  id={sectionId}
                  className="rounded-[28px] border border-black/[0.06] bg-white/80 p-8 shadow-[0_10px_30px_rgba(15,23,42,0.04)] backdrop-blur-xl sm:p-10"
                >
                  <h2 className="text-2xl font-semibold tracking-[-0.03em] text-gray-950 sm:text-3xl">
                    {index + 1}. {section.title}
                  </h2>
                  <p className="mt-4 max-w-4xl text-base leading-8 text-gray-600 sm:text-lg">{section.body}</p>
                  {section.bullets ? (
                    <ul className="mt-6 grid gap-3 text-sm leading-7 text-gray-600 sm:text-base">
                      {section.bullets.map((bullet) => (
                        <li key={bullet} className="rounded-2xl bg-[#f5f7fb] px-4 py-3">
                          {bullet}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </section>
              );
            })}

            {needsLongForm ? (
              <section className="rounded-[28px] border border-black/[0.06] bg-white/80 p-8 shadow-[0_10px_30px_rgba(15,23,42,0.04)] backdrop-blur-xl sm:p-10">
                <h2 className="text-2xl font-semibold tracking-[-0.03em] text-gray-950 sm:text-3xl">
                  Practical Workflow Context
                </h2>
                <p className="mt-4 max-w-4xl text-base leading-8 text-gray-600 sm:text-lg">
                  Neumas content is written for practical F&B decision-making, not abstract AI branding. In real operations,
                  planning breaks when invoices, receipts, inventory movement, vendor records, and consumption history live in
                  disconnected systems. The product workflow exists to reduce that fragmentation. Documents are captured, line
                  items are structured, stock records are updated, and planning signals are surfaced with confidence context.
                  The value is not just in one dashboard screen. The value is in repeated operating behavior: clearer stock
                  records, fewer surprise shortages, better reorder timing, and more useful vendor context across outlets.
                  When operators, partners, or investors read these pages, the intended takeaway is that Neumas treats F&B
                  operations as a system problem with measurable workflow consequences.
                </p>

                <h3 className="mt-10 text-xl font-semibold tracking-[-0.02em] text-gray-950 sm:text-2xl">
                  Limitations, Boundaries, and Responsible Claims
                </h3>
                <p className="mt-4 max-w-4xl text-base leading-8 text-gray-600 sm:text-lg">
                  A trustworthy AI product should define what it does not claim. Neumas does not claim perfect extraction,
                  universal automatic supplier ordering, fake customer outcomes, unsupported connectors, or certifications that
                  are not formally achieved. Output quality can vary with receipt clarity, invoice format, vendor naming, and
                  operational changes. That is why confidence signaling, review paths, and approval workflows are product
                  requirements. Public pages are indexable because buyers and evaluators deserve clarity before login. Private
                  operational data is not part of that public layer.
                </p>

                <h3 className="mt-10 text-xl font-semibold tracking-[-0.02em] text-gray-950 sm:text-2xl">
                  Singapore and Southeast Asia Relevance
                </h3>
                <p className="mt-4 max-w-4xl text-base leading-8 text-gray-600 sm:text-lg">
                  F&B operations in Singapore and Southeast Asia combine fragmented suppliers, outlet-specific workflows, mixed
                  receipt and invoice quality, and fast-changing demand. Item naming conventions, pack sizes, and vendor terms
                  can vary across outlets and markets. Neumas design choices reflect that operational diversity. We prioritize
                  resilient ingestion, adaptable normalization, and interpretable recommendation outputs over brittle precision
                  claims. For partners, this means integration discussions can start from realistic operating behavior, not
                  hypothetical ideal data. If you are evaluating fit, read this page together with
                  <Link href="/how-it-works" className="ml-1 text-[#0071a3] hover:underline">How it works</Link>,
                  <Link href="/privacy" className="ml-1 text-[#0071a3] hover:underline">Privacy</Link>,
                  <Link href="/security" className="ml-1 text-[#0071a3] hover:underline">Security</Link>, and
                  <Link href="/contact" className="ml-1 text-[#0071a3] hover:underline">Contact</Link>
                  to assess product, data, and governance posture in one coherent flow.
                </p>
              </section>
            ) : null}

            {page.faq?.length ? (
              <section className="rounded-[28px] border border-black/[0.06] bg-white/80 p-8 shadow-[0_10px_30px_rgba(15,23,42,0.04)] backdrop-blur-xl sm:p-10">
                <h2 className="text-2xl font-semibold tracking-[-0.03em] text-gray-950 sm:text-3xl">Frequently asked questions</h2>
                <dl className="mt-8 space-y-6">
                  {page.faq.map((item) => (
                    <div key={item.question}>
                      <dt className="text-lg font-semibold text-gray-900">{item.question}</dt>
                      <dd className="mt-2 text-base leading-8 text-gray-600">{item.answer}</dd>
                    </div>
                  ))}
                </dl>
              </section>
            ) : null}

            <section className="grid gap-6 lg:grid-cols-[1fr_0.9fr]">
              <div className="rounded-[28px] border border-black/[0.06] bg-[#0f172a] p-8 text-white shadow-[0_14px_40px_rgba(15,23,42,0.16)] sm:p-10">
                <h2 className="text-2xl font-semibold tracking-[-0.03em] sm:text-3xl">
                  {page.ctaTitle ?? "Start with the public overview, then try the product."}
                </h2>
                <p className="mt-4 max-w-2xl text-base leading-8 text-white/72 sm:text-lg">
                  {page.ctaBody ?? "Neumas keeps core company and product information public while private dashboards remain authenticated and protected."}
                </p>
                <div className="mt-8 flex flex-wrap gap-3">
                  <Link href="/auth" className="rounded-full bg-white px-5 py-3 text-sm font-semibold text-[#0f172a] transition hover:bg-white/90">
                    Start free
                  </Link>
                  <Link href="/" className="rounded-full border border-white/20 px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/8">
                    Back to homepage
                  </Link>
                </div>
              </div>

              <aside className="rounded-[28px] border border-black/[0.06] bg-white/80 p-8 shadow-[0_10px_30px_rgba(15,23,42,0.04)] backdrop-blur-xl sm:p-10">
                <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-gray-700">Related pages</h2>
                <ul className="mt-5 space-y-3">
                  {page.relatedLinks.map((link) => (
                    <li key={`${page.path}-${link.href}-${link.label}`}>
                      <Link href={link.href} className="text-base leading-7 text-gray-600 transition-colors hover:text-gray-900">
                        {link.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </aside>
            </section>
          </div>
        </section>
      </main>

      <PublicSiteFooter />
    </div>
  );
}
