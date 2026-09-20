import type { Metadata } from "next";

// Authentication gate: keep out of search, but let crawlers follow its internal links (e.g. /signup).
export const metadata: Metadata = {
  robots: { index: false, follow: true },
};

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return children;
}
