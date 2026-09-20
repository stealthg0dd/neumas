import type { Metadata } from "next";

import DashboardShell from "@/components/layout/DashboardShell";

// Authenticated app shell: keep entirely out of search (also disallowed in robots.txt).
export const metadata: Metadata = {
  robots: { index: false, follow: false, nocache: true },
};

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return <DashboardShell>{children}</DashboardShell>;
}
