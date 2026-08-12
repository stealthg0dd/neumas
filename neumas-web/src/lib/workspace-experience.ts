import type {
  OnboardingStateResponse,
  ProfileResponse,
  WorkspaceExperience,
} from "@/lib/api/types";

export function isPersonaOnboardingEnabled(): boolean {
  return process.env.NEXT_PUBLIC_PERSONA_ONBOARDING_ENABLED === "true";
}

function normalizeOrgType(value: string | null | undefined): string | null {
  const raw = (value ?? "").trim();
  if (!raw) return null;

  const normalized = raw.toUpperCase().replace(/[\s-]+/g, "_");
  if (
    normalized === "FNB" ||
    normalized === "HOUSEHOLD" ||
    normalized === "RETAIL_BUSINESS"
  ) {
    return normalized;
  }
  if (
    normalized === "RESTAURANT" ||
    normalized === "HOTEL" ||
    normalized === "CAFE" ||
    normalized === "CAFÉ" ||
    normalized === "BAR" ||
    normalized === "CATERING" ||
    normalized === "OTHER"
  ) {
    return "FNB";
  }
  if (normalized === "HOME") {
    return "HOUSEHOLD";
  }
  return raw;
}

export function resolveWorkspaceExperience(
  profile: ProfileResponse | null | undefined,
  onboarding?: OnboardingStateResponse | null
): WorkspaceExperience {
  if (!isPersonaOnboardingEnabled()) {
    const orgType = normalizeOrgType(onboarding?.org_type ?? profile?.org_type);
    if (orgType === "HOUSEHOLD") return "HOUSEHOLD";
    if (orgType === "FNB") return "FNB";
    return "LEGACY_FNB";
  }

  const hinted = onboarding?.workspace_experience ?? profile?.workspace_experience;
  if (
    hinted === "FNB" ||
    hinted === "HOUSEHOLD" ||
    hinted === "LEGACY_FNB" ||
    hinted === "NEEDS_PERSONA" ||
    hinted === "INVITED"
  ) {
    return hinted;
  }

  const orgType = normalizeOrgType(onboarding?.org_type ?? profile?.org_type);
  const invited = Boolean(onboarding?.is_invited_user ?? profile?.is_invited_user);
  if (orgType === "FNB") return invited ? "INVITED" : "FNB";
  if (orgType === "HOUSEHOLD") return invited ? "INVITED" : "HOUSEHOLD";
  if (onboarding) {
    if (onboarding.has_scans || onboarding.has_inventory_activity) {
      return "LEGACY_FNB";
    }
    return "NEEDS_PERSONA";
  }
  if (profile?.property_id) {
    return "LEGACY_FNB";
  }
  return "NEEDS_PERSONA";
}

export function routeForWorkspaceExperience(
  experience: WorkspaceExperience,
  profile: ProfileResponse | null | undefined,
  onboarding?: OnboardingStateResponse | null
): string {
  const orgType = normalizeOrgType(onboarding?.org_type ?? profile?.org_type);
  if (experience === "HOUSEHOLD") return "/onboard/home";
  if (experience === "INVITED" && orgType === "HOUSEHOLD") return "/dashboard";
  return experience === "NEEDS_PERSONA" ? "/onboard" : "/dashboard";
}
