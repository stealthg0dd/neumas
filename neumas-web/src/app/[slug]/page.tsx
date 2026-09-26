import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { PublicPage } from "@/components/public/PublicPage";
import { buildPublicMetadata, getPublicPage, publicPages } from "@/lib/public-site";

const rootSeoSlugs = new Set([
  "autonomous-procurement",
  "restaurant-procurement-software",
  "food-cost-management",
  "restaurant-inventory-management",
  "supplier-management",
  "purchase-order-automation",
  "invoice-reconciliation",
  "restaurant-demand-forecasting",
  "recipe-costing",
  "food-waste-management",
  "multi-location-restaurants",
  "hotel-food-procurement",
]);

export function generateStaticParams() {
  return publicPages
    .filter((page) => {
      const slug = page.path.replace("/", "");
      return rootSeoSlugs.has(slug);
    })
    .map((page) => ({ slug: page.path.replace("/", "") }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const page = getPublicPage(`/${slug}`);
  return page ? buildPublicMetadata(page) : {};
}

export default async function RootPublicSlugPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const page = getPublicPage(`/${slug}`);
  if (!page) notFound();
  return <PublicPage page={page} />;
}
