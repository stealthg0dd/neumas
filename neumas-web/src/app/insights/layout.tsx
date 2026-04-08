import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Neumas Insights — Grocery Intelligence Research",
  description:
    "Weekly research on grocery trends, food waste reduction, and AI-powered household management across Southeast Asia.",
};

export default function InsightsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
