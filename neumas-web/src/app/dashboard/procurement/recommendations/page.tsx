"use client";

import { useEffect, useState } from "react";

import { EvidenceDrawer } from "@/components/control-center/EvidenceDrawer";
import { getProcurementSummary } from "@/lib/api/endpoints";
import type { ControlCenterAction, ProcurementRecommendation, ProcurementSummary } from "@/lib/api/types";
import { captureUIError } from "@/lib/analytics";
import { formatCurrency } from "@/lib/currency";

function asAction(row: ProcurementRecommendation): ControlCenterAction {
  const allocation = row.selected_allocations.map((a) => `${a.vendor_name}: ${a.quantity}`).join("; ");
  return {
    id: row.id ?? row.canonical_ingredient_id,
    title: row.ingredient_name,
    category: "procurement",
    priority: row.risk === "blocked" ? "P0" : row.risk === "watch" ? "P1" : "P2",
    what_changed: `Required quantity is ${row.required_quantity}. Recommended allocation: ${allocation || "none"}.`,
    impact: row.expected_savings != null ? `${formatCurrency(row.expected_savings, "USD")} expected savings` : null,
    evidence: Object.entries(row.evidence ?? {}).map(([k, v]) => `${k}: ${String(v)}`),
    recommended_action: "Review optimizer allocation and convert to an approval decision when ready.",
    approval_required: true,
    status: row.status,
    href: "/dashboard/decisions",
    confidence: row.confidence,
    metadata: row.evidence,
  };
}

export default function RecommendationsPage() {
  const [summary, setSummary] = useState<ProcurementSummary | null>(null);
  const [selected, setSelected] = useState<ControlCenterAction | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const payload = await getProcurementSummary();
        if (!cancelled) setSummary(payload);
      } catch (err) {
        captureUIError("procurement_recommendations_load", err);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-sky-700">Procurement Optimizer</p>
          <h1 className="mt-1 text-2xl font-semibold text-slate-950">Recommendations</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
            Deterministic supplier allocation using requirement, MOQ, pack rounding, lead time, approved suppliers, delivery cost, and reliability.
          </p>
        </header>
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full min-w-[1100px] text-left text-sm">
            <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Ingredient</th>
                <th className="px-4 py-3">Required qty</th>
                <th className="px-4 py-3">Recommended supplier/allocation</th>
                <th className="px-4 py-3">Current supplier</th>
                <th className="px-4 py-3">Price</th>
                <th className="px-4 py-3">Savings</th>
                <th className="px-4 py-3">Lead time</th>
                <th className="px-4 py-3">Confidence</th>
                <th className="px-4 py-3">Risk</th>
                <th className="px-4 py-3">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {(summary?.recommendations ?? []).map((row) => {
                const first = row.selected_allocations[0];
                return (
                  <tr key={row.id ?? row.canonical_ingredient_id}>
                    <td className="px-4 py-4 font-semibold text-slate-950">{row.ingredient_name}</td>
                    <td className="px-4 py-4">{row.required_quantity}</td>
                    <td className="px-4 py-4">{row.selected_allocations.map((a) => `${a.vendor_name} (${a.quantity})`).join(", ") || "No supplier"}</td>
                    <td className="px-4 py-4">{row.current_supplier_id ?? "N/A"}</td>
                    <td className="px-4 py-4">{formatCurrency(row.expected_cost, "USD")}</td>
                    <td className="px-4 py-4">{row.expected_savings == null ? "N/A" : formatCurrency(row.expected_savings, "USD")}</td>
                    <td className="px-4 py-4">{first ? `${first.lead_time_days}d` : "N/A"}</td>
                    <td className="px-4 py-4">{Math.round(row.confidence * 100)}%</td>
                    <td className="px-4 py-4">{row.risk}</td>
                    <td className="px-4 py-4">
                      <button type="button" onClick={() => setSelected(asAction(row))} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700">
                        Evidence
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {summary && summary.recommendations.length === 0 && <div className="p-8 text-center text-sm text-slate-500">No procurement recommendations yet.</div>}
        </section>
      </div>
      <EvidenceDrawer action={selected} onClose={() => setSelected(null)} />
    </main>
  );
}
