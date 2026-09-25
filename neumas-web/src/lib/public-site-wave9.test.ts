import { describe, expect, it } from "vitest";

import { getPublicPage, publicPages, siteConfig } from "@/lib/public-site";

const wave9Paths = [
  "/autonomous-procurement",
  "/restaurant-procurement-software",
  "/food-cost-management",
  "/restaurant-inventory-management",
  "/supplier-management",
  "/purchase-order-automation",
  "/invoice-reconciliation",
  "/restaurant-demand-forecasting",
  "/recipe-costing",
  "/food-waste-management",
  "/multi-location-restaurants",
  "/hotel-food-procurement",
  "/integrations",
];

describe("Wave 9 public positioning", () => {
  it("publishes all requested autonomous procurement discovery pages", () => {
    for (const path of wave9Paths) {
      const page = getPublicPage(path);
      expect(page, `${path} should be indexable`).toBeTruthy();
      expect(page?.canonicalUrl).toContain(path);
      expect(page?.sections.length).toBeGreaterThanOrEqual(3);
      expect(page?.relatedLinks.length).toBeGreaterThanOrEqual(4);
    }
  });

  it("uses the canonical F&B procurement entity description", () => {
    expect(siteConfig.description).toContain("autonomous procurement and margin-control platform");
    expect(siteConfig.description).toContain("demand, inventory, recipes, suppliers, purchasing, deliveries and invoices");
  });

  it("does not use household grocery positioning on canonical public pages", () => {
    const canonicalText = publicPages
      .filter((page) => !page.path.startsWith("/glossary"))
      .map((page) => `${page.title} ${page.description} ${page.intro}`)
      .join(" ")
      .toLowerCase();
    expect(canonicalText).not.toContain("personal pantry");
    expect(canonicalText).not.toContain("grocery app");
  });
});
