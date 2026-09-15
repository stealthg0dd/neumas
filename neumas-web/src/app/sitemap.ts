import type { MetadataRoute } from "next";

import { buildAbsoluteUrl, publicPages } from "@/lib/public-site";

function getChangeFrequency(path: string): MetadataRoute.Sitemap[number]["changeFrequency"] {
  return path.startsWith("/research/") ? "monthly" : "weekly";
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const publicEntries: MetadataRoute.Sitemap = [
    {
      url: buildAbsoluteUrl("/"),
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 1,
    },
    ...publicPages.map((page) => ({
      url: buildAbsoluteUrl(page.path),
      lastModified: new Date(),
      changeFrequency: getChangeFrequency(page.path),
      priority: page.path.startsWith("/features/") || page.path.startsWith("/use-cases/") ? 0.8 : 0.7,
    })),
  ];

  return publicEntries;
}
