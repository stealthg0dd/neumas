import { ShoppingCart } from "lucide-react";
import { OperatorShellPage } from "@/components/control-center/OperatorShellPage";

export default function RecommendationsPage() {
  return (
    <OperatorShellPage
      eyebrow="Procurement"
      title="Recommendations"
      description="Recommendations reuse the current shopping-list approval workflow, preserving the working reorder lifecycle."
      icon={ShoppingCart}
      primaryAction={{ label: "Open shopping workflow", href: "/dashboard/shopping" }}
      secondaryAction={{ label: "Open restock preview", href: "/dashboard/restock" }}
      modules={[
        { title: "Approval Queue", status: "Live", body: "Recommended and awaiting-approval shopping lists appear in the Control Center and existing shopping workflow.", href: "/dashboard/shopping" },
        { title: "Restock Preview", status: "Live", body: "Existing restock previews remain reachable for operator review.", href: "/dashboard/restock" },
        { title: "External Auto-Order", status: "Not available", body: "No supplier write adapter is active, so Neumas does not claim autonomous order placement." },
      ]}
    />
  );
}
