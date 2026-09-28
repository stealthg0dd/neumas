import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import ExchangePage from "@/app/dashboard/exchange/page";
import { getExchangeSummary } from "@/lib/api/endpoints";

vi.mock("@/lib/api/endpoints", () => ({ getExchangeSummary: vi.fn() }));
vi.mock("next/link", () => ({ default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a> }));

describe("Exchange dashboard", () => {
  afterEach(() => cleanup());

  it("renders real aggregation values and RFQs without fallback activity", async () => {
    vi.mocked(getExchangeSummary).mockResolvedValue({
      rfq_value: 450, active_rfqs: 1, offers_received: 3, orders_created: 0,
      commercial_improvement: 50, active_buyer_agents: 1, active_suppliers: 3,
      rfqs: [{ id: "rfq-1", title: "Weekly tomato requirement", status: "NEGOTIATING", currency: "SGD", property_id: "p1", required_by: null, response_deadline: null, notes: null, items: [], invitations: [{}, {}, {}], offers: [{}, {}, {}], recommendation: null, negotiation_events: [], created_at: null }],
      recent_offers: [], negotiations_requiring_action: [], policy_approvals: [], orders_in_flight: [], network_activity: [],
    });
    render(<ExchangePage />);
    expect(await screen.findByText("Weekly tomato requirement")).toBeTruthy();
    expect(screen.getByText("Offers received")).toBeTruthy();
    expect(screen.getByText("3 offers · 3 invited")).toBeTruthy();
    expect(screen.getByText("No network activity yet.")).toBeTruthy();
  });
});
