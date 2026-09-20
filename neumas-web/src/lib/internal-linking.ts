import { guides } from "@/lib/guides";
import { publicPages } from "@/lib/public-site";

export type InternalLinkReportRow = {
  url: string;
  incomingInternalLinks: number;
  outgoingInternalLinks: number;
  crawlDepth: number | null;
};

const homepageLinks = [
  "/about",
  "/how-it-works",
  "/features/inventory-intelligence",
  "/solutions/restaurant-inventory-management",
  "/guides",
];

function getPublicPaths(): string[] {
  return ["/", "/guides", ...publicPages.map((page) => page.path), ...guides.map((guide) => guide.path)];
}

function getControlledLinks(): Map<string, string[]> {
  const knownPaths = new Set(getPublicPaths());
  const links = new Map<string, string[]>();

  links.set("/", homepageLinks);
  links.set("/guides", guides.map((guide) => guide.path));

  for (const page of publicPages) {
    links.set(
      page.path,
      page.relatedLinks.map((link) => link.href).filter((href) => knownPaths.has(href)),
    );
  }

  for (const guide of guides) {
    links.set(
      guide.path,
      [
        "/guides",
        ...guide.relatedSolutionLinks.map((link) => link.href),
        ...guide.sections.flatMap((section) => section.relatedLinks?.map((link) => link.href) ?? []),
      ].filter((href) => knownPaths.has(href)),
    );
  }

  return links;
}

function getCrawlDepth(links: Map<string, string[]>, destination: string): number | null {
  const queue: Array<{ path: string; depth: number }> = [{ path: "/", depth: 0 }];
  const visited = new Set<string>();

  while (queue.length) {
    const current = queue.shift();
    if (!current || visited.has(current.path)) continue;
    if (current.path === destination) return current.depth;
    visited.add(current.path);
    for (const href of links.get(current.path) ?? []) {
      queue.push({ path: href, depth: current.depth + 1 });
    }
  }

  return null;
}

export function getInternalLinkReport(): InternalLinkReportRow[] {
  const links = getControlledLinks();
  const paths = getPublicPaths();

  return paths.map((url) => ({
    url,
    incomingInternalLinks: paths.filter((path) => path !== url && (links.get(path) ?? []).includes(url)).length,
    outgoingInternalLinks: new Set(links.get(url) ?? []).size,
    crawlDepth: getCrawlDepth(links, url),
  }));
}

export function formatInternalLinkReport(rows = getInternalLinkReport()): string {
  return [
    "URL | Incoming internal links | Outgoing internal links | Crawl depth",
    "--- | ---: | ---: | ---:",
    ...rows.map(
      (row) => `${row.url} | ${row.incomingInternalLinks} | ${row.outgoingInternalLinks} | ${row.crawlDepth ?? "unreachable"}`,
    ),
  ].join("\n");
}