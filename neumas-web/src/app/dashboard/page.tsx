"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  BellRing,
  Building2,
  CheckCircle2,
  Clock3,
  Sparkles,
  TrendingUp,
  Upload,
} from "lucide-react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import {
  askOperatorCopilot,
  getDecisionCenter,
  getOnboardingState,
  getAnalyticsSummary,
  getOrgPropertyStockHealth,
  getRestockPreview,
  listInventoryItems,
  listAlerts,
  listPredictions,
  listScans,
  type Alert,
} from "@/lib/api/endpoints";
import type {
  AnalyticsSummary,
  DecisionCenterResponse,
  InventoryItem,
  OnboardingStateResponse,
  OperatorCopilotResponse,
  OrgPropertyStockHealthResponse,
  Prediction,
  Scan,
} from "@/lib/api/types";
import { useAuthStore } from "@/lib/store/auth";
import { captureUIError } from "@/lib/analytics";
import { formatCurrency } from "@/lib/currency";
import { daysUntilExpiry, expiryTone, getExpiryIso, pantryCategoryTab } from "@/lib/inventory-dates";
import { predictionReason, topOperationalRecommendation } from "@/lib/operations";
import { ExecutiveBriefing } from "@/components/dashboard/insights/ExecutiveBriefing";
import { OnboardingChecklist } from "@/components/onboarding/OnboardingChecklist";
import { resolveWorkspaceExperience } from "@/lib/workspace-experience";
import { EmptyState } from "@/components/ui/EmptyState";

const EMPTY_SUMMARY: AnalyticsSummary = {
  spend_total: 0,
  avg_confidence_pct: 0,
  items_tracked: 0,
  predictions_count: 0,
  scans_total: 0,
  spend_history: [],
  confidence_history: [],
  category_breakdown: [],
  urgency_breakdown: { critical: 0, urgent: 0, soon: 0, later: 0 },
};

const EMPTY_DECISION_CENTER: DecisionCenterResponse = {
  generated_at: new Date(0).toISOString(),
  workspace_experience: "FNB",
  action_queue: [],
  latest_activity: null,
  ahead: {
    stock_risk_count: 0,
    next_7_day_purchase_need: null,
    waste_risk_count: null,
    forecast_confidence: null,
    learning_state: null,
  },
  impact: {
    mode: "baseline",
    headline: "Building your operating baseline.",
    metrics: [],
    methodology_note: null,
    stockouts_avoided: null,
    waste_avoided: null,
    purchasing_variance: null,
    decisions_automated: null,
  },
  next_best_action: {
    action_type: "no_action",
    title: "Upload your next purchase document",
    detail: "Neumas will keep learning as new evidence arrives.",
    cta_label: "Open scans",
    cta_href: "/dashboard/scans/new",
  },
};

type TrendPoint = { date: string; value: number };

function formatMoney(value: number): string {
  return formatCurrency(value, "USD");
}

function newestScanLabel(scans: Scan[]): string {
  if (!scans.length) return "No scans yet";
  const s = scans[0];
  if (!s.created_at) return "Recently updated";
  const created = new Date(s.created_at).toLocaleString();
  return `${s.status.replace(/_/g, " ")} • ${created}`;
}

