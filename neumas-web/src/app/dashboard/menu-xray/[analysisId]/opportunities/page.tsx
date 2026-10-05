"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Loader2,
  ScanSearch,
  Sparkles,
  TrendingDown,
  Zap,
} from "lucide-react";

import { getMenuXRayAnalysis, getMenuXRaySample } from "@/lib/api/endpoints";
import { useAuthStore, selectHasSession } from "@/lib/store/auth";
import { cn } from "@/lib/utils";
import type { MarginOpportunity, MenuXRayAnalysis } from "@/lib/api/types";

type AnalyticsWindow = Window & { analytics?: { track?: (e: string, p?: Record<string, unknown>) => void } };

function track(event: string, props?: Record<string, unknown>) {
  try {
    if (typeof window !== "undefined") {
      (window as AnalyticsWindow).analytics?.track?.(event, props);
    }
  } catch { /* no-op */ }
}

function effortColor(effort: string): string {
  if (effort === "Low") return "text-emerald-700 bg-emerald-50 border-emerald-200";
  if (effort === "Medium") return "text-amber-700 bg-amber-50 border-amber-200";
  return "text-red-700 bg-red-50 border-red-200";
}

function typeColor(type: string): string {
  if (type === "Procurement") return "text-[#0071a3] bg-[#f0f7fb] border-[#0071a3]/20";
  if (type === "Pricing") return "text-violet-700 bg-violet-50 border-violet-200";
  if (type === "Waste") return "text-orange-700 bg-orange-50 border-orange-200";
  return "text-teal-700 bg-teal-50 border-teal-200";
}

function TypeIcon({ type, className }: { type: string; className?: string }) {
  if (type === "Procurement") return <TrendingDown className={className} />;
  if (type === "Pricing") return <Sparkles className={className} />;
  if (type === "Waste") return <AlertTriangle className={className} />;
  return <Zap className={className} />;
}

function fmt(n: number, currency: string): string {
  const sym = currency === "SGD" ? "S$" : currency === "USD" ? "$" : `${currency} `;
  return `${sym}${n.toFixed(2)}`;
}

function confidenceBar(confidence: number | null | undefined) {
  if (confidence == null) return null;
  const pct = Math.round(confidence * 100);
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-gray-200">
        <div className="h-full rounded-full bg-[#0071a3]" style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[11px] font-medium text-[#0071a3]">{pct}%</span>
    </div>
  );
}

