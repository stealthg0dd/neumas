#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptDirectory, "../..");
const registryPath = resolve(repositoryRoot, "docs/organic-visibility/topic-registry.json");
const deploymentLogPath = resolve(repositoryRoot, "docs/organic-visibility/deployment-log.json");
const draftsDirectory = resolve(repositoryRoot, "docs/organic-visibility/drafts");
const canonicalHost = "https://www.neumas.cc";

function fail(message) {
  throw new Error(message);
}

function getOption(name) {
  const optionIndex = process.argv.indexOf(`--${name}`);
  return optionIndex === -1 ? undefined : process.argv[optionIndex + 1];
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function getDate(value = new Date().toISOString().slice(0, 10)) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(new Date(`${value}T00:00:00Z`).valueOf())) {
    fail(`Expected a valid ISO date (YYYY-MM-DD), received "${value}".`);
  }
  return value;
}

function getTopic(registry) {
  const topicId = getOption("topic");
  if (!topicId) fail("Provide a topic with --topic <topic-id>.");
  const topic = registry.topics.find((candidate) => candidate.id === topicId);
  if (!topic) fail(`Unknown topic "${topicId}". Add it to docs/organic-visibility/topic-registry.json first.`);
  return topic;
}

function duplicateIntent(registry, topic) {
  return registry.topics.find(
    (candidate) =>
      candidate.id !== topic.id &&
      candidate.targetQuery.trim().toLowerCase() === topic.targetQuery.trim().toLowerCase() &&
      candidate.intent.trim().toLowerCase() === topic.intent.trim().toLowerCase() &&
      ["covered", "approved", "published"].includes(candidate.status),
  );
}

function makeDraft(topic, date) {
  return `# Draft: ${topic.targetQuery}

Status: draft only - human approval required before publishing
Topic ID: ${topic.id}
Target query: ${topic.targetQuery}
Intent: ${topic.intent}
Planned public URL: [decide only after approval]
Created: ${date}

## Intent check

- Gap check completed: ${topic.intentCheck?.completedAt ?? "not recorded"}
- Existing Neumas URLs reviewed: ${(topic.intentCheck?.checkedUrls ?? []).join(", ") || "none recorded"}
- Why existing coverage does not satisfy this intent: ${topic.intentCheck?.gapRationale ?? "write before drafting"}

Do not continue if an existing Neumas page already satisfies the same query and intent.

## Research brief

### Reader and decision

Describe the restaurant or F&B reader, their operating decision, and what a useful answer must help them understand. Keep the scope specific to the topic; do not add generic AI commentary.

### Evidence plan

Every factual, statistical, market, legal, or regulatory claim in the finished article needs a verified external source. Record the source before using the claim.

| Proposed claim | Source | URL | Publication date | Verified |
| --- | --- | --- | --- | --- |
|  |  |  |  | no |

### Distinct angle

Explain the point this article can cover that is not already addressed by the checked Neumas pages.

### Proposed outline

1. 
2. 
3. 

## Article draft

Draft only. Do not add this article to \`neumas-web/src/lib/guides.ts\` until the approval checklist is complete.

### Working title


### Metadata draft

- Title:
- Meta description:
- Canonical URL:
- Primary internal links:

### Body


## LinkedIn company-post draft

Draft derived from this same article. Do not post automatically.


## Founder LinkedIn-post draft

Draft derived from this same article. Do not post automatically.


## Approval checklist

- [ ] Intent gap is still valid against the current public site.
- [ ] Every factual/statistical claim has a verified external citation.
- [ ] The article is genuinely useful and does not duplicate an existing Neumas page.
- [ ] Maximum of one approved article is scheduled for this calendar week.
- [ ] Human approval is recorded in the topic registry.
- [ ] Article implementation includes metadata, Article schema, canonical, internal links, sitemap, and RSS through the guide registry.
- [ ] Production deployment succeeded before logging the URL and relying on IndexNow submission.
`;
}

function createDraft() {
  const registry = readJson(registryPath);
  const topic = getTopic(registry);
  const date = getDate(getOption("date"));
  const duplicate = duplicateIntent(registry, topic);

  if (topic.status !== "gap-verified") {
    fail(`Topic "${topic.id}" must have status "gap-verified" before a draft can be created; current status is "${topic.status}".`);
  }
  if (!topic.intentCheck?.completedAt || !topic.intentCheck?.gapRationale || !topic.intentCheck?.checkedUrls?.length) {
    fail(`Topic "${topic.id}" needs a completed intentCheck with checkedUrls and gapRationale before drafting.`);
  }
  if (duplicate) {
    fail(`Topic "${topic.id}" duplicates the covered intent in "${duplicate.id}" (${duplicate.url ?? "no URL recorded"}).`);
  }

  mkdirSync(draftsDirectory, { recursive: true });
  const draftPath = resolve(draftsDirectory, `${date}-${topic.id}.md`);
  if (existsSync(draftPath)) fail(`Draft already exists: ${draftPath}`);
  writeFileSync(draftPath, makeDraft(topic, date));
  console.log(`Created approval-gated draft: ${draftPath}`);
}

function logDeployment() {
  const registry = readJson(registryPath);
  const topic = getTopic(registry);
  const url = getOption("url");
  const date = getDate(getOption("date"));

  if (topic.status !== "published") {
    fail(`Only a published topic can be logged after deployment; "${topic.id}" has status "${topic.status}".`);
  }
  if (!url?.startsWith(`${canonicalHost}/`)) fail(`Provide a canonical Neumas URL with --url, starting ${canonicalHost}/.`);

  const entries = existsSync(deploymentLogPath) ? readJson(deploymentLogPath) : [];
  if (entries.some((entry) => entry.url === url)) fail(`A deployment log entry already exists for ${url}.`);
  entries.push({ topicId: topic.id, url, deployedAt: date, indexNow: "submitted by deploy-web.yml after production checks" });
  writeJson(deploymentLogPath, entries);
  console.log(`Logged production deployment for ${url}.`);
}

const command = process.argv[2];
try {
  if (command === "draft") createDraft();
  else if (command === "log-deployment") logDeployment();
  else fail("Use one of: draft, log-deployment.");
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
