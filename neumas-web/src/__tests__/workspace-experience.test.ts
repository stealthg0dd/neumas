import { describe, expect, it, vi } from "vitest";

vi.stubEnv("NEXT_PUBLIC_PERSONA_ONBOARDING_ENABLED", "true");

import { resolveWorkspaceExperience } from "@/lib/workspace-experience";

describe("workspace experience resolution", () => {
  it("marks a new account with no org_type as needing persona", () => {
    expect(
      resolveWorkspaceExperience(
        {
          user_id: "user-1",
          email: "new@example.com",
          full_name: null,
          org_id: "org-1",
          org_name: "Org",
          property_id: "prop-1",
          property_name: "Main Property",
          role: "admin",
        },
        {
          organization_id: "org-1",
          property_id: "prop-1",
          onboarding_status: "IN_PROGRESS",
          onboarding_version: 1,
          onboarding_source: "signup",
          has_scans: false,
          has_inventory_activity: false,
          is_complete: false,
          requires_onboarding: true,
        }
      )
    ).toBe("NEEDS_PERSONA");
  });

  it("routes canonical household users to household", () => {
    expect(
      resolveWorkspaceExperience({
        user_id: "user-1",
        email: "home@example.com",
        full_name: null,
        org_id: "org-1",
        org_name: "Home",
        property_id: "prop-1",
        property_name: "Home",
        role: "admin",
        org_type: "HOUSEHOLD",
      })
    ).toBe("HOUSEHOLD");
  });

  it("treats existing orgs without canonical org_type as legacy F&B when evidence exists", () => {
    expect(
      resolveWorkspaceExperience(
        {
          user_id: "user-1",
          email: "chef@example.com",
          full_name: null,
          org_id: "org-1",
          org_name: "Org",
          property_id: "prop-1",
          property_name: "Kitchen",
          role: "admin",
        },
        {
          organization_id: "org-1",
          property_id: "prop-1",
          onboarding_status: "IN_PROGRESS",
          onboarding_version: 1,
          has_scans: true,
          has_inventory_activity: false,
          is_complete: false,
          requires_onboarding: true,
        }
      )
    ).toBe("LEGACY_FNB");
  });

  it("does not ask invited members to choose persona again", () => {
    expect(
      resolveWorkspaceExperience({
        user_id: "user-1",
        email: "member@example.com",
        full_name: null,
        org_id: "org-1",
        org_name: "Org",
        property_id: "prop-1",
        property_name: "Kitchen",
        role: "staff",
        org_type: "FNB",
        is_invited_user: true,
      })
    ).toBe("INVITED");
  });
});
