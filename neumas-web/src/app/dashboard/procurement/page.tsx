import { ShoppingCart } from "lucide-react";
import { OperatorShellPage } from "@/components/control-center/OperatorShellPage";

export default function ProcurementPage() {
  return (
    <OperatorShellPage
      eyebrow="Control Center"
      title="Procurement"
      description="Procurement is currently backed by the durable shopping-list/reorder lifecycle. External purchase order dispatch is not represented as live."
      icon={ShoppingCart}
      primaryAction={{ label: "Review recommendations", href: "/dashboard/procurement/recommendations" }}
      modules={[
        { title: "Recommendations", status: "Live", body: "Uses existing reorder and shopping-list workflow.", href: "/dashboard/procurement/recommendations" },
        { title: "Purchase Orders", status: "Not available", body: "No purchase-order table or external supplier dispatch adapter exists yet.", href: "/dashboard/procurement/purchase-orders" },
        { title: "Deliveries", status: "Linked", body: "Receiving is represented through current shopping-list item receipt state.", href: "/dashboard/procurement/deliveries" },
      ]}
    />
  );
}
