import { Landmark } from "lucide-react";
import { OperatorShellPage } from "@/components/control-center/OperatorShellPage";

export default function PurchaseOrdersPage() {
  return (
    <OperatorShellPage
      eyebrow="Procurement"
      title="Purchase Orders"
      description="Purchase orders require durable PO records, approval policy, supplier dispatch, acknowledgement, and reconciliation. Those are not implemented yet."
      icon={Landmark}
      modules={[
        { title: "PO Ledger", status: "Not available", body: "No purchase order table is present in the current schema." },
        { title: "Supplier Dispatch", status: "Not available", body: "Existing integration catalog entries are not outbound ordering adapters." },
        { title: "Approvals", status: "Linked", body: "Use the current shopping-list approval workflow until PO entities exist.", href: "/dashboard/procurement/recommendations" },
      ]}
    />
  );
}
