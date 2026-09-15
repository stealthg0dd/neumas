import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Neumas Insights — F&B Operations Research",
  description:
    "Research on F&B operations, inventory intelligence, receipt and invoice processing, vendor signals, forecasts, reorder planning, and cost control.",
  robots: {
    index: false,
    follow: false,
    googleBot: {
      index: false,
      follow: false,
    },
  },
};

export default function InsightsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
