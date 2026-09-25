import { Cable } from "lucide-react";
import { OperatorShellPage } from "@/components/control-center/OperatorShellPage";

export default function IntegrationsPage() {
  return (
    <OperatorShellPage
      eyebrow="Control Center"
      title="Integrations"
      description="Integration catalog entries exist, but provider authentication, sync adapters, and outbound procurement writes must be verified before being presented as live."
      icon={Cable}
      modules={[
        { title: "Connection Catalog", status: "Linked", body: "Existing backend catalog can describe providers without claiming implementation." },
        { title: "Inbound Events", status: "Linked", body: "The current foundation supports idempotent event receipts for implemented adapters." },
        { title: "Outbound Ordering", status: "Not available", body: "No fake supplier ordering integration is exposed." },
      ]}
    />
  );
}
