"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  Download,
  ExternalLink,
  FileSpreadsheet,
  RefreshCw,
  XCircle,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { getDataReadiness } from "@/lib/api/endpoints";
import type { DataReadinessItem, DataReadinessResponse, DataReadinessStatus } from "@/lib/api/types";
import { captureUIError } from "@/lib/analytics";
import { cn } from "@/lib/utils";

interface CsvTemplate {
  key: string;
  filename: string;
  endpoint: string;
  importType: string;
  required: string[];
  optional: string[];
  rows: Record<string, string>[];
}

const CSV_TEMPLATES: CsvTemplate[] = [
  {
    key: "inventory",
    filename: "inventory.csv",
    endpoint: "/api/demand/imports",
    importType: "inventory.csv",
    required: ["name", "quantity"],
    optional: ["unit", "category", "sku", "location", "updated_at"],
    rows: [
      { name: "EXAMPLE - Replace with item name", quantity: "12", unit: "kg", category: "Produce", sku: "EXAMPLE-INV-001", location: "Main", updated_at: "2026-09-27" },
    ],
  },
  {
    key: "sales",
    filename: "sales.csv",
    endpoint: "/api/demand/imports",
    importType: "sales.csv",
    required: ["business_date", "item_name", "quantity"],
    optional: ["transaction_id", "service_period", "net_sales", "currency", "location"],
    rows: [
      { business_date: "2026-09-27", item_name: "EXAMPLE - Menu item", quantity: "18", transaction_id: "EXAMPLE-SALE-001", service_period: "dinner", net_sales: "270.00", currency: "USD", location: "Main" },
    ],
  },
  {
    key: "suppliers",
    filename: "suppliers.csv",
    endpoint: "/api/demand/imports",
    importType: "suppliers.csv",
    required: ["supplier_name"],
    optional: ["external_id", "contact_email", "phone", "approved"],
    rows: [
      { supplier_name: "EXAMPLE - Replace with supplier", external_id: "EXAMPLE-SUP-001", contact_email: "ops@example-supplier.test", phone: "+1 000 000 0000", approved: "true" },
    ],
  },
  {
    key: "supplier_prices",
    filename: "supplier_prices.csv",
    endpoint: "/api/food-graph/imports",
    importType: "supplier_prices",
    required: ["supplier_item_id", "price"],
    optional: ["currency", "effective_at", "idempotency_key"],
    rows: [
      { supplier_item_id: "EXAMPLE-SUPPLIER-ITEM-ID", price: "42.50", currency: "USD", effective_at: "2026-09-27", idempotency_key: "EXAMPLE-PRICE-001" },
    ],
  },
  {
    key: "recipes",
    filename: "recipes.csv",
    endpoint: "/api/food-graph/imports",
    importType: "recipes",
    required: ["name"],
    optional: ["category", "menu_price", "currency"],
    rows: [
      { name: "EXAMPLE - Replace with recipe", category: "Entree", menu_price: "18.00", currency: "USD" },
    ],
  },
  {
    key: "recipe_ingredients",
    filename: "recipe_ingredients.csv",
    endpoint: "/api/food-graph/imports",
    importType: "recipe_ingredients",
    required: ["recipe_id", "canonical_ingredient_id", "quantity"],
    optional: ["converted_base_quantity", "substitute_group"],
    rows: [
      { recipe_id: "EXAMPLE-RECIPE-VERSION-ID", canonical_ingredient_id: "EXAMPLE-INGREDIENT-ID", quantity: "0.25", converted_base_quantity: "0.25", substitute_group: "" },
    ],
  },
  {
    key: "invoices",
    filename: "invoices.csv",
    endpoint: "/api/demand/imports",
    importType: "invoices.csv",
    required: ["external_id"],
    optional: ["supplier_name", "invoice_date", "total_amount", "currency", "purchase_order_external_id"],
    rows: [
      { external_id: "EXAMPLE-INV-001", supplier_name: "EXAMPLE - Replace with supplier", invoice_date: "2026-09-27", total_amount: "1520.00", currency: "USD", purchase_order_external_id: "EXAMPLE-PO-001" },
    ],
  },
];

function csvEscape(value: string) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

function downloadTemplate(template: CsvTemplate) {
  const headers = [...template.required, ...template.optional];
  const csv = [
    headers.join(","),
    ...template.rows.map((row) => headers.map((header) => csvEscape(row[header] ?? "")).join(",")),
  ].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = template.filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function StatusPill({ status }: { status: DataReadinessStatus }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold",
        status === "READY" && "border-emerald-200 bg-emerald-50 text-emerald-700",
        status === "PARTIAL" && "border-amber-200 bg-amber-50 text-amber-700",
        status === "MISSING" && "border-slate-200 bg-slate-50 text-slate-500",
      )}
    >
      {status.replace("_", " ")}
    </span>
  );
}

