import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import SupplierHomePage from "@/app/supplier/page";
import { getSupplierSummary } from "@/lib/api/endpoints";

vi.mock("@/lib/api/endpoints", () => ({
  getSupplierSummary: vi.fn(),
  createSupplierAccount: vi.fn(),
  activateSupplierAgent: vi.fn(),
}));
vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
}));

describe("Supplier workspace", () => {
  afterEach(() => cleanup());

  it("renders real metrics and does not invent KPIs when empty", async () => {
    vi.mocked(getSupplierSummary).mockResolvedValue({
      account: {
        id: "a1",
        organization_id: "o1",
        vendor_id: "v1",
        display_name: "Fresh Farms",
        contact_email: null,
        contact_phone: null,
        status: "onboarding",
        onboarding_step: "catalog",
        agent_endpoint_enabled: false,
        metadata: {},
      },
      metrics: {
        open_rfq_value: 120,
        rfqs_requiring_response: 2,
        offers_submitted: 1,
        orders_won: 0,
        agent_sourced_revenue: null,
        catalog_readiness_pct: 15,
        fill_rate: null,
      },
      locations: [],
      service_areas: [],
      delivery_slots: [],
      capabilities: [{ id: "c1", capability: "csv_import", enabled: true }],
      commercial_terms: null,
      onboarding_complete: false,
    });

    render(<SupplierHomePage />);
    expect(await screen.findByText("Fresh Farms")).toBeTruthy();
    expect(screen.getByText("RFQs requiring response")).toBeTruthy();
    expect(screen.getByText("Offers submitted")).toBeTruthy();
    expect(screen.getByText("15%")).toBeTruthy();
    expect(screen.getByText("Activate agent endpoint")).toBeTruthy();
    expect(screen.getByText("2 need response")).toBeTruthy();
  });

  it("prompts for profile creation when no supplier account exists", async () => {
    vi.mocked(getSupplierSummary).mockResolvedValue({
      account: null,
      metrics: {
        open_rfq_value: null,
        rfqs_requiring_response: 0,
        offers_submitted: 0,
        orders_won: 0,
        agent_sourced_revenue: null,
        catalog_readiness_pct: 0,
        fill_rate: null,
      },
      locations: [],
      service_areas: [],
      delivery_slots: [],
      capabilities: [],
      commercial_terms: null,
      onboarding_complete: false,
    });
    render(<SupplierHomePage />);
    expect(await screen.findByText("Create supplier profile")).toBeTruthy();
  });
});
