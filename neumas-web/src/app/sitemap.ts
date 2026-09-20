import type { MetadataRoute } from "next";

import { buildAbsoluteUrl, publicPages } from "@/lib/public-site";
import { guides } from "@/lib/guides";
import { publicHubs } from "@/lib/public-hubs";

function getChangeFrequency(path: string): MetadataRoute.Sitemap[number]["changeFrequency"] {
  return path.startsWith("/research/") || path.startsWith("/guides/") ? "monthly" : "weekly";
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const publicEntries: MetadataRoute.Sitemap = [
    {
      url: buildAbsoluteUrl("/"),
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 1,
    },
    ...publicHubs.map((hub) => ({
      url: buildAbsoluteUrl(hub.path),
      lastModified: new Date(),
      changeFrequency: "monthly" as const,
      priority: 0.7,
    })),
    ...publicPages.map((page) => ({
      url: buildAbsoluteUrl(page.path),
      lastModified: new Date(),
      changeFrequency: getChangeFrequency(page.path),
      priority:
        page.path.startsWith("/features/") || page.path.startsWith("/use-cases/") || page.path.startsWith("/solutions/")
          ? 0.8
          : 0.7,
    })),
    {
      url: buildAbsoluteUrl("/guides"),
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 0.8,
    },
    ...guides.map((guide) => ({
      url: buildAbsoluteUrl(guide.path),
      lastModified: new Date(guide.updatedAt),
      changeFrequency: getChangeFrequency(guide.path),
      priority: 0.8,
    })),
  ];

  return publicEntries;
}
