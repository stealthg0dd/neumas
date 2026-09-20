import type { Metadata } from "next";

// Onboarding funnel: authenticated-adjacent, keep out of search entirely.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function OnboardLayout({ children }: { children: React.ReactNode }) {
  return children;
}
