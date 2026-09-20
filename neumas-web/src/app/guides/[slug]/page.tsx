import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { GuidePage } from "@/components/public/GuidePage";
import { buildGuideMetadata, getGuide, guides } from "@/lib/guides";

export function generateStaticParams() {
  return guides.map((guide) => ({ slug: guide.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const guide = getGuide(slug);
  return guide ? buildGuideMetadata(guide) : {};
}

export default async function GuideSlugPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const guide = getGuide(slug);
  if (!guide) notFound();
  return <GuidePage guide={guide} />;
}
