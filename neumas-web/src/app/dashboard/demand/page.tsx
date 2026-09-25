import { LineChart } from "lucide-react";
import { OperatorShellPage } from "@/components/control-center/OperatorShellPage";

export default function DemandPage() {
  return (
    <OperatorShellPage
      eyebrow="Control Center"
      title="Demand"
      description="Demand uses the existing stockout prediction and forecast-confidence pipeline without introducing unverified sales or recipe signals."
      icon={LineChart}
      primaryAction={{ label: "Open predictions", href: "/dashboard/predictions" }}
      modules={[
        { title: "Forecast Confidence", status: "Live", body: "Existing predictions expose confidence and risk levels in the Control Center.", href: "/dashboard/predictions" },
        { title: "7-Day Procurement Need", status: "Linked", body: "Shown when existing decision-center or recommendation data produces a real 7-day need.", href: "/dashboard" },
        { title: "Demand Inputs", status: "Not available", body: "Sales, covers, reservations, recipes, and POS demand integrations are not active backend inputs yet." },
      ]}
    />
  );
}
