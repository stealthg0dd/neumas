import { LineChart } from "lucide-react";
import { OperatorShellPage } from "@/components/control-center/OperatorShellPage";

export default function PriceIntelligencePage() {
  return (
    <OperatorShellPage
      eyebrow="Procurement"
      title="Price Intelligence"
      description="Price intelligence uses observed invoice/catalog history where available and avoids synthetic supplier quotes."
      icon={LineChart}
      primaryAction={{ label: "Open vendors", href: "/dashboard/vendors" }}
      modules={[
        { title: "Observed Prices", status: "Live", body: "Vendor and item price history from processed documents remains available through vendors.", href: "/dashboard/vendors" },
        { title: "Price Alerts", status: "Linked", body: "Control Center can surface real open vendor price alerts when the backend table exists.", href: "/dashboard" },
        { title: "Quote Comparison", status: "Not available", body: "No live supplier quote adapter exists yet." },
      ]}
    />
  );
}
