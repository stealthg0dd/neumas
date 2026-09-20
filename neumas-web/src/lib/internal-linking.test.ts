import { describe, expect, it } from "vitest";

import { formatInternalLinkReport, getInternalLinkReport } from "@/lib/internal-linking";

describe("controlled public internal linking", () => {
  it("keeps indexable pages reachable with meaningful related-content links", () => {
    const report = getInternalLinkReport();
    const gaps = report
      .filter(
        (row) =>
          row.crawlDepth === null ||
          (row.url !== "/" && (row.incomingInternalLinks === 0 || row.outgoingInternalLinks < 2)),
      )
      .map(
        (row) =>
          `${row.url}: incoming=${row.incomingInternalLinks}, outgoing=${row.outgoingInternalLinks}, depth=${row.crawlDepth ?? "unreachable"}`,
      );

    expect(gaps, `Internal-link gaps:\n${gaps.join("\n")}`).toEqual([]);
  });

  it("prints the reviewable URL, incoming, outgoing, and depth report", () => {
    expect(formatInternalLinkReport()).toContain("/solutions/procurement-intelligence");
  });
});