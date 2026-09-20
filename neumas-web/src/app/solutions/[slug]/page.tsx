import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PublicPage } from "@/components/public/PublicPage";
import { buildPublicMetadata, getPublicPage } from "@/lib/public-site";

const solutionSlugs = [
  "invoice-intelligence",
  "restaurant-inventory-management",
  "food-cost-control",
  "procurement-intelligence",
  "predictive-reordering",
];

export function generateStaticParams() {
  return solutionSlugs.map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const page = getPublicPage(`/solutions/${slug}`);
  return page ? buildPublicMetadata(page) : {};
}

export default async function SolutionPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const page = getPublicPage(`/solutions/${slug}`);
  if (!page) notFound();
  return <PublicPage page={page} />;
}
