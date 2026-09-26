"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { BarChart3, ReceiptText, Scale, Wallet } from "lucide-react";

import { EmptyState } from "@/components/control-center/EmptyState";
import { getMarginSummary } from "@/lib/api/endpoints";
import type { MarginDashboardSummary } from "@/lib/api/types";
import { captureUIError } from "@/lib/analytics";
import { formatCurrency } from "@/lib/currency";

function money(value: number | null | undefined) {
  return value == null ? "N/A" : formatCurrency(value, "USD");
}

function pct(value: number | null | undefined) {
  if (value == null) return "N/A";
  return `${Number(value).toFixed(1)}%`;
}

function text(value: unknown, fallback = "Unattributed") {
  return typeof value === "string" && value.trim() ? value : fallback;
}

function numberValue(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function MetricTile({
  label,
  value,
  detail,
  tone = "slate",
}: {
  label: string;
  value: string;
  detail: string;
  tone?: "slate" | "rose" | "emerald" | "amber";
}) {
  const toneClass = {
    slate: "border-slate-200 bg-white text-slate-500",
    rose: "border-rose-200 bg-rose-50/70 text-rose-700",
    emerald: "border-emerald-200 bg-emerald-50/70 text-emerald-700",
    amber: "border-amber-200 bg-amber-50/70 text-amber-700",
  }[tone];
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
        <span className={`inline-flex h-7 w-7 items-center justify-center rounded-full border ${toneClass}`}>
          <Scale className="h-3.5 w-3.5" />
        </span>
      </div>
      <div className="mt-3 text-2xl font-semibold text-slate-950">{value}</div>
      <p className="mt-2 min-h-[36px] text-xs leading-5 text-slate-500">{detail}</p>
    </div>
  );
}

function DataPanel({
  title,
  description,
  rows,
  render,
}: {
  title: string;
  description: string;
  rows: Array<Record<string, unknown>>;
  render: (row: Record<string, unknown>, index: number) => ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-950">{title}</h2>
          <p className="mt-1 text-sm text-slate-500">{description}</p>
        </div>
        <BarChart3 className="h-5 w-5 text-slate-400" />
      </div>
      {rows.length ? (
        <div className="mt-4 space-y-3">{rows.map(render)}</div>
      ) : (
        <p className="mt-4 rounded-xl border border-dashed border-slate-200 p-5 text-sm text-slate-500">
          No verified records are available for this view yet.
        </p>
      )}
    </section>
  );
}

