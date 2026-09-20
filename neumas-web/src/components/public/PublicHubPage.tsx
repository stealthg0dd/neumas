import Link from "next/link";

import { getHubChildren, getHubSchemas, type PublicHub } from "@/lib/public-hubs";
import { makeBreadcrumbs } from "@/lib/public-site";

import { PublicSiteFooter, PublicSiteHeader } from "./PublicSiteChrome";
import { StructuredData } from "./StructuredData";

export function PublicHubPage({ hub }: { hub: PublicHub }) {
  const breadcrumbs = makeBreadcrumbs(hub.path);
  const children = getHubChildren(hub);

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#fafafa_0%,#f5f7fb_36%,#ffffff_100%)] text-gray-900">
      <StructuredData data={getHubSchemas(hub)} />
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
              <p className="font-mono text-[11px] font-medium uppercase tracking-[0.18em] text-[#0071a3]">Neumas</p>
              <h1 className="mt-4 max-w-3xl text-4xl font-semibold tracking-[-0.04em] text-gray-950 sm:text-5xl">{hub.h1}</h1>
              <p className="mt-6 max-w-3xl text-lg leading-8 text-gray-600">{hub.intro}</p>
            </div>
          </div>
        </section>
        <section className="px-5 pb-16 sm:px-8 sm:pb-20">
          <div className="mx-auto grid max-w-6xl gap-6 sm:grid-cols-2">
            {children.map((page) => (
              <Link key={page.path} href={page.path} className="rounded-[28px] border border-black/[0.06] bg-white/80 p-8 shadow-[0_10px_30px_rgba(15,23,42,0.04)] backdrop-blur-xl transition hover:border-[#0071a3]/30 sm:p-10">
                <p className="font-mono text-[11px] font-medium uppercase tracking-[0.18em] text-[#0071a3]">{page.eyebrow}</p>
                <h2 className="mt-4 text-2xl font-semibold tracking-[-0.03em] text-gray-950">{page.h1}</h2>
                <p className="mt-4 text-base leading-7 text-gray-600">{page.description}</p>
                <p className="mt-6 text-sm font-semibold text-[#0071a3]">Explore {page.eyebrow.toLowerCase()} →</p>
              </Link>
            ))}
          </div>
        </section>
      </main>
      <PublicSiteFooter />
    </div>
  );
}