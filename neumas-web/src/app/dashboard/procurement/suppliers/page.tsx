import { Truck } from "lucide-react";
import { OperatorShellPage } from "@/components/control-center/OperatorShellPage";

export default function SuppliersPage() {
  return (
    <OperatorShellPage
      eyebrow="Procurement"
      title="Suppliers"
      description="Supplier intelligence reuses the current vendors, aliases, catalog, and analytics surfaces."
      icon={Truck}
      primaryAction={{ label: "Open vendors", href: "/dashboard/vendors" }}
      modules={[
        { title: "Vendor Directory", status: "Live", body: "Existing vendor management remains the source of truth.", href: "/dashboard/vendors" },
        { title: "Vendor Analytics", status: "Live", body: "Existing vendor analytics remain reachable from the vendors screen.", href: "/dashboard/vendors" },
        { title: "Supplier Ordering", status: "Not available", body: "No live external supplier ordering adapter is configured." },
      ]}
    />
  );
}
