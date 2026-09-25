import { AlertTriangle } from "lucide-react";
import { OperatorShellPage } from "@/components/control-center/OperatorShellPage";

export default function WastePage() {
  return (
    <OperatorShellPage
      eyebrow="Control Center"
      title="Waste"
      description="Waste analytics require verified waste events or expiry outcomes. Current stock/expiry signals remain available through inventory and alerts."
      icon={AlertTriangle}
      primaryAction={{ label: "Open inventory", href: "/dashboard/inventory" }}
      modules={[
        { title: "Waste Events", status: "Not available", body: "No dedicated waste ledger exists yet." },
        { title: "Use-Soon Signals", status: "Linked", body: "Inventory expiry and alert views remain reachable for operator review.", href: "/dashboard/alerts" },
        { title: "Waste Forecast", status: "Not available", body: "No waste prediction model is implemented." },
      ]}
    />
  );
}
