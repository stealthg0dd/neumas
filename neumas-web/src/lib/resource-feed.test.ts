import { describe, expect, it } from "vitest";

import { buildResourceFeed } from "@/lib/resource-feed";

describe("resource RSS feed", () => {
  it("returns valid RSS XML for public guide resources only", () => {
    const document = new DOMParser().parseFromString(buildResourceFeed(), "application/xml");

    expect(document.querySelector("parsererror")).toBeNull();
    expect(document.querySelector("channel > title")?.textContent).toBe("Neumas Resources");
    expect(document.querySelectorAll("item")).toHaveLength(2);
    expect(document.querySelectorAll("item link")[0]?.textContent).toMatch(/^https:\/\/www\.neumas\.cc\/guides\//);
    expect(document.getElementsByTagNameNS("http://purl.org/dc/terms/", "modified")[0]?.textContent).toBe("2026-09-20");
    expect(buildResourceFeed()).not.toContain("/auth");
    expect(buildResourceFeed()).not.toContain("/dashboard");
  });
});