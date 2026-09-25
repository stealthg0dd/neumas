import React from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import DashboardPage from "@/app/dashboard/page";
import { getControlCenterSummary } from "@/lib/api/endpoints";
import type { ControlCenterSummary } from "@/lib/api/types";

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
  getControlCenterSummary: vi.fn(),
}));

vi.mock("@/lib/analytics", () => ({
  captureUIError: vi.fn(),
}));

const mockGetControlCenterSummary = vi.mocked(getControlCenterSummary);

function emptySummary(): ControlCenterSummary {
  return {
    generated_at: "2026-09-25T00:00:00Z",
    organization_id: "org-1",
    property_id: "prop-1",
    kpis: [
      { key: "food_cost_pct", label: "Food Cost %", value: null, unit: "%", status: "unknown", evidence: [] },
      { key: "margin_at_risk", label: "Margin at Risk", value: null, unit: "currency", status: "unknown", evidence: [] },
      { key: "procurement_need_7d", label: "7-Day Procurement Need", value: null, unit: "currency", status: "unknown", evidence: [] },
      { key: "savings_captured", label: "Savings Captured", value: null, unit: "currency", status: "unknown", evidence: [] },
      { key: "forecast_confidence", label: "Forecast Confidence", value: null, unit: "percent_ratio", status: "unknown", evidence: [] },
      { key: "open_exceptions", label: "Open Exceptions", value: 0, unit: "count", status: "good", evidence: [] },
      { key: "pos_awaiting_action", label: "POs Awaiting Action", value: null, unit: "count", status: "unknown", evidence: [] },
      { key: "supplier_otif", label: "Supplier OTIF", value: null, unit: "%", status: "unknown", evidence: [] },
    ],
    risks: [],
    recommendations: [],
    open_approvals: [],
    exceptions: [],
    demand_summary: {
      forecast_confidence: null,
      stock_risk_count: 0,
      next_7_day_purchase_need: null,
      history_days_observed: 0,
      learning_state: null,
      evidence: [],
    },
    margin_summary: {
      food_cost_pct: null,
      margin_at_risk: null,
      savings_captured: null,
      evidence: [],
    },
    supplier_summary: {
      supplier_otif: null,
      supplier_count: 0,
      price_alert_count: 0,
      evidence: [],
    },
    recent_actions: [],
  };
}

describe("Control Center dashboard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it("renders the operator dashboard from the aggregation endpoint", async () => {
    mockGetControlCenterSummary.mockResolvedValue({
      ...emptySummary(),
      recommendations: [{
        id: "rec-1",
        title: "Approve dairy reorder",
        category: "procurement",
        priority: "P0",
        what_changed: "Purchase plan is awaiting approval.",
        impact: "184.00 estimated spend",
        evidence: ["Existing shopping list lifecycle row"],
        recommended_action: "Approve, modify, or reject the recommendation.",
        approval_required: true,
        status: "awaiting_approval",
        href: "/dashboard/procurement/recommendations",
        confidence: null,
        metadata: {},
      }],
    });

    render(<DashboardPage />);

    expect(await screen.findByText("Autonomous Procurement & Margin Control")).toBeTruthy();
    expect(screen.getByText("Approve dairy reorder")).toBeTruthy();
    expect(mockGetControlCenterSummary).toHaveBeenCalledTimes(1);
  });

  it("shows empty and N/A states instead of fake fallback metrics", async () => {
    mockGetControlCenterSummary.mockResolvedValue(emptySummary());

    render(<DashboardPage />);

    await waitFor(() => expect(screen.getByText("No procurement actions or operating risks are open for this property.")).toBeTruthy());
    expect(screen.getAllByText("N/A").length).toBeGreaterThan(0);
    expect(screen.queryByText("$12,000")).toBeNull();
    expect(screen.queryByText("92%")).toBeNull();
  });
});