function OpportunityCard({ opp, currency, idx }: { opp: MarginOpportunity; currency: string; idx: number }) {
  const saving = opp.estimated_saving_per_dish ?? 0;

  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gray-50 text-[14px] font-bold text-gray-500">
          {idx + 1}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-1.5">
            <p className="text-[14px] font-bold text-gray-900">{opp.dish_name}</p>
            {opp.opportunity_type && (
              <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold", typeColor(opp.opportunity_type))}>
                <TypeIcon type={opp.opportunity_type} className="h-3 w-3" />
                {opp.opportunity_type}
              </span>
            )}
            {opp.effort && (
              <span className={cn("rounded-full border px-2 py-0.5 text-[10px] font-semibold", effortColor(opp.effort))}>
                {opp.effort} effort
              </span>
            )}
          </div>
          <p className="text-[13px] text-gray-600 leading-relaxed mb-3">{opp.opportunity_description}</p>
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-1.5 text-[12px] font-semibold text-emerald-700">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Save {fmt(saving, currency)}/dish
            </div>
            {opp.confidence != null && (
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] text-gray-400">Confidence</span>
                {confidenceBar(opp.confidence)}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function MenuXRayOpportunitiesPage() {
  const router = useRouter();
  const params = useParams<{ analysisId: string }>();
  const analysisId = params?.analysisId ?? "";
  const hasSession = useAuthStore(selectHasSession);
  const hasHydrated = useAuthStore((s) => s._hasHydrated);

  const [analysis, setAnalysis] = useState<MenuXRayAnalysis | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>("All");

  useEffect(() => {
    if (!hasHydrated) return;
    if (!hasSession) router.replace("/auth?next=/dashboard/menu-xray");
  }, [hasHydrated, hasSession, router]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = analysisId === "sample"
        ? await getMenuXRaySample()
        : await getMenuXRayAnalysis(analysisId);
      setAnalysis(res.analysis);
      track("menu_xray_opportunities_viewed", { analysis_id: analysisId });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load.");
    } finally {
      setLoading(false);
    }
  }, [analysisId]);

  useEffect(() => {
    if (hasHydrated && hasSession) void load();
  }, [hasHydrated, hasSession, load]);

  if (!hasHydrated || loading) {
    return (
      <div className="flex min-h-[500px] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-[#0071a3]" />
      </div>
    );
  }

  if (error || !analysis) {
    return (
      <div className="mx-auto max-w-2xl py-16 text-center">
        <p className="text-[15px] font-semibold text-gray-700">{error ?? "Analysis not found."}</p>
        <button type="button" onClick={() => void load()} className="mt-4 rounded-xl border border-gray-200 px-5 py-2.5 text-[13px] font-medium text-gray-600 hover:bg-gray-50">
          Retry
        </button>
      </div>
    );
  }

  const { insights, currency } = analysis;
  const allOpps = insights.top_margin_opportunities;

  // Infer opportunity_type if missing (some may be from the sample with partial data)
  const enriched = allOpps.map((opp) => ({
    ...opp,
    opportunity_type: opp.opportunity_type ?? "Procurement",
    effort: opp.effort ?? "Medium",
    confidence: opp.confidence ?? 0.7,
  }));

  const types = ["All", ...Array.from(new Set(enriched.map((o) => o.opportunity_type)))];
  const filtered = filter === "All" ? enriched : enriched.filter((o) => o.opportunity_type === filter);

  const totalSaving = enriched.reduce((sum, o) => sum + (o.estimated_saving_per_dish ?? 0), 0);
  const sym = currency === "SGD" ? "S$" : "$";

  return (
    <div className="mx-auto max-w-4xl space-y-6 pb-16">

      {/* Header */}
      <div>
        <button
          type="button"
          onClick={() => router.push(`/dashboard/menu-xray/${analysisId}`)}
          className="mb-4 flex items-center gap-1.5 text-[12px] font-medium text-gray-500 hover:text-gray-800"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to analysis
        </button>
        <div className="flex items-center gap-2 text-[11px] font-semibold tracking-widest text-[#0071a3] uppercase mb-2">
          <ScanSearch className="h-4 w-4" />
          Menu X-Ray · {analysis.menu_name}
        </div>
        <h1 className="text-[clamp(1.3rem,4vw,1.8rem)] font-bold tracking-tight text-gray-900">
          Margin Opportunities
        </h1>
        <p className="mt-1.5 text-[14px] text-gray-500 max-w-xl">
          {enriched.length} prioritised opportunities based on your menu economics.
          Estimates — connect supplier data for exact figures.
        </p>
      </div>

      {/* Summary strip */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm text-center">
          <p className="text-[10px] font-semibold tracking-widest text-gray-400 uppercase mb-1">Opportunities</p>
          <p className="text-[28px] font-black text-gray-900">{enriched.length}</p>
        </div>
        <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-4 shadow-sm text-center">
          <p className="text-[10px] font-semibold tracking-widest text-emerald-600 uppercase mb-1">Max Est. Saving</p>
          <p className="text-[22px] font-black text-emerald-800 leading-tight">
            {sym}{insights.estimated_monthly_opportunity?.toLocaleString() ?? totalSaving.toFixed(0)}
            <span className="text-[11px] font-normal text-emerald-600">/mo</span>
          </p>
        </div>
        <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm text-center">
          <p className="text-[10px] font-semibold tracking-widest text-gray-400 uppercase mb-1">Health Score</p>
          <p className={cn("text-[28px] font-black", insights.menu_health_score >= 70 ? "text-emerald-600" : insights.menu_health_score >= 50 ? "text-amber-600" : "text-red-600")}>
            {insights.menu_health_score}
          </p>
        </div>
        <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm text-center">
          <p className="text-[10px] font-semibold tracking-widest text-gray-400 uppercase mb-1">Margin Risks</p>
          <p className="text-[28px] font-black text-red-600">{insights.margin_risk_count}</p>
        </div>
      </div>

      {/* Conceptual progression */}
      <div className="rounded-2xl border border-[#0071a3]/15 bg-gradient-to-r from-[#f0f7fb] to-white p-5">
        <p className="text-[11px] font-semibold tracking-widest text-[#0071a3] uppercase mb-3">Your path to verified margin recovery</p>
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-0">
          {[
            { label: "ESTIMATED", sublabel: "Menu-based estimates", active: true },
            { label: "VERIFIED", sublabel: "Recipes + invoices + suppliers" },
            { label: "ACTION", sublabel: "Procurement + margin decisions" },
          ].map((step, i, arr) => (
            <div key={step.label} className="flex items-center gap-2">
              <div className={cn("rounded-xl px-3 py-2 text-center", step.active ? "bg-[#0071a3] text-white" : "bg-white border border-gray-200 text-gray-500")}>
                <p className={cn("text-[10px] font-bold", step.active ? "text-white/80" : "text-gray-400")}>{step.label}</p>
                <p className={cn("text-[11px] font-medium mt-0.5", step.active ? "text-white" : "text-gray-600")}>{step.sublabel}</p>
              </div>
              {i < arr.length - 1 && (
                <ArrowRight className="h-4 w-4 text-gray-300 shrink-0" />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Filter */}
      {types.length > 2 && (
        <div className="flex flex-wrap gap-2">
          {types.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setFilter(t)}
              className={cn(
                "rounded-full border px-3.5 py-1.5 text-[12px] font-semibold transition-colors",
                filter === t
                  ? "border-[#0071a3] bg-[#0071a3] text-white"
                  : "border-gray-200 bg-white text-gray-600 hover:border-gray-300"
              )}
            >
              {t}
            </button>
          ))}
        </div>
      )}

      {/* Opportunity list */}
      <div className="space-y-3">
        {filtered.length === 0 ? (
          <p className="text-[14px] text-gray-400 text-center py-8">No opportunities in this category.</p>
        ) : (
          filtered.map((opp, i) => (
            <OpportunityCard key={opp.dish_name + i} opp={opp} currency={currency} idx={i} />
          ))
        )}
      </div>

      {/* Conversion CTA */}
      <div className="rounded-2xl border border-amber-200 bg-gradient-to-br from-amber-50 to-white p-6 shadow-sm">
        <div className="flex items-center gap-2 mb-3">
          <Sparkles className="h-5 w-5 text-amber-500" />
          <p className="text-[14px] font-bold text-amber-900">Ready to act on these?</p>
        </div>
        <p className="text-[13px] text-amber-800 leading-relaxed mb-5">
          These are estimates from your menu. Connect real supplier prices, recipes, and invoices to Neumas and turn these opportunities into verified, actionable procurement decisions.
        </p>
        <div className="flex flex-col gap-3 sm:flex-row">
          <button
            type="button"
            onClick={() => {
              track("menu_xray_cta_action_plan", { analysis_id: analysisId });
              router.push(`/dashboard/setup?from=menu-xray&analysis_id=${analysisId}`);
            }}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-amber-500 py-3.5 text-[14px] font-semibold text-white shadow-sm hover:bg-amber-600"
          >
            <TrendingDown className="h-4 w-4" />
            Create My Action Plan
            <ArrowRight className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => {
              track("menu_xray_cta_connect_operation", { analysis_id: analysisId });
              router.push(`/onboard?from=menu-xray&analysis_id=${analysisId}`);
            }}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-amber-300 bg-white py-3.5 text-[14px] font-semibold text-amber-800 hover:bg-amber-50"
          >
            Connect My Operation
          </button>
        </div>
      </div>

    </div>
  );
}
