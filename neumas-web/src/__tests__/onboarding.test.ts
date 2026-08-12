import { describe, expect, it } from "vitest";

import { shouldRequireOnboarding } from "@/lib/onboarding";

describe("onboarding compatibility gating", () => {
  it("keeps legacy local-complete users out of onboarding", () => {
    expect(
      shouldRequireOnboarding({
        onboarding: null,
        hasLocalCompletion: true,
        hasScans: false,
        workspaceExperience: "LEGACY_FNB",
      })
    ).toBe(false);
  });

  it("keeps backend-activated users out of onboarding after a fresh browser", () => {
    expect(
      shouldRequireOnboarding({
        onboarding: {
          organization_id: "org-1",
          property_id: "prop-1",
          onboarding_status: "ACTIVATED",
          onboarding_version: 1,
          has_scans: false,
          has_inventory_activity: false,
          is_complete: true,
          requires_onboarding: false,
        },
        hasLocalCompletion: false,
        hasScans: false,
        workspaceExperience: "FNB",
      })
    ).toBe(false);
  });

  it("routes a brand-new user with no backend completion and no scans to onboarding", () => {
    expect(
      shouldRequireOnboarding({
        onboarding: {
          organization_id: "org-1",
          property_id: "prop-1",
          onboarding_status: "NOT_STARTED",
          onboarding_version: 1,
          has_scans: false,
          has_inventory_activity: false,
          is_complete: false,
          requires_onboarding: true,
        },
        hasLocalCompletion: false,
        hasScans: false,
        workspaceExperience: "NEEDS_PERSONA",
      })
    ).toBe(true);
  });

  it("does not force invited members into onboarding", () => {
    expect(
      shouldRequireOnboarding({
        onboarding: null,
        hasLocalCompletion: false,
        hasScans: false,
        workspaceExperience: "INVITED",
      })
    ).toBe(false);
  });
});
