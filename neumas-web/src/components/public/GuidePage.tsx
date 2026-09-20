import Link from "next/link";

import type { GuideContent, GuideSection } from "@/lib/guides";
import { getGuideBreadcrumbs, getGuideSchemas } from "@/lib/guides";

import { PublicSiteFooter, PublicSiteHeader } from "./PublicSiteChrome";
import { StructuredData } from "./StructuredData";

function sectionId(heading: string) {
  return heading.toLowerCase().replace(/[^a-z0-9]+/g, "-");
}

function formatDate(iso: string) {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}

const sectionLabel: Record<GuideSection["type"], string> = {
  definition: "Definitions",
  context: "Context",
  workflow: "Workflow",
  "failure-points": "Where this breaks down",
  metrics: "Metrics",
  example: "Illustrative example",
  "decision-framework": "Decision framework",
  "neumas-fit": "Where Neumas fits",
};

function GuideSectionBlock({ section, index }: { section: GuideSection; index: number }) {
  const id = sectionId(section.heading);
  const isNeumasFit = section.type === "neumas-fit";
  const isExample = section.type === "example";

  return (
    <section
      id={id}
      className={`rounded-[28px] border p-8 shadow-[0_10px_30px_rgba(15,23,42,0.04)] backdrop-blur-xl sm:p-10 ${
        isNeumasFit
          ? "border-[#0071a3]/20 bg-[#f0f7fb]"
          : isExample
            ? "border-black/[0.06] bg-[#fafaf7]"
            : "border-black/[0.06] bg-white/80"
      }`}
    >
      <p className="font-mono text-[11px] font-medium uppercase tracking-[0.18em] text-[#0071a3]">
        {sectionLabel[section.type]}
      </p>
      <h2 className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-gray-950 sm:text-3xl">
        {index + 1}. {section.heading}
      </h2>
      {section.body.map((paragraph) => (
        <p key={paragraph.slice(0, 40)} className="mt-4 max-w-4xl text-base leading-8 text-gray-600 sm:text-lg">
          {paragraph}
        </p>
      ))}
      {section.bullets ? (
        <ul className="mt-6 grid gap-3 text-sm leading-7 text-gray-600 sm:text-base">
          {section.bullets.map((bullet) => (
            <li key={bullet} className="rounded-2xl bg-[#f5f7fb] px-4 py-3">
              {bullet}
            </li>
          ))}
        </ul>
      ) : null}
      {section.relatedLinks?.length ? (
        <ul className="mt-6 flex flex-wrap gap-3">
          {section.relatedLinks.map((link) => (
            <li key={link.href}>
              <Link
                href={link.href}
                className="inline-flex items-center gap-1 rounded-full border border-[#0071a3]/30 bg-white px-4 py-2 text-sm font-semibold text-[#0071a3] transition hover:bg-[#0071a3] hover:text-white"
              >
                {link.label} →
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

export function GuidePage({ guide }: { guide: GuideContent }) {
  const breadcrumbs = getGuideBreadcrumbs(guide);

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#fafafa_0%,#f5f7fb_36%,#ffffff_100%)] text-gray-900">
      <StructuredData data={getGuideSchemas(guide)} />
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
                <p className="font-mono text-[11px] font-medium uppercase tracking-[0.18em] text-[#0071a3]">Guide</p>
                <h1 className="mt-4 max-w-4xl text-4xl font-semibold tracking-[-0.04em] text-gray-950 sm:text-5xl">
                  {guide.h1}
                </h1>
                <p className="mt-6 max-w-3xl text-lg leading-8 text-gray-600">{guide.dek}</p>
                <p className="mt-6 text-sm text-gray-500">
                  By the Neumas team · Published {formatDate(guide.publishedAt)}
                  {guide.updatedAt !== guide.publishedAt ? ` · Updated ${formatDate(guide.updatedAt)}` : ""} ·{" "}
                  {guide.readingTime}
                </p>
              </div>

              <aside className="rounded-[28px] border border-black/[0.06] bg-white/80 p-6 shadow-[0_10px_30px_rgba(15,23,42,0.04)] backdrop-blur-xl">
                <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-gray-700">On this page</h2>
                <ul className="mt-5 space-y-3">
                  {guide.sections.map((section) => (
                    <li key={section.heading}>
                      <a
                        href={`#${sectionId(section.heading)}`}
                        className="text-sm leading-6 text-gray-600 transition-colors hover:text-gray-900"
                      >
                        {section.heading}
                      </a>
                    </li>
                  ))}
                  <li>
                    <a href="#faq" className="text-sm leading-6 text-gray-600 transition-colors hover:text-gray-900">
                      FAQ
                    </a>
                  </li>
                  <li>
                    <a href="#sources" className="text-sm leading-6 text-gray-600 transition-colors hover:text-gray-900">
                      Sources
                    </a>
                  </li>
                </ul>
              </aside>
            </div>
          </div>
        </section>

        <section className="px-5 pb-16 sm:px-8 sm:pb-20">
          <div className="mx-auto max-w-6xl space-y-6">
            {guide.sections.map((section, index) => (
              <GuideSectionBlock key={section.heading} section={section} index={index} />
            ))}

            {guide.faq.length ? (
              <section
                id="faq"
                className="rounded-[28px] border border-black/[0.06] bg-white/80 p-8 shadow-[0_10px_30px_rgba(15,23,42,0.04)] backdrop-blur-xl sm:p-10"
              >
                <h2 className="text-2xl font-semibold tracking-[-0.03em] text-gray-950 sm:text-3xl">
                  Frequently asked questions
                </h2>
                <dl className="mt-8 space-y-6">
                  {guide.faq.map((item) => (
                    <div key={item.question}>
                      <dt className="text-lg font-semibold text-gray-900">{item.question}</dt>
                      <dd className="mt-2 text-base leading-8 text-gray-600">{item.answer}</dd>
                    </div>
                  ))}
                </dl>
              </section>
            ) : null}

            {guide.citations.length ? (
              <section
                id="sources"
                className="rounded-[28px] border border-black/[0.06] bg-white/80 p-8 shadow-[0_10px_30px_rgba(15,23,42,0.04)] backdrop-blur-xl sm:p-10"
              >
                <h2 className="text-2xl font-semibold tracking-[-0.03em] text-gray-950 sm:text-3xl">Sources</h2>
                <p className="mt-4 max-w-4xl text-base leading-7 text-gray-600">
                  External statistics referenced in this guide, with their original source and publication date.
                </p>
                <ul className="mt-6 space-y-4">
                  {guide.citations.map((citation) => (
                    <li key={citation.url} className="rounded-2xl bg-[#f5f7fb] px-5 py-4">
                      <p className="text-sm leading-6 text-gray-700">{citation.claim}</p>
                      <p className="mt-2 text-xs text-gray-500">
                        <a href={citation.url} target="_blank" rel="noopener noreferrer" className="text-[#0071a3] hover:underline">
                          {citation.source}
                        </a>{" "}
                        · {formatDate(citation.publishedDate)}
                      </p>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            <section className="grid gap-6 lg:grid-cols-[1fr_0.9fr]">
              <div className="rounded-[28px] border border-black/[0.06] bg-[#0f172a] p-8 text-white shadow-[0_14px_40px_rgba(15,23,42,0.16)] sm:p-10">
                <h2 className="text-2xl font-semibold tracking-[-0.03em] sm:text-3xl">{guide.ctaTitle}</h2>
                <p className="mt-4 max-w-2xl text-base leading-8 text-white/72 sm:text-lg">{guide.ctaBody}</p>
                <div className="mt-8 flex flex-wrap gap-3">
                  <Link
                    href="/pilot"
                    className="rounded-full bg-white px-5 py-3 text-sm font-semibold text-[#0f172a] transition hover:bg-white/90"
                  >
                    Start a pilot
                  </Link>
                  <Link
                    href="/"
                    className="rounded-full border border-white/20 px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/8"
                  >
                    Back to homepage
                  </Link>
                </div>
              </div>

              <aside className="rounded-[28px] border border-black/[0.06] bg-white/80 p-8 shadow-[0_10px_30px_rgba(15,23,42,0.04)] backdrop-blur-xl sm:p-10">
                <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-gray-700">Related solutions</h2>
                <ul className="mt-5 space-y-3">
                  {guide.relatedSolutionLinks.map((link) => (
                    <li key={link.href}>
                      <Link href={link.href} className="text-base leading-7 text-gray-600 transition-colors hover:text-gray-900">
                        {link.label}
                      </Link>
                    </li>
                  ))}
                  <li>
                    <Link href="/guides" className="text-base leading-7 text-gray-600 transition-colors hover:text-gray-900">
                      All guides
                    </Link>
                  </li>
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
