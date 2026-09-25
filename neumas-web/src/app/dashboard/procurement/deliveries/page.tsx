import { Truck } from "lucide-react";
import { OperatorShellPage } from "@/components/control-center/OperatorShellPage";

export default function DeliveriesPage() {
  return (
    <OperatorShellPage
      eyebrow="Procurement"
      title="Deliveries"
      description="Delivery verification currently maps to receiving shopping-list items and posting inventory ledger movements."
      icon={Truck}
      primaryAction={{ label: "Open shopping receipts", href: "/dashboard/shopping" }}
      modules={[
        { title: "Receiving", status: "Live", body: "Existing shopping-list receipt actions update inventory through the ledger.", href: "/dashboard/shopping" },
        { title: "Supplier Acknowledgement", status: "Not available", body: "No supplier acknowledgement adapter is implemented." },
        { title: "OTIF", status: "Not available", body: "Supplier on-time/in-full needs delivery outcome records before it can be measured." },
      ]}
    />
  );
}
