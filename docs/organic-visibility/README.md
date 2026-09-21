# Weekly Organic Visibility Workflow

This is a draft-first workflow for one founder. It supports at most one genuinely useful public article or insight each week. It does not publish content or post to LinkedIn automatically.

## Source of Truth

`topic-registry.json` contains two lists:

- `topics`: prioritized search opportunities, their search intent, and whether an existing Neumas page already covers that intent.
- `visibility`: the current URL-level visibility record with placeholders for Search Console and backlink data.

The initial priorities are already mapped to existing Neumas pages. Do not create another page for one of those query-and-intent pairs unless the registry records a real gap.

## Weekly Approval Flow

1. Review Tier 1 before Tier 2. Choose only one opportunity for the week.
2. Check the current Neumas public pages, especially `neumas-web/src/lib/guides.ts` and `neumas-web/src/lib/public-site.ts`. Record every reviewed URL in a new topic's `intentCheck`.
3. Add a topic with `status: "gap-verified"`, a completed date, reviewed URLs, and a specific rationale for why none satisfies the same query and intent.
4. Create a review packet:

```bash
cd neumas-web
pnpm visibility:draft -- --topic <topic-id>
```

5. Complete the research brief. Every factual, statistical, market, legal, or regulatory claim needs an external source, URL, and publication date. Remove unsupported claims rather than citing weak evidence.
6. Draft the article and both LinkedIn post drafts in that same packet. They stay drafts; there is no LinkedIn integration.
7. Approve manually only when the intent gap, citations, usefulness, and one-article weekly limit are all satisfied. Record approval in `topic-registry.json`.
8. Publish manually by adding the approved guide to `neumas-web/src/lib/guides.ts`. That existing registry creates the page metadata, Article schema, canonical, sitemap entry, RSS item, and guide index entry. Add contextual internal links before requesting review.
9. After the production workflow succeeds, it automatically submits changed public URLs through IndexNow. Then log the deployment:

```bash
cd neumas-web
pnpm visibility:log-deployment -- --topic <topic-id> --url https://www.neumas.cc/guides/<slug> --date YYYY-MM-DD
```

10. Update the matching `visibility` row periodically from verified Search Console and backlink data. Leave unknown measurements as `null`; do not estimate them.

## Guardrails

- A draft command fails unless the topic is explicitly `gap-verified` and documents the intent check.
- A draft command fails when another covered, approved, or published topic has the same query and intent.
- A deployment can be logged only for a topic marked `published` and a canonical `https://www.neumas.cc/` URL.
- No command edits `guides.ts`, deploys content, or posts to LinkedIn.
- Keep the work specific to restaurant and F&B operations; do not produce generic AI commentary.

## Entity Context

Public entity information is maintained in `neumas-web/src/lib/public-site.ts`, `/about`, `/llms.txt`, and `/llms-full.txt`. `Neumas` remains the canonical brand name. `Neumas AI` is an occasional alternate textual reference, not a replacement brand. Do not add `sameAs` entries unless the profile is verified as official.
