import type { Metadata } from "next";

// Thin lead-capture form, not commercial content — keep out of search but let links be followed.
export const metadata: Metadata = {
  title: "Start Your Pilot | Neumas",
  description:
    "Start a 14-day pilot of Neumas, the AI operations intelligence platform for restaurants, cafes, cloud kitchens, and multi-location F&B operators.",
  robots: { index: false, follow: true },
};

export default function PilotLayout({ children }: { children: React.ReactNode }) {
  return children;
}
