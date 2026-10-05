"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Copy,
  Download,
  ExternalLink,
  Loader2,
  ScanSearch,
  Share2,
  Sparkles,
  TrendingDown,
  Upload,
  X,
} from "lucide-react";

import { getMenuXRayAnalysis, getMenuXRaySample } from "@/lib/api/endpoints";
import { useAuthStore, selectHasSession } from "@/lib/store/auth";
import { captureUIError } from "@/lib/analytics";
import { cn } from "@/lib/utils";
import type {
  CategoryEconomic,
  DishAnalysis,
  IngredientExposure,
  MarginOpportunity,
  MarginSignal,
  MenuXRayAnalysis,
} from "@/lib/api/types";

// ── Analytics helpers ─────────────────────────────────────────────────────────

function track(event: string, props?: Record<string, unknown>) {
  try {
    if (typeof window !== "undefined" && (window as any).analytics?.track) {
      (window as any).analytics.track(event, props);
    }
  } catch {
    // non-blocking
  }
}

// ── Visual helpers ────────────────────────────────────────────────────────────

function signalColor(signal: MarginSignal): string {
  if (signal === "Healthy") return "text-emerald-700 bg-emerald-50 border-emerald-200";
  if (signal === "Watch") return "text-amber-700 bg-amber-50 border-amber-200";
  return "text-red-700 bg-red-50 border-red-200";
}

function signalDot(signal: MarginSignal): string {
  if (signal === "Healthy") return "bg-emerald-500";
  if (signal === "Watch") return "bg-amber-400";
  return "bg-red-500";
}

function fcpColor(pct: number): string {
  if (pct < 35) return "text-emerald-700";
  if (pct < 42) return "text-amber-700";
  return "text-red-700";
}

function fcpBarColor(pct: number): string {
  if (pct < 35) return "bg-emerald-500";
  if (pct < 42) return "bg-amber-400";
  return "bg-red-500";
}

function healthScoreColor(score: number): string {
  if (score >= 70) return "text-emerald-600";
  if (score >= 50) return "text-amber-600";
  return "text-red-600";
}

function healthScoreBg(score: number): string {
  if (score >= 70) return "from-emerald-500 to-emerald-400";
  if (score >= 50) return "from-amber-500 to-amber-400";
  return "from-red-500 to-red-400";
}

function computeMarginSignal(fcp: number): MarginSignal {
  if (fcp < 35) return "Healthy";
  if (fcp < 42) return "Watch";
  return "Margin Risk";
}

function fmt(amount: number, currency: string): string {
  const sym = currency === "SGD" ? "S$" : currency === "USD" ? "$" : currency === "GBP" ? "£" : `${currency} `;
  return `${sym}${amount.toFixed(2)}`;
}

// ── Sub-components ────────────────────────────────────────────────────────────

function SignalPill({ signal }: { signal: MarginSignal }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold", signalColor(signal))}>
      <span className={cn("h-1.5 w-1.5 rounded-full", signalDot(signal))} />
      {signal}
    </span>
  );
}

function DishRow({ dish, currency, onClick }: { dish: DishAnalysis; currency: string; onClick: () => void }) {
  return (
    <tr className="group cursor-pointer border-b border-gray-100 transition-colors hover:bg-[#f8fafc]" onClick={onClick}>
      <td className="px-6 py-3 pr-4">
        <p className="text-[13px] font-semibold text-gray-900">{dish.dish_name}</p>
        <p className="text-[11px] text-gray-400">{dish.category}</p>
      </td>
      <td className="py-3 pr-4 text-right text-[13px] font-medium text-gray-700">{fmt(dish.menu_price, currency)}</td>
      <td className="py-3 pr-4 text-right text-[13px] text-gray-500">
        {fmt(dish.estimated_ingredient_cost, currency)} – {fmt(dish.estimated_ingredient_cost_max, currency)}
      </td>
      <td className="py-3 pr-4 text-right">
        <span className={cn("text-[13px] font-semibold tabular-nums", fcpColor(dish.estimated_food_cost_pct))}>
          {dish.estimated_food_cost_pct.toFixed(1)}%
        </span>
      </td>
      <td className="py-3 pr-6"><SignalPill signal={dish.margin_signal} /></td>
    </tr>
  );
}

// ── Dish X-Ray Drawer ─────────────────────────────────────────────────────────

