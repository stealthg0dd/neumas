"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowRight, FileText, RefreshCw, ShoppingCart } from "lucide-react";

import { EmptyState } from "@/components/control-center/EmptyState";
import { EvidenceDrawer } from "@/components/control-center/EvidenceDrawer";
import { MetricCard } from "@/components/control-center/MetricCard";
import { OperationalTable } from "@/components/control-center/OperationalTable";
import { getControlCenterSummary } from "@/lib/api/endpoints";
import type { ControlCenterAction, ControlCenterSummary } from "@/lib/api/types";
import { captureUIError } from "@/lib/analytics";
import { formatCurrency } from "@/lib/currency";

function Section({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-slate-950">{title}</h2>
        {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
      </div>
      {children}
    </section>
  );
}

function SummaryTile({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-2 text-xl font-semibold text-slate-950">{value}</p>
      <p className="mt-2 text-sm leading-6 text-slate-500">{detail}</p>
    </div>
  );
}

function moneyOrNA(value: number | null | undefined) {
  return value === null || value === undefined ? "N/A" : formatCurrency(value, "USD");
}

function percentOrNA(value: number | null | undefined) {
  if (value === null || value === undefined) return "N/A";
  return `${Math.round((value <= 1 ? value * 100 : value) * 10) / 10}%`;
}

export default function DashboardPage() {
  const [summary, setSummary] = useState<ControlCenterSummary | null>(null);
  const [selectedEvidence, setSelectedEvidence] = useState<ControlCenterAction | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setSummary(await getControlCenterSummary());
    } catch (err) {
      captureUIError("control_center_summary_load", err);
      setError(err instanceof Error ? err.message : "Control Center unavailable.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const actionRows = useMemo(() => {
    if (!summary) return [];
    return [...summary.open_approvals, ...summary.recommendations, ...summary.risks].slice(0, 12);
  }, [summary]);

  if (loading) {
    return (
      <main className="min-h-screen bg-slate-50 px-4 py-6 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl space-y-6">
          <div className="h-24 animate-pulse rounded-2xl bg-white" />
          <div className="grid gap-4 md:grid-cols-4">
            {Array.from({ length: 8 }).map((_, index) => (
              <div key={index} className="h-36 animate-pulse rounded-2xl bg-white" />
            ))}
          </div>
          <div className="h-96 animate-pulse rounded-2xl bg-white" />
        </div>
      </main>
    );
  }

  if (error || !summary) {
    return (
      <main className="min-h-screen bg-slate-50 px-4 py-8 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-4xl">
          <EmptyState
            headline="Control Center unavailable"
            body={error ?? "The summary endpoint did not return a payload."}
            cta={{ label: "Retry", href: "/dashboard" }}
          />
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl space-y-7">
        <header className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-sky-700">Control Center</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-normal text-slate-950 md:text-3xl">
              Autonomous Procurement & Margin Control
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
              Exception-driven operating view for margin exposure, demand, inventory risk, procurement actions, approvals, and evidence.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void load()}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              <RefreshCw className="h-4 w-4" />
              Refresh
            </button>
            <Link
              href="/dashboard/procurement/recommendations"
              className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
            >
              <ShoppingCart className="h-4 w-4" />
              Review actions
            </Link>
          </div>
        </header>

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {summary.kpis.map((kpi) => (
            <MetricCard key={kpi.key} kpi={kpi} />
          ))}
        </section>

        <section className="grid gap-4 lg:grid-cols-3">
          <SummaryTile
            label="Margin Exposure"
            value={moneyOrNA(summary.margin_summary.margin_at_risk)}
            detail={summary.margin_summary.evidence[0] ?? "No margin risk evidence has been quantified yet."}
          />
          <SummaryTile
            label="Demand Outlook"
            value={`${summary.demand_summary.stock_risk_count} at risk`}
            detail={`Forecast confidence ${percentOrNA(summary.demand_summary.forecast_confidence)} across current prediction evidence.`}
          />
          <SummaryTile
            label="Supplier Performance"
            value={percentOrNA(summary.supplier_summary.supplier_otif)}
            detail={summary.supplier_summary.evidence[0] ?? "Supplier OTIF is not available until delivery outcomes exist."}
          />
        </section>

        <Section
          title="Procurement Actions"
          subtitle="Every row includes what changed, impact, evidence, recommended action, and approval state."
        >
          <OperationalTable
            actions={actionRows}
            emptyLabel="No procurement actions or operating risks are open for this property."
            onInspect={setSelectedEvidence}
          />
        </Section>

        <section className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
          <Section title="Inventory at Risk" subtitle="Live stock and alert evidence only.">
            <OperationalTable
              actions={summary.risks}
              emptyLabel="No inventory risk rows are open."
              onInspect={setSelectedEvidence}
            />
          </Section>
          <Section title="Exceptions" subtitle="Operator review queue for invoices, alerts, and unresolved signals.">
            {summary.exceptions.length ? (
              <div className="space-y-3">
                {summary.exceptions.slice(0, 6).map((item) => (
                  <button
                    key={`${item.category}-${item.id}`}
                    type="button"
                    onClick={() => setSelectedEvidence(item)}
                    className="block w-full rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm hover:border-sky-200"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-slate-950">{item.title}</p>
                        <p className="mt-1 text-sm leading-6 text-slate-600">{item.what_changed}</p>
                      </div>
                      <AlertTriangle className="h-4 w-4 text-amber-500" />
                    </div>
                    <p className="mt-3 text-xs font-medium text-slate-500">{item.recommended_action}</p>
                  </button>
                ))}
              </div>
            ) : (
              <EmptyState headline="No open exceptions" body="No review-required documents, alerts, or price exceptions are open." />
            )}
          </Section>
        </section>

        <section className="grid gap-6 xl:grid-cols-2">
          <Section title="Demand Outlook" subtitle="Forecast availability and learning state.">
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="grid gap-4 sm:grid-cols-2">
                <SummaryTile label="Forecast confidence" value={percentOrNA(summary.demand_summary.forecast_confidence)} detail={summary.demand_summary.evidence[0] ?? "No forecast confidence rows yet."} />
                <SummaryTile label="7-day need" value={moneyOrNA(summary.demand_summary.next_7_day_purchase_need)} detail={summary.demand_summary.evidence[1] ?? "No 7-day procurement need is available."} />
              </div>
              <p className="mt-4 text-sm text-slate-500">
                Learning state: {summary.demand_summary.learning_state ?? "Not reported"} · History days observed: {summary.demand_summary.history_days_observed}
              </p>
            </div>
          </Section>

          <Section title="Supplier Performance" subtitle="Supplier intelligence without fake fulfillment metrics.">
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="grid gap-4 sm:grid-cols-2">
                <SummaryTile label="Suppliers observed" value={String(summary.supplier_summary.supplier_count)} detail={summary.supplier_summary.evidence[0] ?? "No supplier metadata observed."} />
                <SummaryTile label="Price alerts" value={String(summary.supplier_summary.price_alert_count)} detail={summary.supplier_summary.evidence[1] ?? "No open supplier price alerts."} />
              </div>
              <p className="mt-4 text-sm text-slate-500">Supplier OTIF remains N/A until delivery records and supplier acknowledgements exist.</p>
            </div>
          </Section>
        </section>

        <Section title="Recent Autonomous / Approval Actions" subtitle="Recent lifecycle and document events from existing records.">
          {summary.recent_actions.length ? (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {summary.recent_actions.map((action) => (
                <button
                  key={`${action.category}-${action.id}`}
                  type="button"
                  onClick={() => setSelectedEvidence(action)}
                  className="rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm hover:border-sky-200"
                >
                  <p className="text-sm font-semibold text-slate-950">{action.title}</p>
                  <p className="mt-2 text-sm leading-6 text-slate-600">{action.what_changed}</p>
                  <p className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-sky-700">
                    Review evidence <ArrowRight className="h-3 w-3" />
                  </p>
                </button>
              ))}
            </div>
          ) : (
            <EmptyState headline="No recent actions" body="Neumas has no recent approval or lifecycle actions for this property." />
          )}
        </Section>

        <Section title="Evidence Panel" subtitle="Select any action row to inspect the supporting evidence.">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-start gap-3">
              <FileText className="mt-0.5 h-5 w-5 text-sky-700" />
              <p className="text-sm leading-6 text-slate-600">
                Evidence is attached to each action and comes from existing alerts, shopping-list lifecycle rows, documents, predictions, and inventory records.
              </p>
            </div>
          </div>
        </Section>
      </div>
      <EvidenceDrawer action={selectedEvidence} onClose={() => setSelectedEvidence(null)} />
    </main>
  );
}
