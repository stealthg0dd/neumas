import type { Metadata } from "next";

import { MarketingV2Page } from "@/components/marketing/neumas-v2";

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

export default function MarketingPreviewPage() {
  return <MarketingV2Page />;
}
