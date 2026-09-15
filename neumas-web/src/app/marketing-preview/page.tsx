import type { Metadata } from "next";

import { MarketingV2Page } from "@/components/marketing/neumas-v2";
import { getApprovedMarketingCmsContent } from "@/components/marketing/neumas-v2/marketing-cms";

export const metadata: Metadata = {
  title: "Neumas B2B Marketing Preview",
  description: "Internal preview of the Neumas F&B operations marketing site foundation.",
  robots: {
    index: false,
    follow: false,
    googleBot: {
      index: false,
      follow: false,
    },
  },
};

export default async function MarketingPreviewPage() {
  const cmsContent = await getApprovedMarketingCmsContent();
  return <MarketingV2Page cmsContent={cmsContent} />;
}