function SetupRow({
  title,
  item,
  primaryHref,
  primaryLabel,
  templateKeys,
  secondary,
}: {
  title: string;
  item?: DataReadinessItem;
  primaryHref: string;
  primaryLabel: string;
  templateKeys?: string[];
  secondary?: string;
}) {
  const templates = CSV_TEMPLATES.filter((template) => templateKeys?.includes(template.key));
  const status = item?.status ?? "READY";
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            {status === "READY" ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <XCircle className="h-4 w-4 text-slate-400" />}
            <h2 className="text-base font-semibold text-slate-950">{title}</h2>
            <StatusPill status={status} />
          </div>
          <p className="mt-2 text-sm text-slate-600">
            {status === "READY" ? "Ready from current tenant data." : item?.required_action ?? secondary}
          </p>
          {item && (
            <p className="mt-1 text-xs text-slate-500">
              {item.record_count} records{item.last_updated ? `, last updated ${new Date(item.last_updated).toLocaleDateString()}` : ""}
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href={primaryHref}
            className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-slate-950 px-3 py-2 text-sm font-semibold text-white"
          >
            {primaryLabel}
            <ExternalLink className="h-4 w-4" />
          </Link>
          {templates.map((template) => (
            <Button
              key={template.key}
              type="button"
              variant="outline"
              className="gap-2"
              onClick={() => downloadTemplate(template)}
            >
              <Download className="h-4 w-4" />
              {template.filename}
            </Button>
          ))}
        </div>
      </div>
      {templates.length > 0 && (
        <div className="mt-4 grid gap-2 md:grid-cols-2">
          {templates.map((template) => (
            <div key={`${template.key}-meta`} className="rounded-lg border border-slate-100 bg-slate-50 p-3 text-xs text-slate-600">
              <p className="font-semibold text-slate-800">{template.filename}</p>
              <p className="mt-1">Required: {template.required.join(", ")}</p>
              <p className="mt-1">Optional: {template.optional.join(", ") || "none"}</p>
              <p className="mt-1">Import: {template.endpoint} as {template.importType}</p>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

export default function SetupPage() {
  const [readiness, setReadiness] = useState<DataReadinessResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useMemo(() => async () => {
    setLoading(true);
    setError(null);
    try {
      setReadiness(await getDataReadiness());
    } catch (err) {
      captureUIError("setup_readiness_load", err);
      setError("Unable to load setup readiness. Retry when the API is reachable.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-sky-700">Activation</p>
            <h1 className="mt-1 text-2xl font-semibold text-slate-950">Setup Hub</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
              Connect the minimum real data needed to unlock inventory, demand, procurement, and margin workflows.
            </p>
          </div>
          <Button type="button" variant="outline" className="gap-2" onClick={() => void load()}>
            <RefreshCw className="h-4 w-4" />
            Refresh readiness
          </Button>
        </header>

        {loading && <div className="h-40 animate-pulse rounded-xl border border-slate-200 bg-white" />}
        {error && <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}

        {readiness && (
          <>
            <section className="grid gap-3 md:grid-cols-3">
              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Overall</p>
                <p className="mt-2 text-2xl font-semibold text-slate-950">{readiness.overall_readiness}</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Tier</p>
                <p className="mt-2 text-2xl font-semibold text-slate-950">{readiness.readiness_tier ?? "MISSING"}</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Property</p>
                <p className="mt-2 truncate text-sm font-semibold text-slate-950">{readiness.property_id ?? "No active property"}</p>
              </div>
            </section>

            <div className="grid gap-4">
              <SetupRow title="Company" primaryHref="/dashboard/settings" primaryLabel="Open settings" secondary="Organization created." />
              <SetupRow title="Location" primaryHref="/dashboard/settings" primaryLabel="Manage location" secondary="Main location created." />
              <SetupRow title="Inventory" item={readiness.inventory_data} primaryHref="/dashboard/inventory" primaryLabel="Open inventory" templateKeys={["inventory"]} />
              <SetupRow title="Sales history" item={readiness.sales_data} primaryHref="/dashboard/demand" primaryLabel="Open demand" templateKeys={["sales"]} />
              <SetupRow title="Suppliers" item={readiness.supplier_data} primaryHref="/dashboard/procurement/suppliers" primaryLabel="Open suppliers" templateKeys={["suppliers", "supplier_prices"]} />
              <SetupRow title="Recipes" item={readiness.recipe_data} primaryHref="/dashboard/recipes" primaryLabel="Open recipes" templateKeys={["recipes", "recipe_ingredients"]} />
              <SetupRow title="Invoices" item={readiness.invoice_data} primaryHref="/dashboard/invoices" primaryLabel="Upload invoice" templateKeys={["invoices"]} />
              <SetupRow title="Accounting" primaryHref="/dashboard/integrations" primaryLabel="Connect Xero" secondary="Available when OAuth credentials are configured." />
            </div>

            <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center gap-2">
                <FileSpreadsheet className="h-5 w-5 text-sky-700" />
                <h2 className="text-base font-semibold text-slate-950">Template note</h2>
              </div>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                Templates include clearly labelled example rows for preview. Replace example values before committing an import.
              </p>
            </section>
          </>
        )}
      </div>
    </main>
  );
}
