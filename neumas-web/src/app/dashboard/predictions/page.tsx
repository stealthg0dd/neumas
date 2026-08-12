"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { toast } from "sonner";

import { getEntitlements, getForecastEligibility, getPredictionSummary, listPredictions, triggerForecast } from "@/lib/api/endpoints";
import type { ForecastEligibilityResponse, Prediction, PredictionOutcomeSummary, UrgencyLevel } from "@/lib/api/types";
import { captureUIError } from "@/lib/analytics";
import { confidenceToPercent, daysUntilStockout, getFeatures, sortPredictionsByUrgencyThenDays } from "@/lib/prediction-display";
import { Button } from "@/components/ui/button";
import { PageErrorState, PageLoadingState } from "@/components/ui/PageState";
import { useAuthStore } from "@/lib/store/auth";

const LEGEND: { level: UrgencyLevel; label: string; className: string }[] = [
  { level: "critical", label: "Critical", className: "bg-red-100 text-red-800 border border-red-200" },
  { level: "urgent", label: "Urgent", className: "bg-amber-100 text-amber-900 border border-amber-200" },
  { level: "soon", label: "Soon", className: "bg-yellow-100 text-yellow-900 border border-yellow-200" },
  { level: "later", label: "Later", className: "bg-gray-100 text-gray-800 border border-gray-200" },
];

function urgencyTextClass(level: UrgencyLevel): string {
  switch (level) {
    case "critical":
      return "text-red-600";
    case "urgent":
      return "text-amber-600";
    case "soon":
      return "text-yellow-700";
    default:
      return "text-gray-600";
  }
}

function barColorClass(level: UrgencyLevel): string {
  switch (level) {
    case "critical":
      return "bg-red-500";
    case "urgent":
      return "bg-amber-500";
    case "soon":
      return "bg-yellow-400";
    default:
      return "bg-gray-400";
  }
}

function badgeClass(level: UrgencyLevel): string {
  switch (level) {
    case "critical":
      return "bg-red-100 text-red-800";
    case "urgent":
      return "bg-amber-100 text-amber-900";
    case "soon":
      return "bg-yellow-100 text-yellow-800";
    default:
      return "bg-gray-100 text-gray-800";
  }
}

function leftBorderClass(level: UrgencyLevel): string {
  switch (level) {
    case "critical":
      return "border-l-red-500";
    case "urgent":
      return "border-l-amber-500";
    case "soon":
      return "border-l-yellow-400";
    default:
      return "border-l-gray-300";
  }
}

