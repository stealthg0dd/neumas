import { describe, expect, it } from "vitest";

import { getNavigationForWorkspace, isRouteAllowedForWorkspace } from "@/lib/navigation";

describe("workspace navigation", () => {
  it("keeps F&B admin navigation available to F&B admins", () => {
    const navigation = getNavigationForWorkspace("FNB", "admin");
    expect(navigation.primary.some((item) => item.href === "/dashboard")).toBe(true);
    expect(navigation.primary.some((item) => item.href === "/dashboard/procurement/recommendations")).toBe(true);
    expect(navigation.admin.some((item) => item.href === "/dashboard/admin")).toBe(true);
  });

  it("moves raw scan workflow out of primary F&B navigation while keeping invoices primary", () => {
    const navigation = getNavigationForWorkspace("FNB", "admin");
    expect(navigation.primary.some((item) => item.href === "/dashboard/scans")).toBe(false);
    expect(navigation.primary.some((item) => item.href === "/dashboard/invoices")).toBe(true);
  });

  it("hides F&B admin and vendor routes from household users", () => {
    const navigation = getNavigationForWorkspace("HOUSEHOLD", "admin");
    expect(navigation.primary.some((item) => item.href === "/dashboard/admin")).toBe(false);
    expect(navigation.admin.some((item) => item.href === "/dashboard/vendors")).toBe(false);
  });

  it("blocks direct household access to F&B-only routes", () => {
    expect(isRouteAllowedForWorkspace("/dashboard/admin", "HOUSEHOLD", "admin")).toBe(false);
    expect(isRouteAllowedForWorkspace("/dashboard/vendors", "HOUSEHOLD", "admin")).toBe(false);
    expect(isRouteAllowedForWorkspace("/dashboard/restock", "HOUSEHOLD", "admin")).toBe(false);
    expect(isRouteAllowedForWorkspace("/dashboard/procurement/recommendations", "HOUSEHOLD", "admin")).toBe(false);
  });

  it("keeps shared routes available to household users", () => {
    expect(isRouteAllowedForWorkspace("/dashboard/scans/new", "HOUSEHOLD", "admin")).toBe(true);
    expect(isRouteAllowedForWorkspace("/dashboard/inventory", "HOUSEHOLD", "admin")).toBe(true);
    expect(isRouteAllowedForWorkspace("/dashboard/shopping", "HOUSEHOLD", "admin")).toBe(true);
  });

  it("allows the F&B Control Center routes and legacy technical routes", () => {
    expect(isRouteAllowedForWorkspace("/dashboard/margin", "FNB", "staff")).toBe(true);
    expect(isRouteAllowedForWorkspace("/dashboard/procurement/recommendations", "FNB", "staff")).toBe(true);
    expect(isRouteAllowedForWorkspace("/dashboard/scans/new", "FNB", "staff")).toBe(true);
  });
});
