import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";

import type { ControlCenterKPI } from "@/lib/api/types";
import { formatCurrency } from "@/lib/currency";

function formatValue(kpi: ControlCenterKPI): string {
  if (kpi.value === null || kpi.value === undefined) return "N/A";
  if (typeof kpi.value === "string") return kpi.value;
  if (kpi.unit === "currency") return formatCurrency(kpi.value, "USD");
  if (kpi.unit === "percent_ratio") return `${Math.round(kpi.value * 100)}%`;
  if (kpi.unit === "%") return `${kpi.value.toFixed(1)}%`;
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 }).format(kpi.value);
}

export function MetricCard({ kpi }: { kpi: ControlCenterKPI }) {
  const tone =
    kpi.status === "risk"
      ? "border-rose-200 bg-rose-50/70 text-rose-700"
      : kpi.status === "good"
        ? "border-emerald-200 bg-emerald-50/70 text-emerald-700"
        : kpi.status === "watch"
          ? "border-amber-200 bg-amber-50/70 text-amber-700"
          : "border-slate-200 bg-white text-slate-500";
  const Icon = kpi.status === "good" ? ArrowDownRight : kpi.status === "risk" ? ArrowUpRight : Minus;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{kpi.label}</p>
        <span className={`inline-flex h-7 w-7 items-center justify-center rounded-full border ${tone}`}>
          <Icon className="h-3.5 w-3.5" />
        </span>
      </div>
      <div className="mt-3 text-2xl font-semibold tracking-normal text-slate-950">{formatValue(kpi)}</div>
      <p className="mt-2 line-clamp-2 min-h-[36px] text-xs leading-5 text-slate-500">
        {kpi.evidence[0] ?? "Awaiting verified operating evidence."}
      </p>
    </div>
  );
}