export default function PredictionsPage() {
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [loading, setLoading] = useState(true);
  const [triggering, setTriggering] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<PredictionOutcomeSummary | null>(null);
  const [forecastGuardrail, setForecastGuardrail] = useState<string | null>(null);
  const [eligibility, setEligibility] = useState<ForecastEligibilityResponse | null>(null);
  const workspace = useAuthStore((s) => s.profile?.org_type);

  const fetchPredictions = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listPredictions({ limit: 200 });
      setPredictions(data);
      const nextSummary = await getPredictionSummary().catch(() => null);
      setSummary(nextSummary);
      const nextEligibility = await getForecastEligibility().catch(() => null);
      setEligibility(nextEligibility);
      const entitlements = await getEntitlements().catch(() => null);
      if (entitlements?.limits.forecast_frequency_hours) {
        setForecastGuardrail(`Plan cadence: one forecast every ${entitlements.limits.forecast_frequency_hours}h`);
      } else {
        setForecastGuardrail(null);
      }
    } catch (err) {
      setError("We couldn't load stockout predictions.");
      captureUIError("load_predictions", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchPredictions();
  }, [fetchPredictions]);

  const sorted = useMemo(() => sortPredictionsByUrgencyThenDays(predictions), [predictions]);

  async function handleRunForecast() {
    setTriggering(true);
    try {
      await triggerForecast(14);
      toast.success("Forecast queued — results will update shortly.");
      setTimeout(() => void fetchPredictions(), 4000);
    } catch (err) {
      captureUIError("trigger_forecast", err);
      toast.error(err instanceof Error ? err.message : "Forecast unavailable.");
    } finally {
      setTriggering(false);
    }
  }

  return (
    <div className="max-w-3xl space-y-6 p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">Stockout Predictions</h1>
          <p className="mt-1 text-sm text-gray-500">Automatic forecast from receipt cycles, ledger evidence, and evolving consumption patterns</p>
          {forecastGuardrail ? <p className="mt-1 text-xs text-gray-400">{forecastGuardrail}</p> : null}
        </div>
        <Button
          type="button"
          size="sm"
          className="min-h-[44px] bg-blue-600 text-white hover:bg-blue-700 sm:min-h-0"
          disabled={triggering}
          onClick={handleRunForecast}
        >
          {triggering ? "Running…" : "Refresh forecast"}
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-xs text-gray-500">{workspace === "HOUSEHOLD" ? "Household learning" : "Forecast accuracy"}</p>
          <p className="mt-1 text-xl font-semibold text-gray-900">
            {summary?.insufficient_history
              ? `Insufficient history - ${summary?.sample_size ?? 0} evaluated`
              : `${Math.round((summary?.forecast_accuracy ?? 0) * 100)}%`}
          </p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-xs text-gray-500">{workspace === "HOUSEHOLD" ? "Confidence" : "Confidence calibration"}</p>
          <p className="mt-1 text-xl font-semibold text-gray-900">
            {summary?.insufficient_history || summary?.confidence_calibration == null
              ? "Needs more data"
              : `${Math.round(summary.confidence_calibration * 100)}%`}
          </p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-xs text-gray-500">Evaluated predictions</p>
          <p className="mt-1 text-xl font-semibold text-gray-900">{summary?.sample_size ?? 0}</p>
        </div>
      </div>

      {summary?.recent_outcomes?.length ? (
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-gray-900">Recent prediction outcomes</h2>
              <p className="text-sm text-gray-500">
                {workspace === "HOUSEHOLD" ? "Neumas is learning your household rhythm." : "Forecast confidence / evaluated predictions."}
              </p>
            </div>
          </div>
          <div className="mt-4 space-y-3">
            {summary.recent_outcomes.map((outcome) => (
              <div key={`${outcome.prediction_id}-${outcome.evaluated_at}`} className="rounded-lg border border-gray-100 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-medium text-gray-900">{outcome.item_name || "Inventory item"}</p>
                  <p className="text-xs text-gray-500">{new Date(outcome.evaluated_at).toLocaleDateString("en-US")}</p>
                </div>
                <div className="mt-1 flex flex-wrap gap-4 text-sm text-gray-600">
                  <span>Qty error: {outcome.quantity_error == null ? "—" : outcome.quantity_error.toFixed(1)}</span>
                  <span>Date error: {outcome.depletion_date_error_days == null ? "—" : `${outcome.depletion_date_error_days}d`}</span>
                  <span>{outcome.operator_overridden ? "Operator override" : "No override"}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="mb-6 flex flex-wrap gap-3">
        {LEGEND.map(({ level, label, className }) => (
          <span key={level} className={`rounded-full px-2 py-1 font-mono text-xs ${className}`}>
            {label}
          </span>
        ))}
      </div>

      {loading ? (
        <PageLoadingState
          title="Loading predictions"
          message="Forecasting inventory risk and confidence scores."
        />
      ) : error ? (
        <PageErrorState
          title="Predictions unavailable"
          message={error}
          onRetry={() => void fetchPredictions()}
        />
      ) : sorted.length === 0 ? (
        <div className="rounded-2xl border border-black/[0.06] bg-white p-10 text-center shadow-sm">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#f0f7fb]">
            <svg className="h-7 w-7 text-[#0071a3]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
          </div>
          <p className="text-[17px] font-bold text-gray-900">No forecasts yet</p>
          <p className="mt-2 max-w-sm mx-auto text-[14px] text-gray-500">
            {eligibility?.reason_code === "FORECAST_RUNNING"
              ? "Forecast is updating automatically."
              : eligibility?.reason_code === "ALREADY_FRESH"
                ? "Neumas is keeping this forecast fresh automatically."
              : `Neumas is building your consumption baseline. Learning from ${eligibility?.purchase_cycles_observed ?? eligibility?.evidence_cycles_available ?? 0} purchase cycle(s), ${eligibility?.consumption_movements_observed ?? 0} consumption movement(s), and ${eligibility?.history_days_observed ?? 0} day(s) of history. The next forecast will run automatically when enough evidence is present.`}
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Link
              href="/dashboard/scans/new"
              className="inline-flex items-center gap-2 rounded-xl bg-[#0071a3] px-6 py-2.5 text-[13px] font-semibold text-white hover:bg-[#005f8a] transition-colors"
            >
              Upload your next purchase document
            </Link>
            <Button type="button" variant="outline" disabled={triggering} onClick={handleRunForecast}>
              Manual refresh
            </Button>
          </div>
        </div>
      ) : (
        <div>
          {sorted.map((p) => {
            const level = p.stockout_risk_level ?? "later";
            const days = daysUntilStockout(p.prediction_date);
            const conf = confidenceToPercent(p.confidence);
            const feat = getFeatures(p);
            const sampleSize = feat?.sample_size ?? 0;
            const patternLabel =
              typeof feat?.reason === "string" && feat.reason.length > 0
                ? feat.reason
                : sampleSize > 0
                  ? `based on ${sampleSize} observations`
                  : "—";
            const daysSince =
              feat?.inventory_recency_days != null ? String(feat.inventory_recency_days) : "—";

            return (
              <div
                key={p.id}
                className={`mb-3 w-full rounded-xl border border-gray-100 border-l-4 bg-white p-5 shadow-sm ${leftBorderClass(level)}`}
              >
                <div className="mb-2 flex items-center justify-center gap-2 text-sm text-gray-400 sm:hidden">
                  <ChevronLeft className="h-4 w-4 shrink-0 opacity-60" aria-hidden />
                  <span className="text-sm">Swipe to dismiss</span>
                  <ChevronRight className="h-4 w-4 shrink-0 opacity-60" aria-hidden />
                </div>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex min-w-0 flex-1 items-center gap-2">
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${badgeClass(level)}`}>
                      {level}
                    </span>
                    <span className="truncate text-lg font-semibold text-gray-900">
                      {p.inventory_item?.name ?? "Unknown item"}
                    </span>
                  </div>
                  <span className={`font-mono text-2xl font-bold tabular-nums ${urgencyTextClass(level)}`}>
                    {days} days
                  </span>
                </div>

                <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-sm text-gray-600">
                  <span>Confidence: {conf}%</span>
                  <span>Pattern: {patternLabel}</span>
                  <span>Last inventory update: {daysSince === "—" ? "—" : `${daysSince} days ago`}</span>
                </div>
                <p className="mt-2 text-sm text-gray-700">
                  Action: {p.recommended_action ?? "Review this item"} over the next {p.time_horizon_days ?? days} day(s).
                </p>

                <div className="mt-3 h-1 rounded bg-gray-100">
                  <div
                    className={`h-1 rounded ${barColorClass(level)} transition-all`}
                    style={{ width: `${Math.min(100, conf)}%` }}
                  />
                </div>

                <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                  <Link
                    href="/dashboard/shopping"
                    className="inline-flex min-h-[44px] w-full items-center justify-center rounded-lg bg-blue-600 px-3 text-sm font-semibold text-white hover:bg-blue-700 sm:w-auto sm:min-h-0 sm:py-1.5 sm:text-xs"
                  >
                    Open reorder plan
                  </Link>
                  <Link
                    href="/dashboard/shopping"
                    className="inline-flex min-h-[44px] w-full items-center justify-center rounded-lg border border-gray-200 bg-white px-3 text-sm font-medium text-gray-700 hover:bg-gray-50 sm:w-auto sm:min-h-0 sm:py-1.5 sm:text-xs"
                  >
                    Confirm through shopping
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
