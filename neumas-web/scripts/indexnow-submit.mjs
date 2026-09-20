#!/usr/bin/env node

import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const canonicalHost = "https://www.neumas.cc";
const indexNowEndpoint = "https://api.indexnow.org/indexnow";
const baseSha = process.env.INDEXNOW_BASE_SHA;
const key = process.env.INDEXNOW_KEY;
const keyLocation = process.env.INDEXNOW_KEY_LOCATION || `${canonicalHost}/indexnow-key`;

function gitShow(revision, file) {
  try {
    return execFileSync("git", ["show", `${revision}:${file}`], { encoding: "utf8" });
  } catch {
    return "";
  }
}

function extractObjectBlocks(source, marker, pathProperty) {
  const start = source.indexOf(marker);
  if (start < 0) return new Map();
  const blocks = new Map();
  let depth = 0;
  let objectStart = -1;
  for (let index = start; index < source.length; index += 1) {
    const character = source[index];
    if (character === "{") {
      if (depth === 0) objectStart = index;
      depth += 1;
    } else if (character === "}") {
      depth -= 1;
      if (depth === 0 && objectStart >= 0) {
        const block = source.slice(objectStart, index + 1);
        const pathMatch = block.match(pathProperty);
        if (pathMatch) blocks.set(pathMatch[1], block);
        objectStart = -1;
      }
    } else if (character === "]" && depth === 0) {
      break;
    }
  }
  return blocks;
}

function changedRegistryUrls(file, marker, pathProperty, pathToUrl) {
  const current = extractObjectBlocks(readFileSync(file, "utf8"), marker, pathProperty);
  if (!baseSha) return [...current.keys()].map(pathToUrl);
  const previous = extractObjectBlocks(gitShow(baseSha, file), marker, pathProperty);
  const urls = [];
  for (const [key, block] of current) {
    const previousBlock = previous.get(key);
    if (!previousBlock || createHash("sha256").update(block).digest("hex") !== createHash("sha256").update(previousBlock).digest("hex")) {
      urls.push(pathToUrl(key));
    }
  }
  return urls;
}

function changedFiles() {
  if (!baseSha) return [];
  return execFileSync("git", ["diff", "--name-only", `${baseSha}...HEAD`], { encoding: "utf8" })
    .split("\n")
    .filter(Boolean);
}

async function main() {
  if (!key) {
    console.log("IndexNow skipped: INDEXNOW_KEY is not configured.");
    return;
  }
  const files = changedFiles();
  const urls = new Set([
    ...changedRegistryUrls(
      "neumas-web/src/lib/public-site.ts",
      "const b2bPublicPages",
      /path:\s*["']([^"']+)["']/,
      (path) => `${canonicalHost}${path}`,
    ),
    ...changedRegistryUrls(
      "neumas-web/src/lib/guides.ts",
      "const guideDefinitions",
      /canonicalUrl:\s*["']([^"']+)["']/,
      (url) => url,
    ),
  ]);

  if (!baseSha || files.includes("neumas-web/src/app/page.tsx")) urls.add(canonicalHost);
  if (!baseSha || files.includes("neumas-web/src/app/guides/page.tsx")) urls.add(`${canonicalHost}/guides`);

  if (urls.size === 0) {
    console.log("IndexNow skipped: no public indexable URLs changed.");
    return;
  }

  const urlList = [...urls].filter((url) => url.startsWith(canonicalHost));
  console.log(`IndexNow ${baseSha ? "submitting changed" : "initially submitting"} ${urlList.length} canonical URL(s):\n${urlList.join("\n")}`);
  try {
    const response = await fetch(indexNowEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({ host: "www.neumas.cc", key, keyLocation, urlList }),
    });
    if (!response.ok) {
      console.log(`IndexNow submission failed non-fatally: ${response.status} ${await response.text()}`);
      return;
    }
    console.log(`IndexNow accepted ${urlList.length} URL(s) with status ${response.status}.`);
  } catch (error) {
    console.log(`IndexNow submission failed non-fatally: ${error instanceof Error ? error.message : String(error)}`);
  }
}

main().catch((error) => {
  console.log(`IndexNow submission failed non-fatally: ${error instanceof Error ? error.message : String(error)}`);
});