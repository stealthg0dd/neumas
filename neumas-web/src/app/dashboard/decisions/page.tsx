import { Workflow } from "lucide-react";
import { OperatorShellPage } from "@/components/control-center/OperatorShellPage";

export default function DecisionsPage() {
  return (
    <OperatorShellPage
      eyebrow="Control Center"
      title="Decisions"
      description="The current decision surface is an operator action queue, not a durable autonomous decision ledger."
      icon={Workflow}
      primaryAction={{ label: "Open Control Center", href: "/dashboard" }}
      modules={[
        { title: "Action Queue", status: "Live", body: "Existing decision-center and control-center summaries produce an operator action queue.", href: "/dashboard" },
        { title: "Decision Ledger", status: "Not available", body: "No dedicated decision table or policy evaluation ledger exists yet." },
        { title: "Approval Workflow", status: "Live", body: "Shopping-list approval transitions remain the current human decision path.", href: "/dashboard/procurement/recommendations" },
      ]}
    />
  );
}
