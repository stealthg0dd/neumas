"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, ClipboardList, PackageSearch } from "lucide-react";

import { EmptyState } from "@/components/control-center/EmptyState";
import { getMarginSummary } from "@/lib/api/endpoints";
import type { MarginDashboardSummary } from "@/lib/api/types";
import { captureUIError } from "@/lib/analytics";
import { formatCurrency } from "@/lib/currency";

const WASTE_TYPES = ["spoilage", "prep", "overproduction", "damage", "expiry", "quality_rejection", "unknown"];

function money(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? formatCurrency(parsed, "USD") : "N/A";
}

function text(value: unknown, fallback = "N/A") {
  return typeof value === "string" && value.trim() ? value : fallback;
}

function qty(row: Record<string, unknown>) {
  const quantity = row.quantity == null ? "N/A" : String(row.quantity);
  return `${quantity} ${text(row.uom, "")}`.trim();
}

export default function WastePage() {
  const [summary, setSummary] = useState<MarginDashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const payload = await getMarginSummary();
        if (!cancelled) setSummary(payload);
      } catch (err) {
        captureUIError("waste_summary_load", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const wasteEvents = summary?.waste_events ?? [];
  const totalWasteCost = summary?.top_metrics.waste_cost;

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-sky-700">Margin Control</p>
            <h1 className="mt-1 text-2xl font-semibold text-slate-950">Waste</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
              Waste events feed procurement requirements and margin attribution without estimating unavailable causes.
            </p>
          </div>
          <a href="/dashboard/inventory" className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white">
            <PackageSearch className="h-4 w-4" />
            Open inventory
          </a>
        </header>

        <section className="grid gap-4 md:grid-cols-3">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Waste Cost</p>
            <div className="mt-3 text-2xl font-semibold text-slate-950">{money(totalWasteCost)}</div>
            <p className="mt-2 text-xs leading-5 text-slate-500">Sum of verified waste-event costs for this property.</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Waste Events</p>
            <div className="mt-3 text-2xl font-semibold text-slate-950">{wasteEvents.length}</div>
            <p className="mt-2 text-xs leading-5 text-slate-500">Recorded events only. No expiry or spoilage estimates are substituted.</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Supported Types</p>
            <div className="mt-3 text-2xl font-semibold text-slate-950">{WASTE_TYPES.length}</div>
            <p className="mt-2 text-xs leading-5 text-slate-500">Spoilage, prep, overproduction, damage, expiry, quality rejection, unknown.</p>
          </div>
        </section>

        <section className="grid gap-4 lg:grid-cols-[1fr_320px]">
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex items-start justify-between gap-4 border-b border-slate-100 p-5">
              <div>
                <h2 className="text-lg font-semibold text-slate-950">Waste Events</h2>
                <p className="mt-1 text-sm text-slate-500">Events can update inventory through the ledger when linked to an inventory item.</p>
              </div>
              <ClipboardList className="h-5 w-5 text-slate-400" />
            </div>
            {wasteEvents.length ? (
              <table className="w-full min-w-[900px] text-left text-sm">
                <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Date</th>
                    <th className="px-4 py-3">Type</th>
                    <th className="px-4 py-3">Quantity</th>
                    <th className="px-4 py-3">Cost</th>
                    <th className="px-4 py-3">Reason</th>
                    <th className="px-4 py-3">Source</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {wasteEvents.map((row, index) => (
                    <tr key={text(row.id, String(index))}>
                      <td className="px-4 py-4">{text(row.event_date)}</td>
                      <td className="px-4 py-4 font-semibold text-slate-950">{text(row.waste_type, "unknown")}</td>
                      <td className="px-4 py-4">{qty(row)}</td>
                      <td className="px-4 py-4">{money(row.cost)}</td>
                      <td className="px-4 py-4">{text(row.reason)}</td>
                      <td className="px-4 py-4">{text(row.source, "manual")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : !loading ? (
              <div className="p-8">
                <EmptyState
                  headline="No waste events"
                  body="Record spoilage, prep, overproduction, damage, expiry, quality rejection, or unknown waste to feed procurement and margin attribution."
                />
              </div>
            ) : (
              <div className="h-72 animate-pulse bg-slate-50" />
            )}
          </div>

          <aside className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-start gap-3">
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-amber-50 text-amber-700">
                <AlertTriangle className="h-5 w-5" />
              </span>
              <div>
                <h2 className="text-lg font-semibold text-slate-950">Procurement Effect</h2>
                <p className="mt-1 text-sm leading-6 text-slate-600">
                  Waste increases future requirements only when a real event is recorded. Unknown or unsupported causes remain un-attributed until evidence exists.
                </p>
              </div>
            </div>
            <div className="mt-5 space-y-2">
              {WASTE_TYPES.map((type) => (
                <div key={type} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-700">
                  {type.replace("_", " ")}
                </div>
              ))}
            </div>
          </aside>
        </section>
      </div>
    </main>
  );
}
