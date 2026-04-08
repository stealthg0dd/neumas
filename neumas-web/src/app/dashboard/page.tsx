"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Brain } from "lucide-react";

import {
  getAnalyticsSummary,
  listPredictions,
  listScans,
  listShoppingLists,
  getShoppingList,
} from "@/lib/api/endpoints";
import type { AnalyticsSummary, Prediction, Scan, ShoppingListDetail, UrgencyLevel } from "@/lib/api/types";
import { captureUIError } from "@/lib/analytics";
import {
  confidenceToPercent,
  daysUntilStockout,
  getFeatures,
  sortPredictionsByUrgencyThenDays,
} from "@/lib/prediction-display";

function formatRelativeUpdated(iso: string | undefined): string {
  if (!iso) return "just now";
  const t = new Date(iso).getTime();
  const sec = Math.floor((Date.now() - t) / 1000);
  if (sec < 10) return "just now";
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

const URGENCY_CARD: Record<
  UrgencyLevel,
  { wrap: string; border: string; dot: string }
> = {
  critical: {
    wrap: "bg-red-50 border-red-200",
    border: "border-red-200",
    dot: "bg-red-400",
  },
  urgent: {
    wrap: "bg-amber-50 border-amber-200",
    border: "border-amber-200",
    dot: "bg-amber-400",
  },
  soon: {
    wrap: "bg-yellow-50 border-yellow-100",
    border: "border-yellow-100",
    dot: "bg-yellow-300",
  },
  later: {
    wrap: "bg-gray-50 border-gray-100",
    border: "border-gray-100",
    dot: "bg-gray-300",
  },
};

function scanStatusLabel(s: Scan): string {
  if (s.status === "pending" || s.status === "processing") return "processing";
  return s.status;
}

export default function DashboardPage() {
  const [loading, setLoading] = useState(true);
  const [analytics, setAnalytics] = useState<AnalyticsSummary | null>(null);
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [scans, setScans] = useState<Scan[]>([]);
  const [listPreview, setListPreview] = useState<ShoppingListDetail | null>(null);
  const [updatedLabel, setUpdatedLabel] = useState("just now");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [sum, preds, recentScans, lists] = await Promise.all([
        getAnalyticsSummary(),
        listPredictions({ limit: 100 }),
        listScans({ limit: 3 }),
        listShoppingLists({ limit: 1 }),
      ]);
      setAnalytics(sum);
      setPredictions(preds);
      setScans(Array.isArray(recentScans) ? recentScans : []);

      const lastHist = sum.confidence_history?.length
        ? sum.confidence_history[sum.confidence_history.length - 1]?.date
        : undefined;
      setUpdatedLabel(formatRelativeUpdated(lastHist));

      if (lists.length > 0) {
        try {
          const detail = await getShoppingList(lists[0].id);
          setListPreview(detail);
        } catch {
          setListPreview(null);
        }
      } else {
        setListPreview(null);
      }
    } catch (err) {
      captureUIError("dashboard_overview", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const sortedPreds = useMemo(() => sortPredictionsByUrgencyThenDays(predictions), [predictions]);

  const bannerPred = useMemo(() => {
    return sortedPreds.find(
      (p) => p.stockout_risk_level === "critical" || p.stockout_risk_level === "urgent"
    );
  }, [sortedPreds]);

  const topThree = useMemo(() => sortedPreds.slice(0, 3), [sortedPreds]);

  const nextStockoutLabel = useMemo(() => {
    if (sortedPreds.length === 0) return "—";
    const nearest = sortedPreds.reduce((best, p) => {
      const d = daysUntilStockout(p.prediction_date);
      const bd = daysUntilStockout(best.prediction_date);
      return d < bd ? p : best;
    });
    const d = daysUntilStockout(nearest.prediction_date);
    if (d === 0) return "Today";
    if (d === 1) return "1 day";
    return `${d} days`;
  }, [sortedPreds]);

  const accuracyPct = analytics ? Math.min(100, Math.max(0, analytics.avg_confidence_pct)) : 0;
  const hoursToNext = Math.max(1, 24 - new Date().getHours());

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-gray-900">Overview</h1>
        <p className="mt-1 text-sm text-gray-500">What you need to do right now</p>
      </div>

      {loading ? (
        <div className="space-y-4">
          <div className="h-24 animate-pulse rounded-xl bg-gray-100" />
          <div className="h-40 animate-pulse rounded-2xl bg-gray-100" />
          <div className="grid grid-cols-3 gap-4">
            <div className="h-28 animate-pulse rounded-xl bg-gray-100" />
            <div className="h-28 animate-pulse rounded-xl bg-gray-100" />
            <div className="h-28 animate-pulse rounded-xl bg-gray-100" />
          </div>
        </div>
      ) : (
        <>
          {bannerPred && (
            <div className="mb-6 flex flex-wrap items-center gap-3 rounded-xl border border-red-200 bg-red-50 p-4">
              <AlertTriangle className="h-5 w-5 shrink-0 text-red-600" aria-hidden />
              <p className="min-w-0 flex-1 text-sm font-medium text-red-900">
                You&apos;re likely to run out of{" "}
                <span className="font-semibold">
                  {bannerPred.inventory_item?.name ?? "an item"}
                </span>{" "}
                in {daysUntilStockout(bannerPred.prediction_date)} days
              </p>
              <Link
                href="/dashboard/shopping"
                className="shrink-0 rounded-lg border border-red-300 bg-white px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-100"
              >
                Add to list →
              </Link>
            </div>
          )}

          <section className="mb-6 rounded-2xl border border-blue-100 bg-blue-50 p-6">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="flex items-center gap-2">
                <Brain className="h-6 w-6 shrink-0 text-blue-600" aria-hidden />
                <h3 className="text-lg font-semibold text-gray-900">AI Intelligence Center</h3>
              </div>
              <span className="text-xs text-blue-400">Updated {updatedLabel}</span>
            </div>
            <p className="mt-1 text-sm text-blue-700">
              Learning from {analytics?.items_tracked ?? 0} items across {analytics?.scans_total ?? 0}{" "}
              receipts
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <span className="text-xs text-blue-500">Prediction accuracy</span>
              <div className="h-2 min-w-[120px] flex-1 rounded bg-blue-100">
                <div
                  className="h-2 rounded bg-blue-500 transition-all duration-1000"
                  style={{ width: `${accuracyPct}%` }}
                />
              </div>
              <span className="font-mono text-xs text-blue-700">{accuracyPct}%</span>
            </div>
            <p className="mt-1 text-xs text-blue-400">Accuracy improves with each receipt scan</p>
            <p className="mt-2 text-xs text-blue-400">Next prediction update: in {hoursToNext} hours</p>
          </section>

          <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
              <p className="text-xs font-medium uppercase tracking-wider text-gray-400">Items tracked</p>
              <p className="mt-1 text-3xl font-bold tabular-nums text-gray-900">{analytics?.items_tracked ?? 0}</p>
              <p className="mt-1 text-xs text-gray-400">From your pantry</p>
            </div>
            <div className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
              <p className="text-xs font-medium uppercase tracking-wider text-gray-400">Predicted savings</p>
              <p className="mt-1 text-3xl font-bold tabular-nums text-gray-900">
                ${(analytics?.spend_total ?? 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}
              </p>
              <p className="mt-1 text-xs text-gray-400">Spend tracked (analytics)</p>
            </div>
            <div className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
              <p className="text-xs font-medium uppercase tracking-wider text-gray-400">Next stockout</p>
              <p className="mt-1 text-3xl font-bold tabular-nums text-gray-900">{nextStockoutLabel}</p>
              <p className="mt-1 text-xs text-gray-400">Nearest forecast</p>
            </div>
          </div>

          <section className="mb-6">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 className="text-sm font-bold uppercase tracking-wide text-gray-900">
                Stockout predictions
              </h2>
              <Link href="/dashboard/predictions" className="text-sm font-medium text-blue-600 hover:underline">
                View all →
              </Link>
            </div>
            {topThree.length === 0 ? (
              <p className="rounded-xl border border-dashed border-gray-200 bg-gray-50/80 px-4 py-8 text-center text-sm text-gray-500">
                Scan more receipts to get stockout predictions
              </p>
            ) : (
              <div className="space-y-3">
                {topThree.map((p) => {
                  const level = p.stockout_risk_level ?? "later";
                  const u = URGENCY_CARD[level];
                  const days = daysUntilStockout(p.prediction_date);
                  const conf = confidenceToPercent(p.confidence);
                  const feat = getFeatures(p);
                  const patternLine =
                    typeof feat?.reason === "string"
                      ? feat.reason
                      : feat?.avg_daily_consumption != null
                        ? `Avg. daily use tracked`
                        : "Consumption pattern";

                  return (
                    <div
                      key={p.id}
                      className={`flex flex-wrap items-center gap-4 rounded-xl border p-4 ${u.wrap}`}
                    >
                      <span className={`h-3 w-3 shrink-0 rounded-full ${u.dot}`} aria-hidden />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-gray-900">
                          {p.inventory_item?.name ?? "Item"}
                        </p>
                        <p className="text-xs text-gray-500">{patternLine}</p>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <span className="font-mono text-sm font-bold text-gray-900">{days} days</span>
                        <span className="text-xs text-gray-400">{conf}% confidence</span>
                      </div>
                      <Link
                        href="/dashboard/shopping"
                        className="ml-auto text-sm font-medium text-gray-700 underline-offset-4 hover:underline"
                      >
                        Add to list
                      </Link>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <section className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
              <h3 className="text-sm font-semibold text-gray-900">Recent scans</h3>
              <ul className="mt-3 space-y-2 text-sm">
                {scans.length === 0 ? (
                  <li className="text-gray-500">No scans yet</li>
                ) : (
                  scans.map((s) => (
                    <li
                      key={s.id}
                      className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-50 pb-2 last:border-0"
                    >
                      <span className="text-gray-600">
                        {new Date(s.created_at).toLocaleDateString(undefined, {
                          month: "short",
                          day: "numeric",
                        })}
                      </span>
                      <span className="text-gray-900">{s.items_detected} items</span>
                      <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs capitalize text-gray-600">
                        {scanStatusLabel(s)}
                      </span>
                    </li>
                  ))
                )}
              </ul>
              <Link
                href="/dashboard/scans/new"
                className="mt-4 inline-flex w-full items-center justify-center rounded-lg border border-blue-200 bg-blue-50 py-2 text-sm font-medium text-blue-700 hover:bg-blue-100"
              >
                + Scan new receipt
              </Link>
            </section>

            <section className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
              <h3 className="text-sm font-semibold text-gray-900">Shopping list preview</h3>
              {!listPreview ? (
                <p className="mt-3 text-sm text-gray-500">No shopping list yet</p>
              ) : (
                <div className="mt-3 space-y-1 text-sm">
                  <p className="text-gray-900">
                    <span className="font-medium">{listPreview.items?.length ?? 0}</span> items ·{" "}
                    <span className="capitalize text-gray-600">{listPreview.status}</span>
                  </p>
                  <p className="text-gray-500">
                    Total estimate:{" "}
                    {listPreview.total_estimated_cost != null
                      ? `$${Number(listPreview.total_estimated_cost).toFixed(2)}`
                      : "—"}
                  </p>
                </div>
              )}
              <Link
                href="/dashboard/shopping"
                className="mt-4 inline-flex w-full items-center justify-center rounded-lg bg-blue-600 py-2 text-sm font-medium text-white hover:bg-blue-700"
              >
                Generate new list
              </Link>
            </section>
          </div>
        </>
      )}
    </div>
  );
}
