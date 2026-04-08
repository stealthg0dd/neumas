/** Client-only: avoids /dashboard ↔ /onboard loops when user has 0 scans but finished onboarding (incl. skip). */
const KEY = "neumas_onboarding_complete";

export function isOnboardingComplete(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(KEY) === "1";
}

export function setOnboardingComplete(): void {
  localStorage.setItem(KEY, "1");
}
