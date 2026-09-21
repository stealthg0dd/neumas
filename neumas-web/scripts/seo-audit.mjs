#!/usr/bin/env node

import { spawn } from "node:child_process";

const port = process.env.SEO_AUDIT_PORT || "3105";
const baseUrl = `http://127.0.0.1:${port}`;
const canonicalHost = "https://www.neumas.cc";
const organizationDescription = "Neumas is an AI operations intelligence platform for restaurants and F&B teams.";
const bannedConsumerTerms = [
  "grocery autopilot",
  "household autopilot",
  "built for households",
  "smart shopping list",
  "pantry for households",
  "families and flatmates",
  "household grocery intelligence",
];
const consumerTermWhitelist = new Map();

const conceptExpectations = [
  { match: /^\/$/, concepts: [/F&B/i, /restaurant/i, /operations/i] },
  { match: /^\/how-it-works$/, concepts: [/invoice|receipt/i, /inventory/i, /reorder|procurement/i] },
  { match: /^\/features\//, concepts: [/F&B|restaurant/i, /inventory|supplier|procurement|food cost|operations/i] },
  { match: /^\/solutions\/invoice-intelligence$/, concepts: [/invoice/i, /supplier/i, /inventory|food cost/i] },
  { match: /^\/solutions\/food-cost-control$/, concepts: [/food cost/i, /supplier/i, /procurement|invoice/i] },
  { match: /^\/solutions\/procurement-intelligence$/, concepts: [/procurement/i, /supplier/i, /F&B|restaurant/i] },
  { match: /^\/solutions\/restaurant-inventory-management$/, concepts: [/inventory/i, /restaurant/i, /invoice|supplier/i] },
  { match: /^\/solutions\/predictive-reordering$/, concepts: [/reorder/i, /inventory/i, /restaurant|F&B/i] },
  { match: /^\/guides\//, concepts: [/restaurant|F&B/i, /inventory|food cost/i, /supplier|procurement|invoice/i] },
  { match: /^\/use-cases\//, concepts: [/F&B|restaurant|cafe|kitchen/i, /operations|inventory|supplier|procurement/i] },
];

function fail(message) {
  throw new Error(message);
}

function getTags(html, tagName) {
  return html.match(new RegExp(`<${tagName}\\b[^>]*>`, "gi")) ?? [];
}

function getAttribute(tag, attribute) {
  return tag.match(new RegExp(`\\b${attribute}=["']([^"']*)["']`, "i"))?.[1];
}

function getMetadata(html, name) {
  return getTags(html, "meta").find((tag) => getAttribute(tag, "name") === name || getAttribute(tag, "property") === name);
}

function getCanonical(html) {
  return getTags(html, "link")
    .filter((tag) => getAttribute(tag, "rel")?.split(/\s+/).includes("canonical"))
    .map((tag) => getAttribute(tag, "href"))
    .filter(Boolean)[0];
}

function getStructuredDataErrors(html) {
  const scripts = [...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  if (scripts.length === 0) return ["missing JSON-LD"];
  return scripts.flatMap((script) => {
    try {
      const parsed = JSON.parse(script[1]);
      const nodes = Array.isArray(parsed) ? parsed : [parsed];
      return nodes.flatMap((node) =>
        typeof node === "object" && node !== null && typeof node["@context"] === "string" && typeof node["@type"] === "string"
          ? []
          : ["JSON-LD node is missing @context or @type"],
      );
    } catch (error) {
      return [`invalid JSON-LD: ${error instanceof Error ? error.message : String(error)}`];
    }
  });
}

function getHomepageEntityErrors(html) {
  const scripts = [...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  const nodes = [];
  for (const script of scripts) {
    try {
      const parsed = JSON.parse(script[1]);
      nodes.push(...(Array.isArray(parsed) ? parsed : [parsed]));
    } catch {
      return [];
    }
  }

  const organization = nodes.find((node) => node?.["@type"] === "Organization");
  const errors = [];
  if (!organization) return ["homepage is missing Organization JSON-LD"];
  if (organization.name !== "Neumas") errors.push("homepage Organization name is not Neumas");
  if (organization.alternateName !== "Neumas AI") errors.push("homepage Organization alternateName is not Neumas AI");
  if (organization.url !== canonicalHost) errors.push("homepage Organization URL is not canonical");
  if (organization.description !== organizationDescription) errors.push("homepage Organization description is not canonical");
  if (nodes.some((node) => node?.["@type"] === "SoftwareApplication")) errors.push("homepage includes unsupported SoftwareApplication JSON-LD");
  return errors;
}

function getExpectedConcepts(path) {
  return conceptExpectations.find((expectation) => expectation.match.test(path))?.concepts ?? [];
}

function getInternalLinks(html) {
  const urls = new Set();
  for (const tag of getTags(html, "a")) {
    const href = getAttribute(tag, "href");
    if (!href || href.startsWith("#")) continue;
    const absolute = href.startsWith("http") ? href : new URL(href, canonicalHost).toString();
    const parsed = new URL(absolute);
    if (parsed.origin !== canonicalHost) continue;
    urls.add(`${parsed.origin}${parsed.pathname}`.replace(/\/$/, ""));
  }
  return urls;
}

async function waitForServer(server) {
  let lastError;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const response = await fetch(`${baseUrl}/robots.txt`);
      if (response.ok) return;
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  server.kill("SIGTERM");
  fail(`SEO audit server did not start: ${lastError instanceof Error ? lastError.message : "unknown error"}`);
}

function getCrawlDepth(url, links) {
  const root = canonicalHost;
  const queue = [{ url: root, depth: 0 }];
  const visited = new Set();
  while (queue.length) {
    const current = queue.shift();
    if (!current || visited.has(current.url)) continue;
    if (current.url === url) return current.depth;
    visited.add(current.url);
    for (const destination of links.get(current.url) ?? []) queue.push({ url: destination, depth: current.depth + 1 });
  }
  return null;
}

async function main() {
  const server = spawn("pnpm", ["exec", "next", "start", "-p", port], {
    env: {
      ...process.env,
      NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder.supabase.co",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "placeholder-anon-key",
      SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY || "placeholder-service-key",
      AGENT_OS_URL: process.env.AGENT_OS_URL || "https://agent-os.example.invalid",
      AGENT_OS_API_KEY: process.env.AGENT_OS_API_KEY || "placeholder-agent-key",
      SUPABASE_URL: process.env.SUPABASE_URL || "https://placeholder.supabase.co",
      SUPABASE_JWT_SECRET: process.env.SUPABASE_JWT_SECRET || "placeholder-jwt-secret",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  try {
    await waitForServer(server);
    const robots = await (await fetch(`${baseUrl}/robots.txt`)).text();
    if (!robots.includes(`${canonicalHost}/sitemap.xml`)) fail("robots.txt does not reference the canonical sitemap");

    const sitemapXml = await (await fetch(`${baseUrl}/sitemap.xml`)).text();
    const sitemapUrls = [...sitemapXml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1].replace(/\/$/, ""));
    if (sitemapUrls.length === 0) fail("sitemap.xml has no URLs");

    const sitemapUrlSet = new Set(sitemapUrls);
    const privatePrefixes = ["/auth", "/dashboard", "/api", "/onboard", "/pilot", "/insights", "/marketing-preview"];
    const errors = [];
    const pages = new Map();
    const internalLinks = new Set();

    for (const url of sitemapUrls) {
      if (!url.startsWith(canonicalHost)) errors.push(`${url}: non-canonical sitemap host`);
      const path = new URL(url).pathname;
      if (privatePrefixes.some((prefix) => path === prefix || path.startsWith(`${prefix}/`))) {
        errors.push(`${url}: private route appears in sitemap`);
      }

      const response = await fetch(`${baseUrl}${path}`);
      const html = await response.text();
      if (!response.ok) {
        errors.push(`${url}: HTTP ${response.status}`);
        continue;
      }

      const canonical = getCanonical(html);
      if (!canonical) errors.push(`${url}: missing canonical`);
      else if (canonical.replace(/\/$/, "") !== url) errors.push(`${url}: canonical is ${canonical}`);
      if (!/<title>[^<]+<\/title>/i.test(html)) errors.push(`${url}: missing title`);
      if (!getMetadata(html, "description")) errors.push(`${url}: missing description`);
      if ((html.match(/<h1\b/gi) ?? []).length !== 1) errors.push(`${url}: expected exactly one H1`);
      if (getMetadata(html, "robots")?.toLowerCase().includes("noindex")) errors.push(`${url}: accidental noindex`);
      if (getStructuredDataErrors(html).length) errors.push(`${url}: ${getStructuredDataErrors(html).join(", ")}`);
      if (path === "/" && getHomepageEntityErrors(html).length) {
        errors.push(`${url}: ${getHomepageEntityErrors(html).join(", ")}`);
      }

      for (const term of bannedConsumerTerms) {
        if (html.toLowerCase().includes(term) && !consumerTermWhitelist.get(path)?.includes(term)) {
          errors.push(`${url}: obsolete consumer positioning "${term}"`);
        }
      }

      const expectedConcepts = getExpectedConcepts(path);
      const foundConcepts = expectedConcepts.filter((concept) => concept.test(html));
      if (expectedConcepts.length && foundConcepts.length < 2) {
        errors.push(`${url}: missing page-specific B2B concepts`);
      }

      const blockedPath = [...robots.matchAll(/^Disallow:\s*(\S+)/gim)].map((match) => match[1]).find((disallow) => disallow !== "/" && path.startsWith(disallow));
      if (blockedPath) errors.push(`${url}: blocked by robots.txt rule ${blockedPath}`);
      const links = getInternalLinks(html);
      for (const link of links) internalLinks.add(link);
      pages.set(url, { links: new Set([...links].filter((link) => sitemapUrlSet.has(link))) });
    }

    for (const link of internalLinks) {
      const path = new URL(link).pathname;
      const response = await fetch(`${baseUrl}${path}`, { redirect: "manual" });
      if (response.status >= 400) errors.push(`${link}: rendered internal link returns HTTP ${response.status}`);
    }

    const incoming = new Map(sitemapUrls.map((url) => [url, 0]));
    for (const page of pages.values()) {
      for (const destination of page.links) incoming.set(destination, (incoming.get(destination) ?? 0) + 1);
    }
    const report = sitemapUrls.map((url) => ({
      url,
      incoming: incoming.get(url) ?? 0,
      outgoing: pages.get(url)?.links.size ?? 0,
      depth: getCrawlDepth(url, new Map([...pages].map(([pageUrl, page]) => [pageUrl, page.links]))),
    }));
    for (const row of report) {
      if (row.url !== canonicalHost && row.incoming === 0) errors.push(`${row.url}: orphaned rendered page`);
      if (row.depth === null) errors.push(`${row.url}: unreachable from the homepage`);
    }

    const llms = await (await fetch(`${baseUrl}/llms.txt`)).text();
    const llmsFull = await (await fetch(`${baseUrl}/llms-full.txt`)).text();
    if (!/B2B software/i.test(llms) || /grocery autopilot|household autopilot|smart shopping list/i.test(llms)) {
      errors.push("llms.txt is not B2B-accurate");
    }
    for (const [label, document] of [["llms.txt", llms], ["llms-full.txt", llmsFull]]) {
      if (!document.includes(organizationDescription) || !document.includes("Neumas AI") || !/unrelated to neumes/i.test(document)) {
        errors.push(`${label} is missing Neumas entity-disambiguation context`);
      }
    }
    const feed = await (await fetch(`${baseUrl}/feed.xml`)).text();
    if (!feed.includes("<rss") || !feed.includes("/guides/")) errors.push("RSS feed is unavailable or missing public guides");

    console.log("URL | Incoming internal links | Outgoing internal links | Crawl depth");
    console.log("--- | ---: | ---: | ---:");
    for (const row of report) console.log(`${row.url} | ${row.incoming} | ${row.outgoing} | ${row.depth ?? "unreachable"}`);
    if (errors.length) fail(`SEO/AI visibility audit failed:\n${errors.join("\n")}`);
    console.log(`SEO/AI visibility audit passed for ${sitemapUrls.length} canonical indexable pages.`);
  } finally {
    server.kill("SIGTERM");
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});