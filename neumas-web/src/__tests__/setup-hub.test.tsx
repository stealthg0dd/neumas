import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import SetupPage from "@/app/dashboard/setup/page";
import { getDataReadiness } from "@/lib/api/endpoints";
import type { DataReadinessItem, DataReadinessResponse } from "@/lib/api/types";

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...props
  }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("@/lib/api/endpoints", () => ({
  getDataReadiness: vi.fn(),
}));

vi.mock("@/lib/analytics", () => ({
  captureUIError: vi.fn(),
}));

const mockGetDataReadiness = vi.mocked(getDataReadiness);

function item(status: "READY" | "PARTIAL" | "MISSING", count = 0, action = "Add data"): DataReadinessItem {
  return {
    status,
    record_count: count,
    last_updated: null,
    required_action: status === "READY" ? "No action required" : action,
  };
}

function readiness(): DataReadinessResponse {
  return {
    organization_id: "org-1",
    property_id: "prop-1",
    overall_readiness: "PARTIAL",
    readiness_tier: "TIER_1",
    capability_readiness: {
      inventory: "READY",
      demand: "MISSING",
      procurement: "MISSING",
      margin: "MISSING",
    },
    sales_data: item("MISSING", 0, "Connect POS or upload sales.csv"),
    inventory_data: item("READY", 12),
    supplier_data: item("MISSING", 0, "Add suppliers and supplier pricing"),
    recipe_data: item("MISSING", 0, "Import recipes and canonical ingredients"),
    invoice_data: item("MISSING", 0, "Upload supplier invoices or connect accounting"),
    purchase_order_data: item("MISSING"),
    demand_history: item("MISSING"),
    forecast_ready: item("MISSING"),
    procurement_ready: item("MISSING"),
    margin_ready: item("MISSING"),
    blockers: [],
  };
}

describe("Setup hub", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it("renders readiness and import templates from the readiness API", async () => {
    mockGetDataReadiness.mockResolvedValue(readiness());

    render(<SetupPage />);

    expect(await screen.findByText("Setup Hub")).toBeTruthy();
    expect(screen.getByText("TIER_1")).toBeTruthy();
    expect(screen.getAllByText("inventory.csv").length).toBeGreaterThan(0);
    expect(screen.getAllByText("sales.csv").length).toBeGreaterThan(0);
    expect(screen.getAllByText("supplier_prices.csv").length).toBeGreaterThan(0);
    expect(screen.getByText("Connect POS or upload sales.csv")).toBeTruthy();
  });
});
