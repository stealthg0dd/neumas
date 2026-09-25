import { Receipt } from "lucide-react";
import { OperatorShellPage } from "@/components/control-center/OperatorShellPage";

export default function InvoicesPage() {
  return (
    <OperatorShellPage
      eyebrow="Control Center"
      title="Invoices"
      description="Invoices consolidate the existing document review and scan ingestion workflows while keeping raw scans out of primary navigation."
      icon={Receipt}
      primaryAction={{ label: "Review documents", href: "/dashboard/documents" }}
      secondaryAction={{ label: "Upload invoice", href: "/dashboard/scans/new" }}
      modules={[
        { title: "Review Queue", status: "Live", body: "Existing document review remains the operator workflow for extraction confirmation.", href: "/dashboard/documents" },
        { title: "Upload", status: "Live", body: "Scan upload is still reachable for invoice and receipt ingestion.", href: "/dashboard/scans/new" },
        { title: "History", status: "Live", body: "Raw scan history stays reachable as a technical support workflow.", href: "/dashboard/scans/history" },
      ]}
    />
  );
}
