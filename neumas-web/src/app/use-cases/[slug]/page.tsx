import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PublicPage } from "@/components/public/PublicPage";
import { buildPublicMetadata, getPublicPage } from "@/lib/public-site";

const useCaseSlugs = ["restaurants", "cafes-bakeries", "cloud-kitchens", "multi-outlet-groups"];

export function generateStaticParams() {
  return useCaseSlugs.map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const page = getPublicPage(`/use-cases/${slug}`);
  return page ? buildPublicMetadata(page) : {};
}

export default async function UseCasePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const page = getPublicPage(`/use-cases/${slug}`);
  if (!page) notFound();
  return <PublicPage page={page} />;
}
