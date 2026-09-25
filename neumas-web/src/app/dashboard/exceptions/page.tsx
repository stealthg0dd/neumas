import { Bell } from "lucide-react";
import { OperatorShellPage } from "@/components/control-center/OperatorShellPage";

export default function ExceptionsPage() {
  return (
    <OperatorShellPage
      eyebrow="Control Center"
      title="Exceptions"
      description="Exceptions route operators to existing alerts, document review, and procurement approvals."
      icon={Bell}
      primaryAction={{ label: "Open alerts", href: "/dashboard/alerts" }}
      secondaryAction={{ label: "Open documents", href: "/dashboard/documents" }}
      modules={[
        { title: "Open Alerts", status: "Live", body: "Existing alert state remains the source for operational exceptions.", href: "/dashboard/alerts" },
        { title: "Invoice Review", status: "Live", body: "Review-needed documents appear as exceptions in Control Center.", href: "/dashboard/documents" },
        { title: "Approvals", status: "Live", body: "Procurement approvals use current shopping-list lifecycle states.", href: "/dashboard/procurement/recommendations" },
      ]}
    />
  );
}
