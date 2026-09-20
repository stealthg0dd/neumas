import type { Metadata } from "next";
import Link from "next/link";

import { PublicSiteFooter, PublicSiteHeader } from "@/components/public/PublicSiteChrome";
import { StructuredData } from "@/components/public/StructuredData";
import { buildAbsoluteUrl, buildBreadcrumbSchema, entityIds, makeBreadcrumbs, siteConfig } from "@/lib/public-site";
import { guides } from "@/lib/guides";

const title = "Guides | Neumas";
const description =
  "In-depth, practical guides on restaurant inventory management and food cost control, written for F&B operators, finance teams, and multi-location groups.";

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: buildAbsoluteUrl("/guides") },
  openGraph: {
    type: "website",
    title,
    description,
    url: buildAbsoluteUrl("/guides"),
    siteName: siteConfig.name,
    images: [{ url: siteConfig.ogImagePath, width: 1200, height: 630, alt: title }],
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
    images: [siteConfig.ogImagePath],
  },
  robots: { index: true, follow: true, googleBot: { index: true, follow: true } },
};

export default function GuidesIndexPage() {
  const breadcrumbs = makeBreadcrumbs("/guides");
  const webPageSchema = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    "@id": `${buildAbsoluteUrl("/guides")}#webpage`,
    name: title,
    description,
    url: buildAbsoluteUrl("/guides"),
    isPartOf: { "@id": entityIds.website },
  };

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#fafafa_0%,#f5f7fb_36%,#ffffff_100%)] text-gray-900">
      <StructuredData data={[webPageSchema, buildBreadcrumbSchema("/guides")]} />
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

            <div className="rounded-[32px] border border-white/70 bg-white/70 p-8 shadow-[0_12px_40px_rgba(15,23,42,0.06)] backdrop-blur-xl sm:p-12">
              <p className="font-mono text-[11px] font-medium uppercase tracking-[0.18em] text-[#0071a3]">Guides</p>
              <h1 className="mt-4 max-w-3xl text-4xl font-semibold tracking-[-0.04em] text-gray-950 sm:text-5xl">
                Practical guides for F&amp;B operators
              </h1>
              <p className="mt-6 max-w-2xl text-lg leading-8 text-gray-600">
                In-depth, standalone resources on restaurant operations topics — written for restaurant operators, F&amp;B
                finance teams, and multi-location groups evaluating how to run a tighter back of house.
              </p>
            </div>
          </div>
        </section>

        <section className="px-5 pb-16 sm:px-8 sm:pb-20">
          <div className="mx-auto grid max-w-6xl gap-6 sm:grid-cols-2">
            {guides.map((guide) => (
              <Link
                key={guide.slug}
                href={guide.path}
                className="rounded-[28px] border border-black/[0.06] bg-white/80 p-8 shadow-[0_10px_30px_rgba(15,23,42,0.04)] backdrop-blur-xl transition hover:border-[#0071a3]/30 sm:p-10"
              >
                <p className="font-mono text-[11px] font-medium uppercase tracking-[0.18em] text-[#0071a3]">Guide</p>
                <h2 className="mt-4 text-2xl font-semibold tracking-[-0.03em] text-gray-950">{guide.h1}</h2>
                <p className="mt-4 text-base leading-7 text-gray-600">{guide.dek}</p>
                <p className="mt-6 text-sm font-semibold text-[#0071a3]">Read the guide →</p>
              </Link>
            ))}
          </div>
        </section>
      </main>

      <PublicSiteFooter />
    </div>
  );
}
