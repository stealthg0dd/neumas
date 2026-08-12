import { getOnboardingState } from "@/lib/api/endpoints";
import type { OnboardingStateResponse } from "@/lib/api/types";
import type { WorkspaceExperience } from "@/lib/api/types";

/** Client-only: avoids /dashboard ↔ /onboard loops when user has 0 scans but finished onboarding (incl. skip). */
const KEY = "neumas_onboarding_complete";

export function isOnboardingComplete(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(KEY) === "1";
}

export function setOnboardingComplete(): void {
  localStorage.setItem(KEY, "1");
}

export async function fetchCanonicalOnboardingState(): Promise<OnboardingStateResponse | null> {
  try {
    return await getOnboardingState();
  } catch {
    return null;
  }
}

export function shouldRequireOnboarding(options: {
  onboarding: OnboardingStateResponse | null;
  hasLocalCompletion: boolean;
  hasScans: boolean;
  workspaceExperience?: WorkspaceExperience;
}): boolean {
  const { onboarding, hasLocalCompletion, hasScans, workspaceExperience } = options;
  if (workspaceExperience === "INVITED") return false;
  if (workspaceExperience === "HOUSEHOLD") return true;
  if (workspaceExperience === "NEEDS_PERSONA") return true;
  if (onboarding) {
    if (onboarding.is_complete || !onboarding.requires_onboarding) return false;
    if (onboarding.has_scans || onboarding.has_inventory_activity) return false;
  }
  if (hasScans || hasLocalCompletion) return false;
  return true;
}
