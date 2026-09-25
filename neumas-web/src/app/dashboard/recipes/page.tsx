import { FileText } from "lucide-react";
import { OperatorShellPage } from "@/components/control-center/OperatorShellPage";

export default function RecipesPage() {
  return (
    <OperatorShellPage
      eyebrow="Control Center"
      title="Recipes"
      description="Recipe and BOM costing are planned procurement-margin inputs but are not implemented in the current backend."
      icon={FileText}
      modules={[
        { title: "Recipe Library", status: "Not available", body: "No recipe or BOM tables are present yet." },
        { title: "Menu Costing", status: "Not available", body: "Food-cost calculations need recipe, yield, and sales inputs before they can be trusted." },
        { title: "Ingredient Mapping", status: "Linked", body: "Current canonical item and alias work can support this later through vendors and documents.", href: "/dashboard/vendors" },
      ]}
    />
  );
}
