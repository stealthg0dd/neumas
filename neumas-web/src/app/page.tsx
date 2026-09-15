import type { Metadata } from "next";

import { AuthRedirectIfLoggedIn } from "@/components/auth-redirect";
import { MarketingV2Page } from "@/components/marketing/neumas-v2";
import { getApprovedMarketingCmsContent } from "@/components/marketing/neumas-v2/marketing-cms";
import { StructuredData } from "@/components/public/StructuredData";
import { buildAbsoluteUrl, getHomepageSchemas, siteConfig } from "@/lib/public-site";

export const metadata: Metadata = {
  title: "Neumas — AI Operations for F&B",
  description: siteConfig.description,
  keywords: [
    "Neumas",
    "AI operations for F&B",
    "restaurant inventory software",
    "receipt processing",
    "invoice processing",
    "inventory intelligence",
    "reorder planning",
    "vendor intelligence",
    "multi-location F&B operations",
  ],
  alternates: {
    canonical: buildAbsoluteUrl("/"),
  },
  openGraph: {
    title: "Neumas — AI Operations for F&B",
    description: siteConfig.description,
    url: buildAbsoluteUrl("/"),
    type: "website",
    siteName: siteConfig.name,
    images: [
      {
        url: siteConfig.ogImagePath,
        width: 1200,
        height: 630,
        alt: "Neumas AI operations for F&B homepage",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Neumas — AI Operations for F&B",
    description: siteConfig.description,
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

/**
 * Public homepage. The previous consumer landing component remains in the
 * codebase for rollback, but "/" now renders the B2B F&B marketing experience.
 */
export default async function RootPage() {
  const cmsContent = await getApprovedMarketingCmsContent();
  return (
    <>
      <StructuredData data={getHomepageSchemas()} />
      <AuthRedirectIfLoggedIn />
      <MarketingV2Page cmsContent={cmsContent} />
    </>
  );
}
