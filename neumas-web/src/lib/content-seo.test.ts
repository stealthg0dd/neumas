import { describe, expect, it } from "vitest";

import {
  buildContentArticleSchema,
  buildContentBreadcrumbSchema,
  buildContentMetadata,
  validateIndexableContent,
} from "@/lib/content-seo";

const context = {
  siteName: "Neumas",
  ogImagePath: "/opengraph-image",
  organizationId: "https://www.neumas.cc/#organization",
  websiteId: "https://www.neumas.cc/#website",
};

const content = {
  slug: "inventory-guide",
  title: "Inventory Guide",
  description: "A concise inventory guide for F&B teams.",
  summary: "A practical summary for F&B operators.",
  publishedAt: "2026-09-20",
  updatedAt: "2026-09-20",
  category: "Guide",
  keywords: ["inventory", "F&B"],
  author: "Neumas",
  canonicalUrl: "https://www.neumas.cc/guides/inventory-guide",
};

describe("content SEO contract", () => {
  it("rejects an indexable definition without required metadata", () => {
    expect(() => validateIndexableContent({ ...content, description: "" })).toThrow("description");
  });

  it("builds canonical metadata and entity-connected article schemas", () => {
    const metadata = buildContentMetadata(content, context, true);
    const article = buildContentArticleSchema(content, context);
    const breadcrumbs = buildContentBreadcrumbSchema(content, [
      { name: "Home", item: "https://www.neumas.cc" },
      { name: "Guides", item: "https://www.neumas.cc/guides" },
    ]);

    expect(metadata.alternates).toEqual({ canonical: content.canonicalUrl });
    expect(metadata.openGraph).toMatchObject({ type: "article", publishedTime: content.publishedAt });
    expect(article).toMatchObject({ dateModified: content.updatedAt, publisher: { "@id": context.organizationId } });
    expect(breadcrumbs).toMatchObject({ "@type": "BreadcrumbList" });
  });
});