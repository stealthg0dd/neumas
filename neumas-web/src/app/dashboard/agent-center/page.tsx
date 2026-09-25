import { Sparkles } from "lucide-react";
import { OperatorShellPage } from "@/components/control-center/OperatorShellPage";

export default function AgentCenterPage() {
  return (
    <OperatorShellPage
      eyebrow="Control Center"
      title="Agent Center"
      description="Agent Center will expose autonomous policy, action gateways, and verification loops once those durable records exist."
      icon={Sparkles}
      primaryAction={{ label: "Open Control Center", href: "/dashboard" }}
      modules={[
        { title: "Observe", status: "Live", body: "Invoices, scans, inventory movements, alerts, and predictions already feed the Control Center.", href: "/dashboard" },
        { title: "Act", status: "Not available", body: "No real external action gateway or supplier dispatch adapter exists yet." },
        { title: "Learn", status: "Linked", body: "Prediction evaluation exists, but procurement outcome learning is not complete.", href: "/dashboard/predictions" },
      ]}
    />
  );
}
