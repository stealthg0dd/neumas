import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PublicPage } from "@/components/public/PublicPage";
import { buildPublicMetadata, getPublicPage } from "@/lib/public-site";

const featureSlugs = [
  "receipt-invoice-processing",
  "inventory-intelligence",
  "reorder-planning",
  "vendor-intelligence",
  "multi-location-operations",
];

export function generateStaticParams() {
  return featureSlugs.map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const page = getPublicPage(`/features/${slug}`);
  return page ? buildPublicMetadata(page) : {};
}

export default async function FeaturePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const page = getPublicPage(`/features/${slug}`);
  if (!page) notFound();
  return <PublicPage page={page} />;
}
