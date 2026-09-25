"use client";

import { useEffect, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { EvidenceDrawer } from "@/components/control-center/EvidenceDrawer";
import { getDemandSummary } from "@/lib/api/endpoints";
import type { ControlCenterAction, DemandDashboardSummary, DemandForecastItem } from "@/lib/api/types";
import { captureUIError } from "@/lib/analytics";

function pct(value: number | null | undefined) {
  if (value == null) return "N/A";
  return `${Math.round((value <= 1 ? value * 100 : value) * 10) / 10}%`;
}

function asEvidence(item: DemandForecastItem): ControlCenterAction {
  return {
    id: item.item_id ?? item.item_name,
    title: item.item_name,
    category: "demand",
    priority: item.risk === "critical" ? "P0" : item.risk === "high" ? "P1" : "P2",
    what_changed: `${item.item_name} forecast demand is ${item.forecast_demand}.`,
    impact: item.required_quantity ? `${item.required_quantity} required` : null,
    evidence: Object.entries(item.evidence ?? {}).map(([key, value]) => `${key}: ${String(value)}`),
    recommended_action: item.required_quantity && item.required_quantity > 0 ? "Create or update procurement recommendation." : "Monitor forecast.",
    approval_required: Boolean(item.required_quantity && item.required_quantity > 0),
    status: item.risk,
    href: "/dashboard/procurement/recommendations",
    confidence: item.confidence,
    metadata: item.evidence,
  };
}

export default function DemandPage() {
  const [summary, setSummary] = useState<DemandDashboardSummary | null>(null);
  const [selected, setSelected] = useState<ControlCenterAction | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const payload = await getDemandSummary();
        if (!cancelled) setSummary(payload);
      } catch (err) {
        captureUIError("demand_summary_load", err);
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
          <p className="text-xs font-semibold uppercase tracking-wide text-sky-700">Demand Intelligence</p>
          <h1 className="mt-1 text-2xl font-semibold text-slate-950">Demand Forecast</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
            Deterministic demand forecasts using sales history, day-of-week seasonality, trend, explicit signals, and recipe-ready canonical demand architecture.
          </p>
        </header>

        <section className="grid gap-4 lg:grid-cols-[1fr_320px]">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-950">7-Day Demand</h2>
            <p className="text-sm text-slate-500">Forecast confidence {pct(summary?.forecast_confidence)}</p>
            <div className="mt-4 h-72">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={summary?.chart ?? []}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="date" stroke="#64748b" tick={{ fontSize: 12 }} />
                  <YAxis stroke="#64748b" tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Line type="monotone" dataKey="demand" stroke="#0369a1" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-950">Critical Demand Changes</h2>
            <div className="mt-4 space-y-3">
              {(summary?.critical_changes ?? []).length ? (
                summary?.critical_changes.map((item) => (
                  <button key={item.item_name} type="button" onClick={() => setSelected(asEvidence(item))} className="w-full rounded-xl border border-rose-100 bg-rose-50 p-3 text-left">
                    <p className="font-semibold text-rose-900">{item.item_name}</p>
                    <p className="text-sm text-rose-700">{item.required_quantity ?? 0} required · {pct(item.confidence)}</p>
                  </button>
                ))
              ) : (
                <p className="text-sm text-slate-500">No critical demand changes from current evidence.</p>
              )}
            </div>
          </div>
        </section>

        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full min-w-[1100px] text-left text-sm">
            <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Item / Ingredient</th>
                <th className="px-4 py-3">Current stock</th>
                <th className="px-4 py-3">Forecast demand</th>
                <th className="px-4 py-3">Projected stock</th>
                <th className="px-4 py-3">Required quantity</th>
                <th className="px-4 py-3">Recommended order date</th>
                <th className="px-4 py-3">Confidence</th>
                <th className="px-4 py-3">Risk</th>
                <th className="px-4 py-3">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {(summary?.items ?? []).map((item) => (
                <tr key={`${item.item_type}-${item.item_name}`}>
                  <td className="px-4 py-4 font-semibold text-slate-950">{item.item_name}</td>
                  <td className="px-4 py-4">{item.current_stock ?? "N/A"}</td>
                  <td className="px-4 py-4">{item.forecast_demand}</td>
                  <td className="px-4 py-4">{item.projected_stock ?? "N/A"}</td>
                  <td className="px-4 py-4">{item.required_quantity ?? "N/A"}</td>
                  <td className="px-4 py-4">{item.recommended_order_date ?? "N/A"}</td>
                  <td className="px-4 py-4">{pct(item.confidence)}</td>
                  <td className="px-4 py-4">{item.risk}</td>
                  <td className="px-4 py-4">
                    <button type="button" onClick={() => setSelected(asEvidence(item))} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700">
                      Evidence
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {summary && summary.items.length === 0 && (
            <div className="border-t border-slate-100 p-8 text-center text-sm text-slate-500">
              No demand forecast rows yet. Import sales.csv to generate demand intelligence.
            </div>
          )}
        </section>
      </div>
      <EvidenceDrawer action={selected} onClose={() => setSelected(null)} />
    </main>
  );
}