export default function DashboardPage() {
  const profile = useAuthStore((s) => s.profile);
  const isAdmin = profile?.role === "admin" || profile?.role === "super_admin";
  const workspaceExperience = resolveWorkspaceExperience(profile);

  const [summary, setSummary] = useState<AnalyticsSummary>(EMPTY_SUMMARY);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [scans, setScans] = useState<Scan[]>([]);
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([]);
  const [inventoryTrend, setInventoryTrend] = useState<TrendPoint[]>([]);
  const [orgHealth, setOrgHealth] = useState<OrgPropertyStockHealthResponse | null>(null);
  const [onboarding, setOnboarding] = useState<OnboardingStateResponse | null>(null);
  const [forecastSpend7d, setForecastSpend7d] = useState(0);
  const [decisionCenter, setDecisionCenter] = useState<DecisionCenterResponse>(EMPTY_DECISION_CENTER);
  const [copilotAnswer, setCopilotAnswer] = useState<OperatorCopilotResponse | null>(null);
  const [copilotLoading, setCopilotLoading] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [
        analyticsRes,
        alertsRes,
        predictionsRes,
        scansRes,
        inventoryRes,
        restockRes,
        orgHealthRes,
        onboardingRes,
        decisionCenterRes,
      ] = await Promise.all([
        getAnalyticsSummary().catch(() => EMPTY_SUMMARY),
        listAlerts({ state: "open", page_size: 20 }).catch(() => ({ alerts: [], open_count: 0, page: 1, page_size: 20 })),
        listPredictions({ limit: 8 }).catch(() => []),
        listScans({ limit: 20 }).catch(() => []),
        listInventoryItems({ limit: 200 }).catch(() => ({ items: [], total: 0, page: 1, page_size: 0, low_stock_count: 0 })),
        getRestockPreview({ runout_threshold_days: 7 }).catch(() => ({ vendors: [], runout_threshold_days: 7, generated_at: new Date().toISOString() })),
        isAdmin ? getOrgPropertyStockHealth().catch(() => null) : Promise.resolve(null),
        getOnboardingState().catch(() => null),
        getDecisionCenter(workspaceExperience).catch(() => EMPTY_DECISION_CENTER),
      ]);

      setSummary(analyticsRes);
      setAlerts(alertsRes.alerts);
      setPredictions(predictionsRes);
      setScans(scansRes);
      setInventoryItems(inventoryRes.items ?? []);
      setOrgHealth(orgHealthRes);
      setOnboarding(onboardingRes);
      setDecisionCenter(decisionCenterRes);
      setInventoryTrend((analyticsRes.inventory_value_history ?? []).map((point: { date: string; value: number | string | null }) => ({
        date: point.date,
        value: Number(point.value ?? 0),
      })));

      const spend = (restockRes.vendors ?? []).reduce((sum: number, vendor) => sum + Number(vendor.total_estimated_cost ?? 0), 0);
      setForecastSpend7d(Number(spend.toFixed(2)));
    } catch (err) {
      captureUIError("dashboard_command_center_load", err);
    } finally {
      setLoading(false);
    }
  }, [isAdmin, workspaceExperience]);

  useEffect(() => {
    void load();
  }, [load]);

  const scanSuccessRate = useMemo(() => {
    if (!scans.length) return 0;
    const good = scans.filter(
      (scan) =>
        scan.status === "completed" ||
        scan.status === "partial_failed" ||
        scan.status === "completed_with_partial_analysis"
    ).length;
    return Math.round((good / scans.length) * 100);
  }, [scans]);

  const criticalAlertsCount = useMemo(
    () => alerts.filter((a) => ["critical", "high"].includes(a.severity)).length,
    [alerts]
  );

  const predictedStockoutAlerts = useMemo(
    () => alerts.filter((a) => a.alert_type === "predicted_stockout"),
    [alerts]
  );

  const recommendation = topOperationalRecommendation(predictions, alerts);
  const lowPantryItems = useMemo(
    () => inventoryItems.filter((item) => item.stock_status === "low_stock" || item.stock_status === "out_of_stock"),
    [inventoryItems]
  );
  const useSoonItems = useMemo(
    () =>
      inventoryItems.filter((item) => {
        const tone = expiryTone(daysUntilExpiry(getExpiryIso(item)));
        return tone === "urgent" || tone === "expired";
      }),
    [inventoryItems]
  );
  const categoryCount = useMemo(
    () => new Set(inventoryItems.map((item) => pantryCategoryTab(item.category?.name)).filter(Boolean)).size,
    [inventoryItems]
  );
  const savingsThisMonth = useMemo(() => {
    if (summary.spend_history.length < 2) return null;
    const latest = Number(summary.spend_history.at(-1)?.amount ?? 0);
    const previous = Number(summary.spend_history.at(-2)?.amount ?? 0);
    if (previous <= 0 || latest >= previous) return null;
    return Number((previous - latest).toFixed(2));
  }, [summary.spend_history]);

  const copilotPrompts = workspaceExperience === "HOUSEHOLD"
    ? [
        "What should I buy this weekend?",
        "What is running low?",
        "What should I use soon?",
        "Why is this item on my smart list?",
      ]
    : [
        "What needs my attention today?",
        "What will run out this week?",
        "Which supplier prices increased?",
        "How accurate have forecasts been?",
      ];

  async function handleCopilotPrompt(question: string) {
    setCopilotLoading(true);
    try {
      const result = await askOperatorCopilot({
        question,
        workspace_experience: workspaceExperience,
      });
      setCopilotAnswer(result);
    } catch (err) {
      captureUIError("dashboard_operator_copilot", err);
      setCopilotAnswer({
        answer: "Neumas could not complete that answer right now. Try again in a moment.",
        citations: [],
        mode: "fallback",
      });
    } finally {
      setCopilotLoading(false);
    }
  }

  if (workspaceExperience === "HOUSEHOLD") {
    return (
      <div className="space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">Household snapshot</p>
            <h1 className="mt-1 text-3xl font-bold tracking-tight text-gray-900">Household Home</h1>
            <p className="mt-1 text-sm text-gray-500">
              Track pantry state, what is running low, what to use soon, and what to buy next.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void load()}
            className="rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
          >
            Refresh view
          </button>
        </div>

        {onboarding?.activation_checklist && onboarding.activation_checklist.length > 0 && (
          <OnboardingChecklist steps={onboarding.activation_checklist} />
        )}

        <div className="grid gap-3 md:grid-cols-4">
          <div className="rounded-2xl border border-gray-200 bg-white p-4">
            <p className="text-xs uppercase tracking-[0.14em] text-gray-500">Pantry Items</p>
            <p className="mt-3 text-3xl font-bold text-gray-900">{inventoryItems.length}</p>
            <p className="mt-1 text-xs text-gray-500">
              {inventoryItems.length ? "Built from shared receipts, review, and inventory posting." : "Scan a receipt to build your first pantry baseline."}
            </p>
          </div>
          <div className="rounded-2xl border border-gray-200 bg-white p-4">
            <p className="text-xs uppercase tracking-[0.14em] text-gray-500">Running Low</p>
            <p className="mt-3 text-3xl font-bold text-gray-900">{lowPantryItems.length}</p>
            <p className="mt-1 text-xs text-gray-500">
              {lowPantryItems.length ? "Items eligible for your next smart list." : "No running-low signals yet."}
            </p>
          </div>
          <div className="rounded-2xl border border-gray-200 bg-white p-4">
            <p className="text-xs uppercase tracking-[0.14em] text-gray-500">Use Soon</p>
            <p className="mt-3 text-3xl font-bold text-gray-900">{useSoonItems.length}</p>
            <p className="mt-1 text-xs text-gray-500">
              {useSoonItems.length ? "Expiry-aware prompts from pantry metadata." : "No use-soon items until expiry evidence exists."}
            </p>
          </div>
          <div className="rounded-2xl border border-gray-200 bg-white p-4">
            <p className="text-xs uppercase tracking-[0.14em] text-gray-500">Savings This Month</p>
            <p className="mt-3 text-2xl font-bold text-gray-900">
              {savingsThisMonth !== null ? formatMoney(savingsThisMonth) : "Start scanning"}
            </p>
            <p className="mt-1 text-xs text-gray-500">
              {savingsThisMonth !== null ? "Estimated from recent spend trend." : "Start scanning receipts to establish your savings baseline."}
            </p>
          </div>
        </div>

        <div className="grid gap-4 xl:grid-cols-[1.35fr_1fr]">
          <div className="rounded-2xl border border-gray-200 bg-white p-5">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold text-gray-900">Next Shop</h2>
                <p className="text-xs text-gray-500">Shared shopping engine, household framing.</p>
              </div>
              <Link href="/dashboard/shopping" className="text-xs font-semibold text-sky-700 hover:underline">
                Open smart list
              </Link>
            </div>
            {lowPantryItems.length === 0 ? (
              <div className="mt-4">
                <EmptyState
                  icon={Upload}
                  badge="Get started"
                  headline="No refill list yet"
                  body="Scan a grocery receipt or add pantry items manually to build your first smart list."
                  cta={{ label: "Scan receipt", href: "/dashboard/scans/new" }}
                  secondaryCta={{ label: "Open pantry", href: "/dashboard/inventory" }}
                />
              </div>
            ) : (
              <div className="mt-4 space-y-3">
                {lowPantryItems.slice(0, 5).map((item) => (
                  <div key={item.id} className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-gray-900">{item.name}</p>
                        <p className="text-xs text-gray-500">
                          {item.category?.name ?? "Pantry"} · {item.quantity} {item.unit}
                        </p>
                      </div>
                      <span className="rounded-full bg-amber-50 px-2 py-1 text-[11px] font-semibold text-amber-700">
                        {item.stock_status === "out_of_stock" ? "Out" : "Low"}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-4">
            <div className="rounded-2xl border border-gray-200 bg-white p-5">
              <h2 className="text-sm font-semibold text-gray-900">Use Soon</h2>
              <p className="mt-1 text-xs text-gray-500">Surface items that should be used before they go to waste.</p>
              <div className="mt-4 space-y-3">
                {useSoonItems.length === 0 ? (
                  <p className="text-sm text-gray-500">Expiry prompts will appear here after receipts capture suitable metadata.</p>
                ) : (
                  useSoonItems.slice(0, 4).map((item) => (
                    <div key={item.id} className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-3">
                      <p className="text-sm font-semibold text-gray-900">{item.name}</p>
                      <p className="text-xs text-gray-500">{item.category?.name ?? "Pantry item"}</p>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="rounded-2xl border border-gray-200 bg-white p-5">
              <h2 className="text-sm font-semibold text-gray-900">Pantry Health</h2>
              <p className="mt-1 text-xs text-gray-500">Useful signals instead of empty zeroes.</p>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-3">
                  <p className="text-xs uppercase tracking-[0.14em] text-gray-500">Categories</p>
                  <p className="mt-2 text-2xl font-bold text-gray-900">{categoryCount || "—"}</p>
                </div>
                <div className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-3">
                  <p className="text-xs uppercase tracking-[0.14em] text-gray-500">Recent receipts</p>
                  <p className="mt-2 text-2xl font-bold text-gray-900">{scans.length}</p>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-gray-200 bg-white p-5">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-semibold text-gray-900">Operator Copilot</h2>
                  <p className="mt-1 text-xs text-gray-500">Grounded answers from your receipts, pantry state, alerts, and smart-list workflow.</p>
                </div>
                <Sparkles className="h-4 w-4 text-sky-700" />
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                {copilotPrompts.map((prompt) => (
                  <button
                    key={prompt}
                    type="button"
                    onClick={() => void handleCopilotPrompt(prompt)}
                    className="rounded-full border border-gray-200 bg-gray-50 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-100"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
              <div className="mt-4 rounded-xl border border-gray-100 bg-gray-50 p-4">
                {copilotLoading ? (
                  <p className="text-sm text-gray-500">Checking your verified operating data…</p>
                ) : copilotAnswer ? (
                  <>
                    <p className="text-sm text-gray-800">{copilotAnswer.answer}</p>
                    {copilotAnswer.citations.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {copilotAnswer.citations.map((citation) => (
                          <Link key={`${citation.kind}-${citation.id}`} href={citation.href} className="rounded-full bg-white px-2.5 py-1 text-xs font-medium text-sky-700 ring-1 ring-gray-200 hover:bg-sky-50">
                            {citation.label}
                          </Link>
                        ))}
                      </div>
                    )}
                  </>
                ) : (
                  <p className="text-sm text-gray-500">Ask one of the guided questions to inspect grounded pantry and workflow signals.</p>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-2xl border border-gray-200 bg-white p-5">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold text-gray-900">Recent Receipts</h2>
                <p className="text-xs text-gray-500">Existing receipt pipeline, household shell.</p>
              </div>
              <Link href="/dashboard/scans" className="text-xs font-semibold text-sky-700 hover:underline">
                View history
              </Link>
            </div>
            <div className="mt-4 space-y-3">
              {scans.length === 0 ? (
                <p className="text-sm text-gray-500">No receipts yet. Scan your first grocery receipt to get started.</p>
              ) : (
                scans.slice(0, 4).map((scan) => (
                  <div key={scan.id} className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-3">
                    <p className="text-sm font-semibold text-gray-900">Receipt upload</p>
                    <p className="text-xs text-gray-500">
                      {scan.status.replace(/_/g, " ")} · {scan.created_at ? new Date(scan.created_at).toLocaleString() : "Recently uploaded"}
                    </p>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-gray-200 bg-white p-5">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold text-gray-900">Spending Snapshot</h2>
                <p className="text-xs text-gray-500">No fabricated savings or spend lines.</p>
              </div>
              <Link href="/dashboard/analytics" className="text-xs font-semibold text-sky-700 hover:underline">
                Open spending
              </Link>
            </div>
            <div className="mt-4 space-y-3">
              <div className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-3">
                <p className="text-xs uppercase tracking-[0.14em] text-gray-500">Tracked spend</p>
                <p className="mt-2 text-2xl font-bold text-gray-900">
                  {summary.spend_total > 0 ? formatMoney(summary.spend_total) : "Waiting for data"}
                </p>
              </div>
              <div className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-3">
                <p className="text-xs uppercase tracking-[0.14em] text-gray-500">Receipt confidence</p>
                <p className="mt-2 text-2xl font-bold text-gray-900">
                  {summary.avg_confidence_pct > 0 ? `${Math.round(summary.avg_confidence_pct)}%` : "Build baseline"}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">Executive summary</p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-gray-900">Command Center</h1>
          <p className="mt-1 text-sm text-gray-500">{"Login -> scan -> analyze -> reorder -> repeat. Built for daily operator decisions."}</p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
        >
          Refresh view
        </button>
      </div>

      {onboarding?.workspace_experience === "FNB" &&
        onboarding.activation_checklist &&
        onboarding.activation_checklist.length > 0 && (
          <OnboardingChecklist steps={onboarding.activation_checklist} />
        )}

      {scans.length === 0 && (
        <div className="rounded-2xl border border-sky-200 bg-gradient-to-r from-sky-50 to-cyan-50 p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-sky-700">Welcome</p>
          <h2 className="mt-1 text-xl font-bold text-slate-900">Start with one receipt. We handle the rest.</h2>
          <p className="mt-2 text-sm text-slate-600">
            Upload a receipt, let AI extract line items, generate your baseline, then get depletion risk and a ready-to-send shopping plan.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Link href="/dashboard/scans/new" className="inline-flex items-center gap-2 rounded-xl bg-sky-700 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-800">
              <Upload className="h-4 w-4" />
              Upload receipt
            </Link>
            <Link href="/dashboard/scans" className="inline-flex items-center gap-2 rounded-xl border border-sky-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
              What happens next
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      )}

      <div className="grid gap-3 md:grid-cols-3">
        <div className="rounded-2xl border border-gray-200 bg-white p-4">
          <div className="flex items-center justify-between">
            <p className="text-xs uppercase tracking-[0.14em] text-gray-500">Critical Alerts</p>
            <AlertTriangle className="h-4 w-4 text-red-500" />
          </div>
          <p className="mt-3 text-3xl font-bold text-gray-900">{criticalAlertsCount}</p>
          <p className="mt-1 text-xs text-gray-500">Items below reorder or predicted to stock out soon.</p>
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white p-4">
          <div className="flex items-center justify-between">
            <p className="text-xs uppercase tracking-[0.14em] text-gray-500">Procurement Forecast</p>
            <TrendingUp className="h-4 w-4 text-amber-500" />
          </div>
          <p className="mt-3 text-3xl font-bold text-gray-900">
            {formatMoney(decisionCenter.ahead.next_7_day_purchase_need ?? forecastSpend7d)}
          </p>
          <p className="mt-1 text-xs text-gray-500">Estimated spend needed over the next 7 days.</p>
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white p-4">
          <div className="flex items-center justify-between">
            <p className="text-xs uppercase tracking-[0.14em] text-gray-500">Scan Health</p>
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
          </div>
          <p className="mt-3 text-3xl font-bold text-gray-900">{scanSuccessRate}%</p>
          <p className="mt-1 text-xs text-gray-500">Success rate from recent OCR attempts ({scans.length} scans).</p>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.8fr_1fr]">
        <div className="rounded-2xl border border-gray-200 bg-white p-4">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-gray-900">Today&apos;s Actions</h3>
              <p className="text-xs text-gray-500">Prioritized operator decisions from the live workflow.</p>
            </div>
            <span className="rounded-full bg-gray-100 px-2 py-1 text-xs font-medium text-gray-600">
              {decisionCenter.action_queue.length} queued
            </span>
          </div>
          {decisionCenter.action_queue.length === 0 ? (
            <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 p-4 text-sm text-gray-600">
              No urgent operator decisions are waiting right now.
            </div>
          ) : (
            <div className="space-y-3">
              {decisionCenter.action_queue.map((action: DecisionCenterResponse["action_queue"][number]) => (
                <div key={`${action.priority}-${action.action_type}-${action.cta_href}`} className="rounded-xl border border-gray-100 bg-gray-50 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="rounded-full bg-slate-900 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-white">
                          {action.priority}
                        </span>
                        <p className="text-sm font-semibold text-gray-900">{action.title}</p>
                      </div>
                      <p className="mt-1 text-xs text-gray-600">{action.detail}</p>
                    </div>
                    {action.value ? (
                      <span className="rounded-full bg-white px-2 py-1 text-[11px] font-semibold text-gray-700">
                        {action.value}
                      </span>
                    ) : null}
                  </div>
                  <Link href={action.cta_href} className="mt-3 inline-flex items-center gap-2 text-sm font-semibold text-sky-700 hover:text-sky-800">
                    {action.cta_label}
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-4">
          <div className="rounded-2xl border border-gray-200 bg-white p-4">
            <p className="text-xs uppercase tracking-[0.14em] text-gray-500">What Happened</p>
            {decisionCenter.latest_activity ? (
              <div className="mt-2 space-y-2">
                <p className="text-sm font-semibold text-gray-900">{decisionCenter.latest_activity.detail}</p>
                <div className="grid gap-2 sm:grid-cols-2">
                  <div className="rounded-xl border border-gray-100 bg-gray-50 p-3 text-xs text-gray-600">
                    {decisionCenter.latest_activity.items_updated
                      ? `${decisionCenter.latest_activity.items_updated} item(s) updated`
                      : "Item counts will appear after posted evidence."}
                  </div>
                  <div className="rounded-xl border border-gray-100 bg-gray-50 p-3 text-xs text-gray-600">
                    {decisionCenter.latest_activity.supplier_name
                      ? `Supplier identified: ${decisionCenter.latest_activity.supplier_name}`
                      : "Supplier identification will appear when available."}
                  </div>
                  <div className="rounded-xl border border-gray-100 bg-gray-50 p-3 text-xs text-gray-600">
                    {decisionCenter.latest_activity.invoice_total != null
                      ? `${formatMoney(decisionCenter.latest_activity.invoice_total)} purchase recorded`
                      : "Invoice value is shown only when extraction is reliable."}
                  </div>
                  <div className="rounded-xl border border-gray-100 bg-gray-50 p-3 text-xs text-gray-600">
                    Downstream analysis: {decisionCenter.latest_activity.downstream_status ?? "pending"}
                  </div>
                  <div className="rounded-xl border border-gray-100 bg-gray-50 p-3 text-xs text-gray-600">
                    {decisionCenter.latest_activity.categories_identified?.length
                      ? `Categories: ${decisionCenter.latest_activity.categories_identified.slice(0, 3).join(", ")}`
                      : "Categories appear once line items are classified."}
                  </div>
                  <div className="rounded-xl border border-gray-100 bg-gray-50 p-3 text-xs text-gray-600">
                    {decisionCenter.latest_activity.price_observations_created
                      ? `${decisionCenter.latest_activity.price_observations_created} price observation(s) recorded`
                      : "Price observations appear when supplier-linked pricing is available."}
                  </div>
                </div>
              </div>
            ) : (
              <p className="mt-2 text-sm text-gray-500">Operational workflow summaries appear after the first posted scan.</p>
            )}
          </div>

          <div className="rounded-2xl border border-gray-200 bg-white p-4">
            <p className="text-xs uppercase tracking-[0.14em] text-gray-500">What&apos;s Ahead</p>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <div className="rounded-xl border border-gray-100 bg-gray-50 p-3">
                <p className="text-[11px] uppercase tracking-[0.14em] text-gray-500">Stock risk</p>
                <p className="mt-2 text-2xl font-bold text-gray-900">{decisionCenter.ahead.stock_risk_count}</p>
              </div>
              <div className="rounded-xl border border-gray-100 bg-gray-50 p-3">
                <p className="text-[11px] uppercase tracking-[0.14em] text-gray-500">Forecast confidence</p>
                <p className="mt-2 text-2xl font-bold text-gray-900">
                  {decisionCenter.ahead.forecast_confidence != null
                    ? `${Math.round(decisionCenter.ahead.forecast_confidence * 100)}%`
                    : "Learning"}
                </p>
              </div>
            </div>
            {decisionCenter.ahead.learning_state ? (
              <p className="mt-3 text-sm text-gray-500">{decisionCenter.ahead.learning_state}</p>
            ) : null}
          </div>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.8fr_1fr]">
        <div className="rounded-2xl border border-gray-200 bg-white p-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-gray-900">Inventory Value Over Time</h3>
              <p className="text-xs text-gray-500">Estimated value trend from on-hand quantities and burn rate.</p>
            </div>
            <span className="rounded-full bg-gray-100 px-2 py-1 text-xs font-medium text-gray-600">14 days</span>
          </div>
          <div className="mt-4 h-[240px]">
            {loading ? (
              <div className="h-full animate-pulse rounded-xl bg-gray-100" />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={inventoryTrend}>
                  <CartesianGrid strokeDasharray="2 2" stroke="#e5e7eb" vertical={false} />
                  <XAxis dataKey="date" tick={{ fill: "#6b7280", fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis
                    tick={{ fill: "#6b7280", fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                    width={58}
                    tickFormatter={(v) => `$${Math.round(Number(v))}`}
                  />
                  <Tooltip formatter={(v) => formatMoney(Number(v))} />
                  <Line
                    type="monotone"
                    dataKey="value"
                    stroke="#0f766e"
                    strokeWidth={2.5}
                    dot={false}
                    activeDot={{ r: 4, fill: "#0f766e" }}
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-2xl border border-gray-200 bg-white p-4">
            <p className="text-xs uppercase tracking-[0.14em] text-gray-500">Latest Scan Status</p>
            <p className="mt-2 text-sm font-semibold text-gray-900">
              {decisionCenter.latest_activity?.status ? decisionCenter.latest_activity.status.replace(/_/g, " ") : newestScanLabel(scans)}
            </p>
            <p className="mt-2 text-xs text-gray-500">Processing quality improves after each approved document.</p>
            <Link href="/dashboard/scans" className="mt-3 inline-flex items-center gap-2 text-sm font-semibold text-sky-700 hover:text-sky-800">
              Open scans
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>

          <div className="rounded-2xl border border-gray-200 bg-white p-4">
            <p className="text-xs uppercase tracking-[0.14em] text-gray-500">Next Best Action</p>
            <p className="mt-2 text-sm font-semibold text-gray-900">{decisionCenter.next_best_action.title}</p>
            <p className="mt-1 text-xs text-gray-500">{decisionCenter.next_best_action.detail}</p>
            <Link href={decisionCenter.next_best_action.cta_href} className="mt-3 inline-flex items-center gap-2 rounded-lg bg-gray-900 px-3 py-2 text-sm font-semibold text-white hover:bg-gray-800">
              {decisionCenter.next_best_action.cta_label}
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>

        <div className="space-y-4">
          <ExecutiveBriefing />
          <div className="rounded-2xl border border-gray-200 bg-white p-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-gray-900">Impact</h3>
                <p className="text-xs text-gray-500">Measured outcomes only, or a baseline-building state.</p>
              </div>
              <Sparkles className="h-4 w-4 text-sky-700" />
            </div>
            {decisionCenter.impact.mode === "measured" ? (
              <div className="mt-4 space-y-3">
                <p className="text-lg font-semibold text-gray-900">{decisionCenter.impact.headline}</p>
                {decisionCenter.impact.metrics?.length ? (
                  <div className="space-y-2">
                    {decisionCenter.impact.metrics.map((metric) => (
                      <div key={metric.key} className="rounded-xl border border-gray-100 bg-gray-50 p-3">
                        <p className="text-sm font-semibold text-gray-900">{metric.label}</p>
                        <p className="mt-1 text-xs text-gray-600">
                          {metric.format === "percent" && typeof metric.value === "number"
                            ? `${Math.round(metric.value * 100)}%`
                            : metric.format === "currency" && typeof metric.value === "number"
                            ? formatMoney(metric.value)
                            : metric.format === "minutes" && typeof metric.value === "number"
                            ? `${metric.value} min`
                            : metric.value ?? "Still learning"}
                          {metric.kind === "estimated" ? " · modeled" : ""}
                        </p>
                        {metric.methodology && <p className="mt-1 text-[11px] text-gray-500">{metric.methodology}</p>}
                      </div>
                    ))}
                  </div>
                ) : (
                  <>
                    {recommendation ? (
                      <>
                        <p className="text-sm text-gray-600">{recommendation.reason}</p>
                        <p className="text-sm font-medium text-gray-800">Action: {recommendation.action}</p>
                      </>
                    ) : (
                      <p className="text-sm text-gray-500">Measured outcomes will appear here as the workflow records more completed operating cycles.</p>
                    )}
                  </>
                )}
              </div>
            ) : (
              <p className="mt-4 text-sm text-gray-500">{decisionCenter.impact.headline}</p>
            )}
          </div>

          <div className="rounded-2xl border border-gray-200 bg-white p-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-gray-900">Operator Copilot</h3>
                <p className="text-xs text-gray-500">Grounded answers from receipts, alerts, predictions, shopping, and supplier context.</p>
              </div>
              <Sparkles className="h-4 w-4 text-sky-700" />
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {copilotPrompts.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  onClick={() => void handleCopilotPrompt(prompt)}
                  className="rounded-full border border-gray-200 bg-gray-50 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-100"
                >
                  {prompt}
                </button>
              ))}
            </div>
            <div className="mt-4 rounded-xl border border-gray-100 bg-gray-50 p-4">
              {copilotLoading ? (
                <p className="text-sm text-gray-500">Checking your verified operating data…</p>
              ) : copilotAnswer ? (
                <>
                  <p className="text-sm text-gray-800">{copilotAnswer.answer}</p>
                  {copilotAnswer.citations.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {copilotAnswer.citations.map((citation) => (
                        <Link key={`${citation.kind}-${citation.id}`} href={citation.href} className="rounded-full bg-white px-2.5 py-1 text-xs font-medium text-sky-700 ring-1 ring-gray-200 hover:bg-sky-50">
                          {citation.label}
                        </Link>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <p className="text-sm text-gray-500">Ask one of the guided questions to inspect grounded operating signals.</p>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-gray-200 bg-white p-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-900">Upcoming Stockout Alerts</h3>
            <BellRing className="h-4 w-4 text-red-500" />
          </div>
          {!predictedStockoutAlerts.length ? (
            <div className="mt-4 rounded-xl border border-dashed border-gray-200 bg-gray-50 p-4 text-sm text-gray-600">
              No prediction-based alerts right now. Keep scanning receipts to maintain baseline confidence.
            </div>
          ) : (
            <div className="mt-3 space-y-2">
              {predictedStockoutAlerts.slice(0, 5).map((alert) => (
                <div key={alert.id} className="rounded-xl border border-red-100 bg-red-50 p-3">
                  <p className="text-sm font-semibold text-red-900">{alert.title}</p>
                  <p className="mt-1 text-xs text-red-700">{alert.body}</p>
                </div>
              ))}
            </div>
          )}
          <Link href="/dashboard/alerts" className="mt-3 inline-flex items-center gap-2 text-sm font-semibold text-sky-700 hover:text-sky-800">
            View all alerts
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white p-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-900">Baseline Insights & AI Recommendations</h3>
            <Sparkles className="h-4 w-4 text-violet-500" />
          </div>
          <div className="mt-3 space-y-2">
            <div className="rounded-xl border border-gray-100 bg-gray-50 p-3 text-sm">
              <p className="font-semibold text-gray-900">Inventory health snapshot</p>
              <p className="mt-1 text-xs text-gray-600">
                {summary.items_tracked} tracked items, {decisionCenter.ahead.stock_risk_count} active stock-risk signals.
              </p>
            </div>
            <div className="rounded-xl border border-gray-100 bg-gray-50 p-3 text-sm">
              <p className="font-semibold text-gray-900">Historical baseline confidence</p>
              <p className="mt-1 text-xs text-gray-600">
                {decisionCenter.ahead.forecast_confidence != null
                  ? `Current confidence at ${Math.round(decisionCenter.ahead.forecast_confidence * 100)}%.`
                  : "Confidence will appear after enough evaluated evidence exists."}
              </p>
            </div>
            <div className="rounded-xl border border-gray-100 bg-gray-50 p-3 text-sm">
              <p className="font-semibold text-gray-900">Recommendations</p>
              <ul className="mt-1 space-y-1 text-xs text-gray-600">
                {predictions.slice(0, 3).map((prediction) => (
                  <li key={prediction.id}>
                    {prediction.inventory_item?.name ?? "Item"}: {predictionReason(prediction)}
                  </li>
                ))}
                {predictions.length === 0 && <li>{decisionCenter.ahead.learning_state ?? "Upload the next evidence cycle to keep learning."}</li>}
              </ul>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link href="/dashboard/predictions" className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50">
              Open predictions
            </Link>
            <Link href="/dashboard/shopping" className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50">
              Open shopping
            </Link>
            <Link href="/dashboard/analytics" className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50">
              Open insights
            </Link>
          </div>
        </div>
      </div>

      {isAdmin && (
        <div className="rounded-2xl border border-gray-200 bg-white p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-gray-900">Global APAC Stock Health</h3>
              <p className="text-xs text-gray-500">Org-wide property overview with red-market escalation.</p>
            </div>
            <div className="inline-flex items-center gap-2 rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold text-gray-700">
              <Building2 className="h-3.5 w-3.5" />
              {orgHealth?.properties.length ?? 0} properties
            </div>
          </div>

          {!orgHealth?.properties.length ? (
            <div className="mt-4 rounded-xl border border-dashed border-gray-200 bg-gray-50 p-4 text-sm text-gray-600">
              Global property summary is unavailable for this account.
            </div>
          ) : (
            <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
              {orgHealth.properties.map((property) => (
                <div
                  key={property.property_id}
                  className={[
                    "rounded-xl border p-3",
                    property.status === "red"
                      ? "border-red-200 bg-red-50"
                      : property.status === "amber"
                        ? "border-amber-200 bg-amber-50"
                        : "border-emerald-200 bg-emerald-50",
                  ].join(" ")}
                >
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-slate-900">{property.name}</p>
                    <span className="rounded-full bg-white/70 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-700">
                      {property.status}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-slate-600">{property.region ?? property.country ?? "APAC"}</p>
                  <div className="mt-2 flex flex-wrap gap-2 text-xs">
                    <span className="rounded-full bg-white px-2 py-0.5 text-slate-700">Low: {property.low_stock}</span>
                    <span className="rounded-full bg-white px-2 py-0.5 text-slate-700">Out: {property.out_of_stock}</span>
                    <span className="rounded-full bg-white px-2 py-0.5 text-slate-700">Predicted: {property.predicted_stockout}</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {Boolean(orgHealth?.red_count) && (
            <div className="mt-3 inline-flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">
              <Clock3 className="h-3.5 w-3.5" />
              {orgHealth?.red_count} properties currently red and need intervention.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
