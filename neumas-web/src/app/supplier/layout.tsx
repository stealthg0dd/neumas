import type { Metadata } from "next";

import SupplierShell from "@/components/layout/SupplierShell";

export const metadata: Metadata = {
  robots: { index: false, follow: false, nocache: true },
};

export default function SupplierLayout({ children }: { children: React.ReactNode }) {
  return <SupplierShell>{children}</SupplierShell>;
}