function DishXRayDrawer({ dish, currency, onClose }: { dish: DishAnalysis; currency: string; onClose: () => void }) {
  const [ingCostAdj, setIngCostAdj] = useState(0);    // -30% to +30%
  const [portionAdj, setPortionAdj] = useState(0);    // -20% to +20%

  const adjustedCostMid =
    ((dish.estimated_ingredient_cost + dish.estimated_ingredient_cost_max) / 2) *
    (1 + ingCostAdj / 100) *
    (1 + portionAdj / 100);
  const adjustedFcp = dish.menu_price > 0 ? (adjustedCostMid / dish.menu_price) * 100 : 0;
  const adjustedSignal = computeMarginSignal(adjustedFcp);
  const baseFcp = dish.estimated_food_cost_pct;
  const fcpDelta = adjustedFcp - baseFcp;
  const hasAdjustment = ingCostAdj !== 0 || portionAdj !== 0;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" />
      <div
        className="relative z-10 w-full max-w-lg rounded-t-3xl sm:rounded-3xl bg-white shadow-2xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-start justify-between border-b border-gray-100 bg-white/95 backdrop-blur-sm px-6 py-5">
          <div>
            <p className="text-[11px] font-semibold tracking-widest text-gray-400 uppercase mb-0.5">{dish.category}</p>
            <h2 className="text-[19px] font-bold text-gray-900 leading-tight">{dish.dish_name}</h2>
          </div>
          <button type="button" onClick={onClose} className="rounded-full p-1.5 hover:bg-gray-100 ml-2 shrink-0">
            <X className="h-5 w-5 text-gray-500" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-5">
          {/* Key metrics */}
          <div className="grid grid-cols-3 gap-2.5">
            {[
              { label: "Menu price", value: fmt(dish.menu_price, currency), color: "text-gray-900" },
              { label: "Est. cost", value: fmt(adjustedCostMid, currency), color: fcpColor(adjustedFcp) },
              { label: "Food cost %", value: `${adjustedFcp.toFixed(1)}%`, color: fcpColor(adjustedFcp) },
            ].map(({ label, value, color }) => (
              <div key={label} className="rounded-2xl bg-gray-50 p-3 text-center">
                <p className="text-[10px] text-gray-400 mb-0.5">{label}</p>
                <p className={cn("text-[15px] font-bold", color)}>{value}</p>
              </div>
            ))}
          </div>

          {/* Margin status + confidence */}
          <div className="flex items-center justify-between">
            <SignalPill signal={adjustedSignal} />
            <div className="flex items-center gap-2">
              <p className="text-[11px] text-gray-400">Confidence</p>
              <div className="h-1.5 w-20 overflow-hidden rounded-full bg-gray-200">
                <div className="h-full rounded-full bg-[#0071a3]" style={{ width: `${Math.round(dish.confidence * 100)}%` }} />
              </div>
              <span className="text-[11px] font-medium text-[#0071a3]">{Math.round(dish.confidence * 100)}%</span>
            </div>
          </div>

          {/* Ingredient breakdown */}
          <div>
            <p className="text-[12px] font-semibold text-gray-700 mb-3">Ingredient breakdown</p>
            <div className="space-y-2">
              {dish.inferred_ingredients.map((ing) => {
                const ingShare = dish.estimated_ingredient_cost > 0
                  ? (ing.estimated_cost / ((dish.estimated_ingredient_cost + dish.estimated_ingredient_cost_max) / 2)) * 100
                  : 0;
                return (
                  <div key={ing.ingredient}>
                    <div className="flex items-center justify-between mb-0.5">
                      <p className="text-[12px] text-gray-700">
                        {ing.ingredient}
                        <span className="ml-1 text-gray-400">{ing.quantity} {ing.unit}</span>
                      </p>
                      <p className="text-[12px] font-medium text-gray-600 tabular-nums">{fmt(ing.estimated_cost * (1 + ingCostAdj / 100) * (1 + portionAdj / 100), currency)}</p>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-gray-100">
                      <div className="h-full rounded-full bg-[#0071a3]/40" style={{ width: `${Math.min(100, ingShare)}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* ── Simulate Fix ─────────────────────────────────────────────── */}
          <div className="rounded-2xl border border-[#0071a3]/15 bg-[#f0f7fb] p-4">
            <div className="flex items-center gap-2 mb-3">
              <Sparkles className="h-4 w-4 text-[#0071a3]" />
              <p className="text-[12px] font-semibold text-[#0071a3]">Simulate Fix</p>
            </div>

            <div className="space-y-4">
              {/* Ingredient cost adjustment */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-[12px] font-medium text-gray-700">Ingredient cost adjustment</label>
                  <span className={cn("text-[12px] font-bold tabular-nums", ingCostAdj < 0 ? "text-emerald-600" : ingCostAdj > 0 ? "text-red-600" : "text-gray-500")}>
                    {ingCostAdj > 0 ? "+" : ""}{ingCostAdj}%
                  </span>
                </div>
                <input
                  type="range" min={-30} max={30} step={5}
                  value={ingCostAdj}
                  onChange={(e) => setIngCostAdj(Number(e.target.value))}
                  className="w-full accent-[#0071a3]"
                />
                <div className="flex justify-between text-[10px] text-gray-400 mt-0.5">
                  <span>-30%</span><span>0</span><span>+30%</span>
                </div>
              </div>

              {/* Portion adjustment */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-[12px] font-medium text-gray-700">Portion size adjustment</label>
                  <span className={cn("text-[12px] font-bold tabular-nums", portionAdj < 0 ? "text-emerald-600" : portionAdj > 0 ? "text-red-600" : "text-gray-500")}>
                    {portionAdj > 0 ? "+" : ""}{portionAdj}%
                  </span>
                </div>
                <input
                  type="range" min={-20} max={20} step={5}
                  value={portionAdj}
                  onChange={(e) => setPortionAdj(Number(e.target.value))}
                  className="w-full accent-[#0071a3]"
                />
                <div className="flex justify-between text-[10px] text-gray-400 mt-0.5">
                  <span>-20%</span><span>0</span><span>+20%</span>
                </div>
              </div>
            </div>

            {/* Result */}
            {hasAdjustment && (
              <div className={cn("mt-3 rounded-xl border p-3", fcpDelta < 0 ? "border-emerald-100 bg-emerald-50" : "border-red-100 bg-red-50")}>
                <div className="flex items-center justify-between">
                  <p className={cn("text-[12px] font-semibold", fcpDelta < 0 ? "text-emerald-800" : "text-red-800")}>
                    Food cost: {adjustedFcp.toFixed(1)}% <span className="font-normal opacity-70">({fcpDelta > 0 ? "+" : ""}{fcpDelta.toFixed(1)}pp)</span>
                  </p>
                  <SignalPill signal={adjustedSignal} />
                </div>
                {fcpDelta < 0 && (
                  <p className="text-[11px] text-emerald-700 mt-1">
                    Saving ~{fmt(Math.abs(adjustedCostMid - (dish.estimated_ingredient_cost + dish.estimated_ingredient_cost_max) / 2), currency)} per dish
                  </p>
                )}
              </div>
            )}

            {!hasAdjustment && (
              <p className="mt-2 text-[11px] text-gray-400 italic">Move the sliders to see how changes affect food cost %</p>
            )}
          </div>

          {/* Price sensitivity */}
          <div className="rounded-2xl bg-gray-50 p-4">
            <p className="text-[12px] font-semibold text-gray-700 mb-2">Price sensitivity</p>
            <div className="grid grid-cols-3 gap-2 text-center text-[11px]">
              {[
                { label: `At ${fmt(dish.menu_price * 0.9, currency)}`, pct: (((dish.estimated_ingredient_cost + dish.estimated_ingredient_cost_max) / 2) / (dish.menu_price * 0.9)) * 100 },
                { label: `Current (${fmt(dish.menu_price, currency)})`, pct: baseFcp },
                { label: `At ${fmt(dish.menu_price * 1.1, currency)}`, pct: (((dish.estimated_ingredient_cost + dish.estimated_ingredient_cost_max) / 2) / (dish.menu_price * 1.1)) * 100 },
              ].map(({ label, pct }) => (
                <div key={label} className="rounded-xl border border-gray-100 bg-white p-2">
                  <p className="text-gray-400 mb-0.5">{label}</p>
                  <p className={cn("font-bold", fcpColor(pct))}>{pct.toFixed(0)}%</p>
                </div>
              ))}
            </div>
          </div>

          {/* Recommended fixes */}
          <div>
            <p className="text-[12px] font-semibold text-gray-700 mb-2">Recommended fixes</p>
            <ul className="space-y-2">
              {dish.margin_signal === "Margin Risk" && (
                <li className="flex gap-2 text-[12px] text-gray-600">
                  <TrendingDown className="h-4 w-4 shrink-0 text-red-400 mt-0.5" />
                  Renegotiate supply price for the highest-cost ingredient by at least 10%.
                </li>
              )}
              {dish.margin_signal !== "Healthy" && (
                <li className="flex gap-2 text-[12px] text-gray-600">
                  <Sparkles className="h-4 w-4 shrink-0 text-amber-400 mt-0.5" />
                  Reduce portion of top ingredient by 10–15% using a standardised portion guide.
                </li>
              )}
              <li className="flex gap-2 text-[12px] text-gray-600">
                <CheckCircle2 className="h-4 w-4 shrink-0 text-[#0071a3] mt-0.5" />
                Connect real supplier prices to verify these estimates.
              </li>
            </ul>
          </div>

          <p className="text-[10px] text-gray-400 italic">
            Simulate Fix adjusts estimated costs proportionally. Connect supplier data for exact figures.
          </p>
        </div>
      </div>
    </div>
  );
}

// ── Share Modal ───────────────────────────────────────────────────────────────

function ShareModal({ analysis, onClose }: { analysis: MenuXRayAnalysis; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const shareUrl = typeof window !== "undefined"
    ? `${window.location.origin}/dashboard/menu-xray/${analysis.analysis_id}`
    : "";

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      track("menu_xray_share_copy_link", { analysis_id: analysis.analysis_id });
    } catch { /* silent */ }
  }

  const shareText = encodeURIComponent(
    `Menu X-Ray result: ${analysis.menu_name} — Health Score ${analysis.insights.menu_health_score}/100, ${analysis.dishes_detected} dishes analysed, avg ${analysis.insights.average_food_cost_pct.toFixed(0)}% food cost.`
  );
  const linkedInUrl = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(shareUrl)}&summary=${shareText}`;
  const xUrl = `https://x.com/intent/tweet?url=${encodeURIComponent(shareUrl)}&text=${shareText}`;

  const { insights } = analysis;
  const currency = analysis.currency;
  const sym = currency === "SGD" ? "S$" : "$";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" />
      <div
        className="relative z-10 w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-5">
          <p className="text-[15px] font-bold text-gray-900">Share result</p>
          <button type="button" onClick={onClose} className="rounded-full p-1.5 hover:bg-gray-100">
            <X className="h-5 w-5 text-gray-400" />
          </button>
        </div>

        {/* Share card preview */}
        <div className="rounded-2xl border border-[#0071a3]/15 bg-gradient-to-br from-[#f0f7fb] to-white p-4 mb-5">
          <div className="flex items-center gap-2 mb-3">
            <ScanSearch className="h-4 w-4 text-[#0071a3]" />
            <p className="text-[11px] font-semibold tracking-widest text-[#0071a3] uppercase">Neumas Menu X-Ray</p>
          </div>
          <p className="text-[14px] font-bold text-gray-900 mb-3 leading-tight">{analysis.menu_name}</p>
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-xl bg-white border border-gray-100 p-2.5 text-center">
              <p className="text-[10px] text-gray-400">Health Score</p>
              <p className={cn("text-[18px] font-black", insights.menu_health_score >= 70 ? "text-emerald-600" : insights.menu_health_score >= 50 ? "text-amber-600" : "text-red-600")}>
                {insights.menu_health_score}<span className="text-[10px] font-normal text-gray-400">/100</span>
              </p>
            </div>
            <div className="rounded-xl bg-white border border-gray-100 p-2.5 text-center">
              <p className="text-[10px] text-gray-400">Avg food cost</p>
              <p className={cn("text-[18px] font-black", fcpColor(insights.average_food_cost_pct))}>
                {insights.average_food_cost_pct.toFixed(0)}%
              </p>
            </div>
            <div className="rounded-xl bg-white border border-gray-100 p-2.5 text-center">
              <p className="text-[10px] text-gray-400">Dishes</p>
              <p className="text-[18px] font-black text-gray-800">{analysis.dishes_detected}</p>
            </div>
            <div className="rounded-xl bg-white border border-gray-100 p-2.5 text-center">
              <p className="text-[10px] text-gray-400">Margin risks</p>
              <p className={cn("text-[18px] font-black", insights.margin_risk_count > 0 ? "text-red-600" : "text-emerald-600")}>
                {insights.margin_risk_count}
              </p>
            </div>
          </div>
          {insights.largest_ingredient_exposures[0] && (
            <p className="mt-2 text-[11px] text-gray-500 text-center">
              Top exposure: <span className="font-semibold">{insights.largest_ingredient_exposures[0].ingredient}</span>
            </p>
          )}
          <p className="mt-2 text-[10px] text-gray-400 text-center italic">Estimates. Private by default.</p>
        </div>

        {/* Copy link */}
        <div className="flex gap-2 mb-4">
          <div className="flex-1 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-[12px] text-gray-500 truncate">
            {shareUrl}
          </div>
          <button
            type="button"
            onClick={() => void copyLink()}
            className={cn(
              "flex items-center gap-1.5 rounded-xl px-3 py-2.5 text-[12px] font-semibold transition-all",
              copied ? "bg-emerald-500 text-white" : "bg-[#0071a3] text-white hover:bg-[#005f8a]"
            )}
          >
            <Copy className="h-3.5 w-3.5" />
            {copied ? "Copied!" : "Copy"}
          </button>
        </div>

        {/* Social */}
        <div className="grid grid-cols-2 gap-2 mb-4">
          <a
            href={linkedInUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => track("menu_xray_share_linkedin", { analysis_id: analysis.analysis_id })}
            className="flex items-center justify-center gap-2 rounded-xl border border-[#0077B5]/30 bg-[#0077B5]/5 py-2.5 text-[12px] font-semibold text-[#0077B5] hover:bg-[#0077B5]/10"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            LinkedIn
          </a>
          <a
            href={xUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => track("menu_xray_share_x", { analysis_id: analysis.analysis_id })}
            className="flex items-center justify-center gap-2 rounded-xl border border-gray-200 bg-gray-50 py-2.5 text-[12px] font-semibold text-gray-700 hover:bg-gray-100"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            X (Twitter)
          </a>
        </div>

        <p className="text-[11px] text-gray-400 text-center">
          This link requires authentication to view. Menu details are private.
        </p>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function MenuXRayResultPage() {
  const router = useRouter();
  const params = useParams<{ analysisId: string }>();
  const analysisId = params?.analysisId ?? "";
  const hasSession = useAuthStore(selectHasSession);
  const hasHydrated = useAuthStore((s) => s._hasHydrated);

  const [analysis, setAnalysis] = useState<MenuXRayAnalysis | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedDish, setSelectedDish] = useState<DishAnalysis | null>(null);
  const [showShare, setShowShare] = useState(false);
  const [showAllOpportunities, setShowAllOpportunities] = useState(false);
  const [showAllDishes, setShowAllDishes] = useState(false);
  const [csvDownloading, setCsvDownloading] = useState(false);
  const [savedToast, setSavedToast] = useState(false);

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
      track("menu_xray_result_viewed", {
        analysis_id: analysisId,
        is_sample: res.analysis.is_sample,
        dishes_detected: res.analysis.dishes_detected,
        health_score: res.analysis.insights.menu_health_score,
      });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load analysis.");
    } finally {
      setLoading(false);
    }
  }, [analysisId]);

  useEffect(() => {
    if (hasHydrated && hasSession) void load();
  }, [hasHydrated, hasSession, load]);

  function downloadCsv() {
    if (!analysis) return;
    setCsvDownloading(true);
    try {
      const rows = [
        ["Dish", "Category", "Menu Price", "Est. Cost Low", "Est. Cost High", "Food Cost %", "Margin Signal"],
        ...analysis.dishes.map((d) => [
          d.dish_name,
          d.category,
          d.menu_price.toFixed(2),
          d.estimated_ingredient_cost.toFixed(2),
          d.estimated_ingredient_cost_max.toFixed(2),
          d.estimated_food_cost_pct.toFixed(1),
          d.margin_signal,
        ]),
      ];
      const csv = rows.map((r) => r.map((v) => `"${v}"`).join(",")).join("\n");
      const blob = new Blob([csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `menu-xray-${analysisId}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      track("menu_xray_download_csv", { analysis_id: analysisId });
    } finally {
      setCsvDownloading(false);
    }
  }

  function markSaved() {
    setSavedToast(true);
    setTimeout(() => setSavedToast(false), 3000);
    track("menu_xray_saved", { analysis_id: analysisId });
  }

  if (!hasHydrated || loading) {
    return (
      <div className="flex min-h-[500px] items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-[#0071a3]" />
          <p className="text-[14px] text-gray-500">Loading analysis…</p>
        </div>
      </div>
    );
  }

  if (error || !analysis) {
    return (
      <div className="mx-auto max-w-2xl py-16 text-center">
        <AlertTriangle className="mx-auto mb-4 h-10 w-10 text-gray-300" />
        <p className="text-[15px] font-semibold text-gray-700">{error ?? "Analysis not found."}</p>
        <p className="mt-1 text-[13px] text-gray-400">The analysis may still be processing — please wait a moment and retry.</p>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <button type="button" onClick={() => void load()} className="rounded-xl border border-gray-200 px-5 py-2.5 text-[13px] font-medium text-gray-600 hover:bg-gray-50">
            Retry
          </button>
          <button type="button" onClick={() => router.push("/dashboard/menu-xray")} className="rounded-xl bg-[#0071a3] px-5 py-2.5 text-[13px] font-semibold text-white hover:bg-[#005f8a]">
            Upload another menu
          </button>
        </div>
      </div>
    );
  }

  const { insights, dishes } = analysis;
  const currency = analysis.currency;
  const visibleDishes = showAllDishes ? dishes : dishes.slice(0, 8);
  const visibleOpportunities = showAllOpportunities
    ? insights.top_margin_opportunities
    : insights.top_margin_opportunities.slice(0, 2);

  return (
    <>
      {selectedDish && (
        <DishXRayDrawer
          dish={selectedDish}
          currency={currency}
          onClose={() => {
            setSelectedDish(null);
            track("menu_xray_dish_drawer_closed", { dish: selectedDish.dish_name });
          }}
        />
      )}
      {showShare && <ShareModal analysis={analysis} onClose={() => setShowShare(false)} />}

      {/* Saved toast */}
      {savedToast && (
        <div className="fixed bottom-6 right-6 z-50 rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-2.5 shadow-lg">
          <p className="text-[13px] font-semibold text-emerald-800 flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4" /> Analysis saved to your dashboard
          </p>
        </div>
      )}

      <div className="mx-auto max-w-5xl space-y-6 pb-16">

        {/* ── HEADER ─────────────────────────────────────────────────────── */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold tracking-widest text-[#0071a3] uppercase">
              <ScanSearch className="h-4 w-4" />
              Menu X-Ray
            </div>
            <h1 className="text-[clamp(1.3rem,4vw,1.8rem)] font-bold tracking-tight text-gray-900">
              {analysis.menu_name}
            </h1>
            <div className="mt-2 flex flex-wrap items-center gap-3 text-[13px] text-gray-500">
              <span className="flex items-center gap-1.5">
                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                {analysis.dishes_detected} dishes detected
              </span>
              <span className="text-gray-300">·</span>
              <span>Confidence {Math.round(analysis.analysis_confidence * 100)}%</span>
              {analysis.is_sample && (
                <>
                  <span className="text-gray-300">·</span>
                  <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-[11px] font-semibold text-amber-700">
                    Sample Data
                  </span>
                </>
              )}
            </div>
          </div>
          {/* Action row */}
          <div className="flex flex-wrap gap-2 items-center">
            <button
              type="button"
              onClick={markSaved}
              className="flex items-center gap-1.5 rounded-xl border border-gray-200 px-3.5 py-2 text-[12px] font-medium text-gray-600 hover:bg-gray-50"
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
              Save
            </button>
            <button
              type="button"
              onClick={downloadCsv}
              disabled={csvDownloading}
              className="flex items-center gap-1.5 rounded-xl border border-gray-200 px-3.5 py-2 text-[12px] font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50"
            >
              <Download className="h-3.5 w-3.5" />
              CSV
            </button>
            <button
              type="button"
              onClick={() => { setShowShare(true); track("menu_xray_share_opened", { analysis_id: analysisId }); }}
              className="flex items-center gap-1.5 rounded-xl border border-gray-200 px-3.5 py-2 text-[12px] font-medium text-gray-600 hover:bg-gray-50"
            >
              <Share2 className="h-3.5 w-3.5" />
              Share
            </button>
            <button
              type="button"
              onClick={() => router.push("/dashboard/menu-xray")}
              className="flex items-center gap-1.5 rounded-xl border border-gray-200 px-3.5 py-2 text-[12px] font-medium text-gray-600 hover:bg-gray-50"
            >
              <Upload className="h-3.5 w-3.5" />
              Re-upload
            </button>
          </div>
        </div>

        {/* ── SUMMARY CARDS ──────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="col-span-2 sm:col-span-1 rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
            <p className="text-[11px] font-semibold tracking-widest text-gray-400 uppercase mb-3">Menu Health Score</p>
            <div className="flex items-end gap-2">
              <span className={cn("text-[42px] font-black leading-none tabular-nums", insights.menu_health_score >= 70 ? "text-emerald-600" : insights.menu_health_score >= 50 ? "text-amber-600" : "text-red-600")}>
                {insights.menu_health_score}
              </span>
              <span className="mb-1 text-[16px] text-gray-400">/100</span>
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-gray-100">
              <div className={cn("h-full rounded-full bg-gradient-to-r", healthScoreBg(insights.menu_health_score))} style={{ width: `${insights.menu_health_score}%` }} />
            </div>
          </div>

          <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
            <p className="text-[11px] font-semibold tracking-widest text-gray-400 uppercase mb-3">Avg Food Cost</p>
            <p className={cn("text-[32px] font-black leading-none tabular-nums", fcpColor(insights.average_food_cost_pct))}>
              {insights.average_food_cost_pct.toFixed(1)}%
            </p>
            <p className="mt-1.5 text-[11px] text-gray-400">of menu price</p>
          </div>

          <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
            <p className="text-[11px] font-semibold tracking-widest text-gray-400 uppercase mb-3">Margin Risk</p>
            <div className="flex items-center gap-2">
              <p className="text-[32px] font-black leading-none tabular-nums text-red-600">{insights.margin_risk_count}</p>
              {insights.watch_count > 0 && (
                <p className="text-[16px] font-bold text-amber-500">+{insights.watch_count}</p>
              )}
            </div>
            <p className="mt-1.5 text-[11px] text-gray-400">need attention</p>
          </div>

          {insights.largest_ingredient_exposures[0] && (
            <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
              <p className="text-[11px] font-semibold tracking-widest text-gray-400 uppercase mb-3">Top Exposure</p>
              <p className="text-[15px] font-bold text-gray-900 leading-tight">
                {insights.largest_ingredient_exposures[0].ingredient}
              </p>
              <p className="mt-1 text-[12px] text-gray-400">
                {insights.largest_ingredient_exposures[0].exposure_pct.toFixed(0)}% of ingredient spend
              </p>
            </div>
          )}
        </div>

        <div className="grid gap-5 lg:grid-cols-3">
          <div className="lg:col-span-2 space-y-5">

            {/* ── DISH ECONOMICS TABLE ──────────────────────────────────── */}
            <div className="rounded-2xl border border-gray-100 bg-white shadow-sm">
              <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
                <div>
                  <p className="text-[15px] font-semibold text-gray-900">Dish Economics</p>
                  <p className="text-[12px] text-gray-400 mt-0.5">Click any dish for X-Ray breakdown + Simulate Fix</p>
                </div>
                <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-[11px] font-semibold text-gray-500">{dishes.length} dishes</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-100">
                      <th className="px-6 py-2.5 text-left text-[11px] font-semibold tracking-wide text-gray-400 uppercase">Dish</th>
                      <th className="pr-4 py-2.5 text-right text-[11px] font-semibold tracking-wide text-gray-400 uppercase">Price</th>
                      <th className="pr-4 py-2.5 text-right text-[11px] font-semibold tracking-wide text-gray-400 uppercase">Est. Ing. Cost</th>
                      <th className="pr-4 py-2.5 text-right text-[11px] font-semibold tracking-wide text-gray-400 uppercase">Food Cost %</th>
                      <th className="pr-6 py-2.5 text-left text-[11px] font-semibold tracking-wide text-gray-400 uppercase">Signal</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleDishes.map((dish) => (
                      <DishRow
                        key={dish.dish_name}
                        dish={dish}
                        currency={currency}
                        onClick={() => {
                          setSelectedDish(dish);
                          track("menu_xray_dish_opened", { dish: dish.dish_name, signal: dish.margin_signal });
                        }}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
              {dishes.length > 8 && (
                <div className="border-t border-gray-100 px-6 py-3">
                  <button type="button" onClick={() => setShowAllDishes((p) => !p)} className="flex items-center gap-1.5 text-[12px] font-medium text-[#0071a3] hover:underline">
                    {showAllDishes ? <><ChevronUp className="h-3.5 w-3.5" /> Show fewer</> : <><ChevronDown className="h-3.5 w-3.5" /> Show all {dishes.length} dishes</>}
                  </button>
                </div>
              )}
            </div>

            {/* ── INGREDIENT EXPOSURE ───────────────────────────────────── */}
            <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
              <p className="text-[15px] font-semibold text-gray-900 mb-4">Ingredient Cost Exposure</p>
              <div className="space-y-3">
                {insights.largest_ingredient_exposures.map((exp, i) => (
                  <div key={exp.ingredient}>
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] font-bold text-gray-400">{i + 1}</span>
                        <p className="text-[13px] font-semibold text-gray-800">{exp.ingredient}</p>
                        {exp.appears_in_dishes > 1 && (
                          <span className="rounded-full bg-[#0071a3]/8 px-2 py-0.5 text-[10px] font-semibold text-[#0071a3]">
                            {exp.appears_in_dishes} dishes
                          </span>
                        )}
                      </div>
                      <p className="text-[12px] font-semibold text-gray-600 tabular-nums">{exp.exposure_pct.toFixed(1)}%</p>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-gray-100">
                      <div className="h-full rounded-full bg-[#0071a3] transition-all duration-500" style={{ width: `${Math.min(100, exp.exposure_pct)}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>

          </div>

          <div className="space-y-5">

            {/* ── NEUMAS INSIGHT ────────────────────────────────────────── */}
            <div className="rounded-2xl border border-amber-200 bg-gradient-to-br from-amber-50 to-white p-5 shadow-sm">
              <div className="flex items-center gap-2 mb-3">
                <Sparkles className="h-4 w-4 text-amber-500" />
                <p className="text-[11px] font-semibold tracking-widest text-amber-700 uppercase">Neumas Insight</p>
              </div>
              {insights.estimated_monthly_opportunity && (
                <div className="mb-4">
                  <p className="text-[11px] text-amber-600 mb-0.5">Estimated opportunity</p>
                  <p className="text-[28px] font-black text-amber-800 leading-none">
                    {currency === "SGD" ? "S$" : "$"}{insights.estimated_monthly_opportunity.toLocaleString()}
                    <span className="text-[14px] font-semibold text-amber-600">/month</span>
                  </p>
                </div>
              )}
              <p className="text-[13px] text-amber-900 leading-relaxed">{insights.recommended_action}</p>

              {/* Run on Real Supplier Data → /dashboard/setup?from=menu-xray&analysis_id=... */}
              <button
                type="button"
                onClick={() => {
                  track("menu_xray_cta_supplier_data", { analysis_id: analysisId });
                  router.push(`/dashboard/setup?from=menu-xray&analysis_id=${analysisId}`);
                }}
                className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-amber-500 py-3 text-[13px] font-semibold text-white shadow-sm hover:bg-amber-600"
              >
                <TrendingDown className="h-4 w-4" />
                Run on Real Supplier Data
                <ArrowRight className="h-4 w-4" />
              </button>
              <p className="mt-2 text-center text-[11px] text-amber-600 opacity-70">
                Connect recipes, invoices, and supplier prices for exact figures
              </p>
            </div>

            {/* ── CATEGORY ECONOMICS ────────────────────────────────────── */}
            <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
              <p className="text-[13px] font-semibold text-gray-900 mb-4">Category Economics</p>
              <div className="space-y-3">
                {insights.category_economics.map((cat) => (
                  <div key={cat.category}>
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <p className="text-[12px] font-medium text-gray-700">{cat.category}</p>
                        <span className="text-[10px] text-gray-400">{cat.dish_count} dishes</span>
                      </div>
                      <span className={cn("text-[12px] font-semibold tabular-nums", fcpColor(cat.average_food_cost_pct))}>
                        {cat.average_food_cost_pct.toFixed(1)}%
                      </span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-gray-100">
                      <div className={cn("h-full rounded-full", fcpBarColor(cat.average_food_cost_pct))} style={{ width: `${Math.min(100, cat.average_food_cost_pct * 2)}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* ── OPPORTUNITIES ─────────────────────────────────────────── */}
            <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <p className="text-[13px] font-semibold text-gray-900">Margin Opportunities</p>
                {insights.top_margin_opportunities.length > 2 && (
                  <button type="button" onClick={() => setShowAllOpportunities((p) => !p)} className="text-[11px] font-medium text-[#0071a3] hover:underline">
                    {showAllOpportunities ? "Show less" : "See all"}
                  </button>
                )}
              </div>
              <div className="space-y-3">
                {visibleOpportunities.map((opp) => (
                  <div key={opp.dish_name} className="rounded-xl border border-gray-100 bg-gray-50 p-3.5">
                    <div className="flex items-start justify-between gap-2 mb-1.5">
                      <p className="text-[12px] font-semibold text-gray-800">{opp.dish_name}</p>
                      <span className="shrink-0 text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-full px-2 py-0.5">
                        Save {fmt(opp.estimated_saving_per_dish, currency)}/dish
                      </span>
                    </div>
                    <p className="text-[12px] text-gray-500 leading-relaxed">{opp.opportunity_description}</p>
                  </div>
                ))}
              </div>

              {/* See all opportunities → opportunities sub-page */}
              <button
                type="button"
                onClick={() => {
                  track("menu_xray_opportunities_clicked", { analysis_id: analysisId });
                  router.push(`/dashboard/menu-xray/${analysisId}/opportunities`);
                }}
                className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl border border-[#0071a3]/20 bg-[#f0f7fb] py-2.5 text-[12px] font-semibold text-[#0071a3] hover:bg-[#e6f2f8]"
              >
                See all opportunities
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </div>

          </div>
        </div>

        {/* ── FOOTER DISCLAIMER ─────────────────────────────────────────── */}
        <div className="rounded-xl border border-gray-100 bg-gray-50 px-5 py-4">
          <div className="flex items-start gap-2.5">
            <AlertTriangle className="h-4 w-4 shrink-0 text-gray-400 mt-0.5" />
            <p className="text-[12px] text-gray-500 leading-relaxed">{analysis.estimates_disclaimer}</p>
          </div>
        </div>

      </div>
    </>
  );
}
