import { Wallet } from "lucide-react";
import { OperatorShellPage } from "@/components/control-center/OperatorShellPage";

export default function MarginPage() {
  return (
    <OperatorShellPage
      eyebrow="Control Center"
      title="Margin"
      description="Margin exposure will use verified food-cost, invoice, recipe, waste, and procurement outcome records as those modules come online."
      icon={Wallet}
      primaryAction={{ label: "Open reports", href: "/dashboard/reports" }}
      modules={[
        { title: "Food Cost %", status: "Not available", body: "No production food-cost calculation exists yet, so the app does not show a fabricated percentage." },
        { title: "Margin at Risk", status: "Linked", body: "Current quantified margin risk appears in the Control Center when alert metadata includes financial impact.", href: "/dashboard" },
        { title: "Savings Captured", status: "Linked", body: "Captured savings are shown only when existing impact evaluation data reports variance.", href: "/dashboard" },
      ]}
    />
  );
}
