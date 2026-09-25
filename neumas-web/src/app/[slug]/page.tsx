import { notFound } from "next/navigation";

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

export function generateMetadata({ params }: { params: { slug: string } }) {
  const page = getPublicPage(`/${params.slug}`);
  if (!page) return {};
  return buildPublicMetadata(page);
}

export default function RootPublicSlugPage({ params }: { params: { slug: string } }) {
  const page = getPublicPage(`/${params.slug}`);
  if (!page) notFound();
  return <PublicPage page={page} />;
}
