import type { Metadata } from "next";

import { buildAbsoluteUrl, buildBreadcrumbSchema, entityIds, publicPages, siteConfig, type JsonLd } from "@/lib/public-site";

export type PublicHub = {
  path: "/compare" | "/features" | "/research" | "/solutions" | "/use-cases";
  title: string;
  description: string;
  h1: string;
  intro: string;
};

export const publicHubs: PublicHub[] = [
  {
    path: "/features",
    title: "Restaurant Operations Software Features | Neumas",
    description: "Explore Neumas features for restaurant inventory, invoice processing, reordering, vendors, and multi-location F&B operations.",
    h1: "Restaurant operations software features.",
    intro: "Browse the Neumas capabilities that turn supplier documents and operating records into clearer inventory, vendor, and reorder context.",
  },
  {
    path: "/solutions",
    title: "Restaurant Operations Software Solutions | Neumas",
    description: "Explore Neumas solutions for restaurant inventory management, invoice intelligence, food cost control, procurement, and reordering.",
    h1: "Solutions for restaurant operations teams.",
    intro: "See how Neumas supports the connected F&B workflows behind inventory visibility, supplier invoices, food cost, procurement, and reordering.",
  },
  {
    path: "/use-cases",
    title: "Restaurant and F&B Software Use Cases | Neumas",
    description: "Explore Neumas use cases for restaurants, cafes, bakeries, cloud kitchens, and multi-outlet F&B groups.",
    h1: "F&B operations use cases.",
    intro: "Explore the operating contexts where cleaner inventory, invoice, vendor, and reorder data can help F&B teams make practical decisions.",
  },
  {
    path: "/research",
    title: "Restaurant Operations Research | Neumas",
    description: "Read Neumas research on restaurant inventory operations, receipt-to-reorder workflows, and food cost opportunity framing.",
    h1: "Restaurant operations research.",
    intro: "Short research briefs on the practical operating systems behind restaurant inventory, supplier documents, and reorder decisions.",
  },
  {
    path: "/compare",
    title: "Restaurant Operations Software Comparisons | Neumas",
    description: "Compare manual ordering and receipt scanning with restaurant inventory intelligence, vendor context, and reorder planning.",
    h1: "Compare restaurant operations workflows.",
    intro: "Practical comparisons for teams evaluating manual processes against a more connected inventory and operations workflow.",
  },
];

export function getPublicHub(path: string): PublicHub | undefined {
  return publicHubs.find((hub) => hub.path === path);
}

export function getHubChildren(hub: PublicHub) {
  return publicPages.filter((page) => page.path.startsWith(`${hub.path}/`));
}

export function buildHubMetadata(hub: PublicHub): Metadata {
  const canonicalUrl = buildAbsoluteUrl(hub.path);
  return {
    title: hub.title,
    description: hub.description,
    alternates: { canonical: canonicalUrl },
    openGraph: {
      type: "website",
      title: hub.title,
      description: hub.description,
      url: canonicalUrl,
      siteName: siteConfig.name,
      images: [{ url: siteConfig.ogImagePath, width: 1200, height: 630, alt: hub.title }],
    },
    twitter: { card: "summary_large_image", title: hub.title, description: hub.description, images: [siteConfig.ogImagePath] },
    robots: { index: true, follow: true, googleBot: { index: true, follow: true } },
  };
}

export function getHubSchemas(hub: PublicHub): JsonLd[] {
  const canonicalUrl = buildAbsoluteUrl(hub.path);
  return [
    {
      "@context": "https://schema.org",
      "@type": "CollectionPage",
      "@id": `${canonicalUrl}#webpage`,
      name: hub.title,
      description: hub.description,
      url: canonicalUrl,
      isPartOf: { "@id": entityIds.website },
      about: { "@id": entityIds.organization },
    },
    buildBreadcrumbSchema(hub.path),
  ];
}