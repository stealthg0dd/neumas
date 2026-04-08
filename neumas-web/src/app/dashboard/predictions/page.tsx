"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { listPredictions, triggerForecast } from "@/lib/api/endpoints";
import type { Prediction, UrgencyLevel } from "@/lib/api/types";
import { captureUIError } from "@/lib/analytics";
import { confidenceToPercent, daysUntilStockout, getFeatures, sortPredictionsByUrgencyThenDays } from "@/lib/prediction-display";
import { Button } from "@/components/ui/button";

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

export default function PredictionsPage() {
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [loading, setLoading] = useState(true);
  const [triggering, setTriggering] = useState(false);

  const fetchPredictions = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listPredictions({ limit: 200 });
      setPredictions(data);
    } catch (err) {
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
    } finally {
      setTriggering(false);
    }
  }

  return (
    <div className="max-w-3xl space-y-6 p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">Stockout Predictions</h1>
          <p className="mt-1 text-sm text-gray-500">AI forecast from your consumption patterns</p>
        </div>
        <Button
          type="button"
          size="sm"
          className="bg-blue-600 text-white hover:bg-blue-700"
          disabled={triggering}
          onClick={handleRunForecast}
        >
          {triggering ? "Running…" : "Run new forecast"}
        </Button>
      </div>

      <div className="mb-6 flex flex-wrap gap-3">
        {LEGEND.map(({ level, label, className }) => (
          <span key={level} className={`rounded-full px-2 py-1 font-mono text-xs ${className}`}>
            {label}
          </span>
        ))}
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-36 animate-pulse rounded-xl bg-gray-100" />
          ))}
        </div>
      ) : sorted.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 px-6 py-12 text-center">
          <p className="text-sm font-medium text-gray-900">No predictions yet</p>
          <p className="mt-2 text-sm text-gray-500">
            Scan receipts so we can learn your patterns, then run a forecast.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Link
              href="/dashboard/scans/new"
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              Scan a receipt
            </Link>
            <Button type="button" variant="outline" disabled={triggering} onClick={handleRunForecast}>
              Run new forecast
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
                className="mb-3 rounded-xl border border-gray-100 bg-white p-5 shadow-sm"
              >
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

                <div className="mt-3 h-1 rounded bg-gray-100">
                  <div
                    className={`h-1 rounded ${barColorClass(level)} transition-all`}
                    style={{ width: `${Math.min(100, conf)}%` }}
                  />
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  <Link
                    href="/dashboard/shopping"
                    className="inline-flex items-center rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700"
                  >
                    Add to shopping list
                  </Link>
                  <Link
                    href="/dashboard/shopping"
                    className="inline-flex items-center rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
                  >
                    Mark as purchased
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