export default function MarginPage() {
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
        captureUIError("margin_summary_load", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const metrics = summary?.top_metrics;
  const hasEvidence = Boolean(summary && (summary.cost_trend.length || summary.leakage_waterfall.length || summary.waste_events.length));

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-sky-700">Margin Control</p>
            <h1 className="mt-1 text-2xl font-semibold text-slate-950">Margin</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
              Explainable food-cost, procurement, invoice, and waste variance from persisted operating records.
            </p>
          </div>
          <Link href="/dashboard/reports" className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white">
            <ReceiptText className="h-4 w-4" />
            Open reports
          </Link>
        </header>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <MetricTile label="Food Cost %" value={pct(metrics?.food_cost_pct)} detail="Realized food cost divided by verified revenue where available." tone="amber" />
          <MetricTile label="Food Cost vs Target" value={pct(metrics?.food_cost_vs_target)} detail="Target variance is shown only when a target exists." />
          <MetricTile label="Margin at Risk" value={money(metrics?.margin_at_risk)} detail="Open explainable leakage across supplier, invoice, and waste drivers." tone="rose" />
          <MetricTile label="Savings Captured" value={money(metrics?.savings_captured)} detail="Captured savings from closed outcomes." tone="emerald" />
          <MetricTile label="Supplier Leakage" value={money(metrics?.supplier_leakage)} detail="Supplier price and allocation variance backed by records." tone="rose" />
          <MetricTile label="Waste Cost" value={money(metrics?.waste_cost)} detail="Recorded spoilage, prep, overproduction, damage, expiry, and quality waste." tone="amber" />
          <MetricTile label="Invoice Recovery" value={money(metrics?.invoice_recovery)} detail="Invoice discrepancy impact available from reconciliation evidence." tone="emerald" />
          <MetricTile label="Procurement Efficiency" value={pct(metrics?.procurement_efficiency)} detail="Expected versus actual procurement outcomes." />
        </section>

        {!loading && !hasEvidence ? (
          <EmptyState
            headline="No margin evidence yet"
            body="Margin views activate from recipe costs, purchase orders, receipts, invoices, waste events, and completed outcomes. No fallback figures are displayed."
          />
        ) : null}

        <section className="grid gap-4 lg:grid-cols-2">
          <DataPanel
            title="Margin Leakage Waterfall"
            description="Attribution uses UNKNOWN when evidence is insufficient."
            rows={summary?.leakage_waterfall ?? []}
            render={(row, index) => (
              <div key={`${text(row.type)}-${index}`} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <p className="font-semibold text-slate-950">{text(row.type)}</p>
                <p className="mt-1 text-sm text-slate-600">{money(numberValue(row.amount))} · {text(row.confidence, "evidence pending")}</p>
              </div>
            )}
          />
          <DataPanel
            title="Top Opportunities"
            description="Human-review opportunities derived from persisted drivers."
            rows={summary?.top_opportunities ?? []}
            render={(row, index) => (
              <div key={`${text(row.type)}-${index}`} className="rounded-xl border border-slate-200 bg-white p-4">
                <p className="font-semibold text-slate-950">{text(row.type)}</p>
                <p className="mt-1 text-sm text-slate-600">{money(numberValue(row.amount))} possible impact</p>
              </div>
            )}
          />
        </section>

        <section className="grid gap-4 lg:grid-cols-3">
          <DataPanel
            title="Cost Trend"
            description="Snapshot history by scope."
            rows={summary?.cost_trend ?? []}
            render={(row, index) => (
              <div key={`${text(row.id, String(index))}`} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <p className="font-semibold text-slate-950">{text(row.snapshot_date, "Snapshot")}</p>
                <p className="mt-1 text-sm text-slate-600">{money(numberValue(row.realized_food_cost))} realized · {money(numberValue(row.margin_leakage))} leakage</p>
              </div>
            )}
          />
          <DataPanel
            title="Supplier Impact"
            description="Supplier leakage where evidence exists."
            rows={summary?.supplier_impact ?? []}
            render={(row, index) => (
              <div key={`${text(row.vendor_id, String(index))}`} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <p className="font-semibold text-slate-950">{text(row.vendor_name, "Supplier")}</p>
                <p className="mt-1 text-sm text-slate-600">{money(numberValue(row.impact))}</p>
              </div>
            )}
          />
          <DataPanel
            title="Category Impact"
            description="Category-level margin impact where records support it."
            rows={summary?.category_impact ?? []}
            render={(row, index) => (
              <div key={`${text(row.category, String(index))}`} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <p className="font-semibold text-slate-950">{text(row.category, "Category")}</p>
                <p className="mt-1 text-sm text-slate-600">{money(numberValue(row.impact))}</p>
              </div>
            )}
          />
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-slate-950">Savings Realized vs Projected</h2>
              <p className="mt-1 text-sm text-slate-500">Outcome learning compares expected cost, savings, quantity, service level, and waste impact.</p>
            </div>
            <Wallet className="h-5 w-5 text-slate-400" />
          </div>
          {(summary?.savings_realized_vs_projected ?? []).length ? (
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {summary?.savings_realized_vs_projected.map((row, index) => (
                <div key={`${text(row.decision_id, String(index))}`} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <p className="font-semibold text-slate-950">{text(row.decision_id, "Outcome")}</p>
                  <p className="mt-1 text-sm text-slate-600">{money(numberValue(row.actual_savings))} actual · {money(numberValue(row.expected_savings))} projected</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-4 rounded-xl border border-dashed border-slate-200 p-5 text-sm text-slate-500">
              No completed decision outcomes have projected and actual savings yet.
            </p>
          )}
        </section>
      </div>
    </main>
  );
}
