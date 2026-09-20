#!/usr/bin/env node

import { spawnSync } from "node:child_process";

const canonicalOrigin = process.env.NEUMAS_PUBLIC_URL ?? "https://www.neumas.cc";
const sitemapUrl = `${canonicalOrigin}/sitemap.xml`;
const robotsUrl = `${canonicalOrigin}/robots.txt`;
const sitemapNamespace = "http://www.sitemaps.org/schemas/sitemap/0.9";
const privatePrefixes = [
  "/app",
  "/dashboard",
  "/admin",
  "/api",
  "/auth",
  "/account",
  "/settings",
  "/onboard",
  "/pilot",
  "/insights",
  "/marketing-preview",
];
const userAgents = {
  normal: "Mozilla/5.0 (compatible; NeumasSitemapHealth/1.0)",
  Googlebot: "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
  Bingbot: "Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)",
};

function fail(message) {
  throw new Error(message);
}

function isXmlContentType(contentType) {
  return /^(application|text)\/xml(?:;|$)/i.test(contentType ?? "");
}

function isPrivatePath(pathname) {
  return privatePrefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

function parseSitemap(xml) {
  if (!/^<\?xml\s+version=["']1\.0["'](?:\s+encoding=["']UTF-8["'])?\s*\?>/i.test(xml)) {
    fail("sitemap.xml is missing a valid XML declaration");
  }

  const parser = spawnSync(
    "python3",
    [
      "-c",
      [
        "import sys, xml.etree.ElementTree as ET",
        "root = ET.fromstring(sys.stdin.buffer.read())",
        `expected = '{${sitemapNamespace}}urlset'`,
        "if root.tag != expected:",
        "    raise SystemExit(f'Unexpected sitemap root namespace/tag: {root.tag}')",
      ].join("\n"),
    ],
    { input: xml, encoding: "utf8" },
  );
  if (parser.status !== 0) {
    fail(`sitemap.xml is invalid XML: ${parser.stderr.trim() || "XML parser failed"}`);
  }

  const urls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
  if (urls.length === 0) fail("sitemap.xml contains no <loc> URLs");
  return urls;
}

async function request(url, method, userAgent) {
  const response = await fetch(url, {
    method,
    redirect: "manual",
    headers: { "User-Agent": userAgent, Accept: "application/xml,text/xml;q=0.9,*/*;q=0.8" },
    signal: AbortSignal.timeout(30_000),
  });
  return response;
}

async function verifySitemapResponse(name, userAgent, method) {
  const response = await request(sitemapUrl, method, userAgent);
  if (response.status !== 200) fail(`${name} ${method} sitemap status is ${response.status}, expected 200`);
  if (response.headers.has("location")) fail(`${name} ${method} sitemap unexpectedly redirects to ${response.headers.get("location")}`);
  if (!isXmlContentType(response.headers.get("content-type"))) {
    fail(`${name} ${method} sitemap content type is ${response.headers.get("content-type") ?? "missing"}, expected XML`);
  }
  return response;
}

async function main() {
  const sitemapBodies = new Map();
  for (const [name, userAgent] of Object.entries(userAgents)) {
    const getResponse = await verifySitemapResponse(name, userAgent, "GET");
    await verifySitemapResponse(name, userAgent, "HEAD");
    sitemapBodies.set(name, await getResponse.text());
  }

  const sitemapXml = sitemapBodies.get("normal");
  const sitemapUrls = parseSitemap(sitemapXml);
  for (const [name, body] of sitemapBodies) {
    if (body !== sitemapXml) fail(`${name} received a sitemap body different from the normal user agent`);
  }

  const robotsResponse = await request(robotsUrl, "GET", userAgents.Googlebot);
  if (robotsResponse.status !== 200) fail(`Googlebot robots.txt status is ${robotsResponse.status}, expected 200`);
  const robots = await robotsResponse.text();
  if (!robots.includes(`Sitemap: ${sitemapUrl}`)) fail("robots.txt does not reference the canonical sitemap URL");

  for (const url of sitemapUrls) {
    let parsed;
    try {
      parsed = new URL(url);
    } catch {
      fail(`sitemap contains an invalid URL: ${url}`);
    }
    if (parsed.origin !== canonicalOrigin) fail(`sitemap contains a noncanonical URL: ${url}`);
    if (isPrivatePath(parsed.pathname)) fail(`sitemap contains a private or noindex URL: ${url}`);

    const pageResponse = await request(url, "GET", userAgents.Googlebot);
    if (pageResponse.status < 200 || pageResponse.status >= 300) {
      fail(`Googlebot receives ${pageResponse.status} for sitemap URL ${url}; sitemap URLs must not redirect or return errors`);
    }
  }

  console.log(`Production sitemap health passed: ${sitemapUrls.length} canonical URLs; normal, Googlebot, and Bingbot GET/HEAD returned direct XML 200.`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});