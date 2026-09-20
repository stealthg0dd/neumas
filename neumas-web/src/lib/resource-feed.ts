import { guides } from "@/lib/guides";
import { siteConfig } from "@/lib/public-site";

function escapeXml(value: string): string {
  return value.replace(/[<>&'\"]/g, (character) => {
    const entities: Record<string, string> = {
      "<": "&lt;",
      ">": "&gt;",
      "&": "&amp;",
      "'": "&apos;",
      '"': "&quot;",
    };
    return entities[character];
  });
}

function toRfc822Date(date: string): string {
  return new Date(`${date}T00:00:00Z`).toUTCString();
}

export function buildResourceFeed(): string {
  const items = guides
    .map(
      (guide) => `
      <item>
        <title>${escapeXml(guide.title)}</title>
        <link>${escapeXml(guide.canonicalUrl)}</link>
        <guid isPermaLink="true">${escapeXml(guide.canonicalUrl)}</guid>
        <description>${escapeXml(guide.description)}</description>
        <category>${escapeXml(guide.category)}</category>
        <pubDate>${toRfc822Date(guide.publishedAt)}</pubDate>
        <dc:date>${guide.publishedAt}</dc:date>
        <dcterms:modified>${guide.updatedAt}</dcterms:modified>
      </item>`,
    )
    .join("");

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/">
  <channel>
    <title>Neumas Resources</title>
    <link>${escapeXml(siteConfig.url)}</link>
    <description>Public guides and resources for F&amp;B operators from Neumas.</description>
    <language>en</language>
    <lastBuildDate>${toRfc822Date(guides.reduce((latest, guide) => (guide.updatedAt > latest ? guide.updatedAt : latest), guides[0]?.updatedAt ?? "2026-09-20"))}</lastBuildDate>
    <atom:link href="${escapeXml(`${siteConfig.url}/feed.xml`)}" rel="self" type="application/rss+xml" />${items}
  </channel>
</rss>`;
}