import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import DeveloperPage from "@/app/dashboard/developer/page";
import {
  createServiceClient,
  generateApiCredential,
  listApiCredentials,
  listServiceClients,
  revokeApiCredential,
} from "@/lib/api/endpoints";

vi.mock("@/lib/api/endpoints", () => ({
  createServiceClient: vi.fn(),
  generateApiCredential: vi.fn(),
  listApiCredentials: vi.fn(),
  listServiceClients: vi.fn(),
  revokeApiCredential: vi.fn(),
}));

const application = {
  id: "client-1", name: "Kitchen Buyer", description: null, status: "active",
  allowed_scopes: ["catalog:read", "supplier:read"], allowed_property_ids: [],
  allowed_supplier_ids: [], allowed_categories: [], spend_limit: null, created_at: null,
};

describe("Developer access page", () => {
  beforeEach(() => {
    vi.mocked(listServiceClients).mockResolvedValue([application]);
    vi.mocked(listApiCredentials).mockResolvedValue([]);
    vi.mocked(createServiceClient).mockResolvedValue(application);
    vi.mocked(generateApiCredential).mockResolvedValue({
      id: "credential-1", service_client_id: "client-1", credential_prefix: "abc123",
      name: "Primary credential", scopes: ["catalog:read"], expires_at: null,
      last_used_at: null, revoked_at: null, created_at: null, api_key: "nac_abc123_secret",
    });
    vi.mocked(revokeApiCredential).mockResolvedValue({
      id: "credential-1", service_client_id: "client-1", credential_prefix: "abc123",
      name: null, scopes: ["catalog:read"], expires_at: null, last_used_at: null,
      revoked_at: "2026-09-28T00:00:00Z", created_at: null,
    });
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("creates a one-time credential without fallback values", async () => {
    render(<DeveloperPage />);
    expect(await screen.findByText("Kitchen Buyer")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Generate" }));
    expect(await screen.findByText("nac_abc123_secret")).toBeTruthy();
    expect(generateApiCredential).toHaveBeenCalledWith("client-1", expect.objectContaining({ scopes: ["catalog:read", "supplier:read"] }));
  });

  it("creates an application from operator input", async () => {
    render(<DeveloperPage />);
    await screen.findByText("Kitchen Buyer");
    fireEvent.change(screen.getByLabelText("Application name"), { target: { value: "Invoice Agent" } });
    fireEvent.click(screen.getByRole("button", { name: "Create application" }));
    await waitFor(() => expect(createServiceClient).toHaveBeenCalledWith(expect.objectContaining({ name: "Invoice Agent" })));
  });
});
