import type { Metadata } from "next";

export type JsonLd = Record<string, unknown>;

export type IndexableContent = {
  slug: string;
  title: string;
  description: string;
  summary: string;
  publishedAt: string;
  updatedAt: string;
  category: string;
  keywords: string[];
  author: string;
  canonicalUrl: string;
};

export type ContentSeoContext = {
  siteName: string;
  ogImagePath: string;
  organizationId: string;
  websiteId: string;
};

function hasValue(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isValidDate(value: string): boolean {
  return !Number.isNaN(Date.parse(value));
}

export function validateIndexableContent<T extends IndexableContent>(content: T): T {
  const requiredTextFields: (keyof Pick<
    IndexableContent,
    "slug" | "title" | "description" | "summary" | "category" | "author" | "canonicalUrl"
  >)[] = ["slug", "title", "description", "summary", "category", "author", "canonicalUrl"];

  for (const field of requiredTextFields) {
    if (!hasValue(content[field])) {
      throw new Error(`Indexable content is missing required SEO field: ${field}`);
    }
  }

  if (!content.canonicalUrl.startsWith("https://")) {
    throw new Error(`Indexable content has an invalid canonical URL: ${content.canonicalUrl}`);
  }
  if (!Array.isArray(content.keywords) || content.keywords.length === 0 || !content.keywords.every(hasValue)) {
    throw new Error(`Indexable content is missing required SEO field: keywords`);
  }
  if (!isValidDate(content.publishedAt) || !isValidDate(content.updatedAt)) {
    throw new Error(`Indexable content must provide valid publishedAt and updatedAt dates`);
  }

  return content;
}

export function buildContentMetadata(content: IndexableContent, context: ContentSeoContext, article = false): Metadata {
  validateIndexableContent(content);
  return {
    title: content.title,
    description: content.description,
    keywords: content.keywords,
    alternates: { canonical: content.canonicalUrl },
    openGraph: {
      type: article ? "article" : "website",
      title: content.title,
      description: content.description,
      url: content.canonicalUrl,
      siteName: context.siteName,
      ...(article ? { publishedTime: content.publishedAt, modifiedTime: content.updatedAt } : {}),
      images: [{ url: context.ogImagePath, width: 1200, height: 630, alt: `${content.title} - ${context.siteName}` }],
    },
    twitter: {
      card: "summary_large_image",
      title: content.title,
      description: content.description,
      images: [context.ogImagePath],
    },
    robots: { index: true, follow: true, googleBot: { index: true, follow: true } },
  };
}

export function buildContentWebPageSchema(content: IndexableContent, context: ContentSeoContext): JsonLd {
  return {
    "@context": "https://schema.org",
    "@type": "WebPage",
    "@id": `${content.canonicalUrl}#webpage`,
    name: content.title,
    description: content.description,
    url: content.canonicalUrl,
    isPartOf: { "@id": context.websiteId },
    about: { "@id": context.organizationId },
  };
}

export function buildContentArticleSchema(content: IndexableContent, context: ContentSeoContext): JsonLd {
  return {
    "@context": "https://schema.org",
    "@type": "Article",
    "@id": `${content.canonicalUrl}#article`,
    headline: content.title,
    description: content.description,
    articleBody: content.summary,
    datePublished: content.publishedAt,
    dateModified: content.updatedAt,
    inLanguage: "en",
    author: { "@id": context.organizationId, name: content.author },
    publisher: { "@id": context.organizationId },
    mainEntityOfPage: { "@id": `${content.canonicalUrl}#webpage` },
  };
}

export function buildContentBreadcrumbSchema(
  content: IndexableContent,
  breadcrumbs: { name: string; item: string }[],
): JsonLd {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: breadcrumbs.map((crumb, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: crumb.name,
      item: crumb.item,
    })),
  };
}