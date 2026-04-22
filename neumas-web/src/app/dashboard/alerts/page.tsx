"use client";

import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Bell, ChevronDown, ShieldCheck } from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageErrorState, PageLoadingState } from "@/components/ui/PageState";
import {
  listAlerts,
  snoozeAlert,
  resolveAlert,
  type Alert,
  type AlertsResponse,
} from "@/lib/api/endpoints";
import { captureUIError } from "@/lib/analytics";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const SEVERITY_COLORS: Record<string, string> = {
  critical: "bg-red-100 text-red-800 border-red-200",
  high: "bg-orange-100 text-orange-800 border-orange-200",
  medium: "bg-yellow-100 text-yellow-800 border-yellow-200",
  low: "bg-blue-100 text-blue-800 border-blue-200",
};

const STATE_BADGE: Record<string, string> = {
  open: "bg-red-50 text-red-700",
  snoozed: "bg-gray-100 text-gray-600",
  resolved: "bg-green-100 text-green-700",
};

const ALERT_TYPES = [
  { value: "", label: "All types" },
  { value: "low_stock", label: "Low stock" },
  { value: "out_of_stock", label: "Out of stock" },
  { value: "predicted_stockout", label: "Predicted stockout" },
  { value: "expiry_risk", label: "Expiry risk" },
  { value: "unusual_price_increase", label: "Price spike" },
  { value: "no_recent_scan", label: "No recent scan" },
];

const SEVERITIES = [
  { value: "", label: "All severity" },
  { value: "critical", label: "Critical" },
  { value: "high", label: "High" },
  { value: "medium", label: "Medium" },
  { value: "low", label: "Low" },
];

function MobileAlertCard({
  alert,
  actionId,
  onSnooze,
  onResolve,
}: {
  alert: Alert;
  actionId: string | null;
  onSnooze: () => void;
  onResolve: () => void;
}) {
  const [offsetX, setOffsetX] = useState(0);
  const pointerIdRef = useRef<number | null>(null);
  const startXRef = useRef(0);

  function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    pointerIdRef.current = event.pointerId;
    startXRef.current = event.clientX;
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (pointerIdRef.current !== event.pointerId) return;
    const delta = event.clientX - startXRef.current;
    setOffsetX(Math.max(-104, Math.min(24, delta)));
  }

  function handlePointerEnd(event: ReactPointerEvent<HTMLDivElement>) {
    if (pointerIdRef.current !== event.pointerId) return;
    const finalOffset = offsetX;
    pointerIdRef.current = null;
    setOffsetX(0);
    if (finalOffset <= -72 && alert.state === "open") onSnooze();
  }

  return (
    <div className="relative overflow-hidden rounded-2xl">
      <div className="pointer-events-none absolute inset-0 flex items-center justify-end px-4">
        <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-amber-700">
          Snooze
        </span>
      </div>
      <motion.div
        animate={{ x: offsetX }}
        transition={{ type: "spring", stiffness: 320, damping: 28 }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerEnd}
        onPointerCancel={handlePointerEnd}
        style={{ touchAction: "pan-y" }}
        className={cn(
          "rounded-2xl border bg-white p-4 shadow-sm",
          SEVERITY_COLORS[alert.severity] ?? "border-gray-200"
        )}
      >
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white/80">
            <Bell className="h-5 w-5 text-gray-700" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={cn(
                  "inline-flex rounded-full px-2 py-0.5 text-xs font-medium",
                  STATE_BADGE[alert.state] ?? ""
                )}
              >
                {alert.state}
              </span>
              <span className="text-[11px] uppercase tracking-wide text-gray-500">
                {alert.alert_type.replace(/_/g, " ")}
              </span>
              <span className="text-[11px] font-semibold uppercase tracking-wide">
                {alert.severity}
              </span>
            </div>
            <p className="mt-2 text-sm font-semibold text-gray-900">{alert.title}</p>
            <p className="mt-1 text-sm leading-6 text-gray-600">{alert.body}</p>
            <p className="mt-2 text-xs text-gray-400">
              {new Date(alert.created_at).toLocaleString()}
            </p>
            {alert.state !== "resolved" && (
              <div className="mt-3 flex flex-wrap gap-2">
                {alert.state === "open" && (
                  <button
                    onClick={onSnooze}
                    disabled={actionId === alert.id}
                    className="min-h-[44px] rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 disabled:opacity-50"
                  >
                    Snooze 24h
                  </button>
                )}
                <button
                  onClick={onResolve}
                  disabled={actionId === alert.id}
                  className="min-h-[44px] rounded-xl border border-green-200 bg-green-50 px-3 py-2 text-sm font-semibold text-green-700 disabled:opacity-50"
                >
                  Resolve
                </button>
              </div>
            )}
          </div>
        </div>
      </motion.div>
    </div>
  );
}

export default function AlertsPage() {
  const [data, setData] = useState<AlertsResponse | null>(null);
  const [stateFilter, setStateFilter] = useState<string>("open");
  const [typeFilter, setTypeFilter] = useState<string>("");
  const [severityFilter, setSeverityFilter] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionId, setActionId] = useState<string | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [notificationPermission, setNotificationPermission] = useState<
    NotificationPermission | "unsupported"
  >("unsupported");

  useEffect(() => {
    if (typeof window !== "undefined" && "Notification" in window) {
      setNotificationPermission(Notification.permission);
    }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const resp = await listAlerts({
        state: stateFilter === "all" ? undefined : stateFilter,
        alert_type: typeFilter || undefined,
        page_size: 50,
      });
      setData(resp);
    } catch (err) {
      setError("We couldn't load alerts right now.");
      captureUIError("load_alerts", err);
    } finally {
      setLoading(false);
    }
  }, [stateFilter, typeFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  const visibleAlerts = (data?.alerts ?? []).filter(
    (a) => !severityFilter || a.severity === severityFilter
  );

  async function handleSnooze(alert: Alert) {
    setActionId(alert.id);
    const until = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
    try {
      await snoozeAlert(alert.id, until);
      await load();
      toast.success("Alert snoozed for 24 hours.");
    } catch (err) {
      captureUIError("snooze_alert", err);
    } finally {
      setActionId(null);
    }
  }

  async function handleResolve(alert: Alert) {
    setActionId(alert.id);
    try {
      await resolveAlert(alert.id);
      await load();
      toast.success("Alert resolved.");
    } catch (err) {
      captureUIError("resolve_alert", err);
    } finally {
      setActionId(null);
    }
  }

  async function handleEnableNotifications() {
    if (typeof window === "undefined" || !("Notification" in window)) return;
    const permission = await Notification.requestPermission();
    setNotificationPermission(permission);
    if (permission === "granted") {
      toast.success("Browser notifications enabled.");
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="space-y-4"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div>
          <h1 className="text-[clamp(1.35rem,5vw,1.75rem)] font-semibold text-gray-900">Alerts</h1>
          {data && (
            <p className="mt-1 text-sm text-gray-500">
              {data.open_count} open alert{data.open_count !== 1 ? "s" : ""}
            </p>
          )}
        </div>

        <div className="flex gap-1 rounded-xl bg-gray-100 p-1 text-sm">
          {["open", "snoozed", "resolved", "all"].map((s) => (
            <button
              key={s}
              onClick={() => setStateFilter(s)}
              className={cn(
                "min-h-[40px] rounded-lg px-3 py-1 capitalize transition-colors",
                stateFilter === s
                  ? "bg-white font-medium text-gray-900 shadow-sm"
                  : "text-gray-500 hover:text-gray-700"
              )}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white p-3">
        {notificationPermission !== "unsupported" && notificationPermission !== "granted" && (
          <div className="mb-3 flex flex-col gap-2 rounded-2xl border border-blue-100 bg-blue-50 p-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-medium text-blue-900">Enable browser notifications</p>
              <p className="text-xs text-blue-700">
                Get low-stock and expiry alerts on your phone once push subscriptions are connected.
              </p>
            </div>
            <button
              type="button"
              onClick={() => void handleEnableNotifications()}
              className="min-h-[44px] rounded-xl bg-blue-600 px-3 py-2 text-sm font-semibold text-white"
            >
              Enable
            </button>
          </div>
        )}

        <button
          type="button"
          onClick={() => setFiltersOpen((value) => !value)}
          className="flex min-h-[44px] w-full items-center justify-between md:hidden"
        >
          <span className="text-sm font-medium text-gray-900">Filter alerts</span>
          <ChevronDown className={cn("h-4 w-4 text-gray-500 transition-transform", filtersOpen && "rotate-180")} />
        </button>

        <div className={cn("hidden flex-wrap gap-2 md:flex", filtersOpen && "mt-3 flex")}>
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="min-h-[44px] rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {ALERT_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>

          <select
            value={severityFilter}
            onChange={(e) => setSeverityFilter(e.target.value)}
            className="min-h-[44px] rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {SEVERITIES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>

          {(typeFilter || severityFilter) && (
            <button
              onClick={() => {
                setTypeFilter("");
                setSeverityFilter("");
              }}
              className="min-h-[44px] rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-500 transition-colors hover:bg-gray-50"
            >
              Clear filters
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <PageLoadingState
          title="Loading alerts"
          message="Checking for low stock, expiry, and other issues."
        />
      ) : error ? (
        <PageErrorState title="Alerts unavailable" message={error} onRetry={() => void load()} />
      ) : !visibleAlerts.length ? (
        <EmptyState
          icon={ShieldCheck}
          badge="All clear"
          headline={
            stateFilter === "open"
              ? "No open alerts"
              : stateFilter === "snoozed"
                ? "No snoozed alerts"
                : "No alerts"
          }
          body={
            stateFilter === "open"
              ? typeFilter || severityFilter
                ? "No alerts match your current filters — try clearing them."
                : "Your inventory levels are healthy. We'll alert you immediately if anything needs attention."
              : "Nothing here right now."
          }
          cta={stateFilter === "open" ? { label: "Go to restock", href: "/dashboard/restock" } : undefined}
          secondaryCta={typeFilter || severityFilter ? { label: "Go to predictions", href: "/dashboard/predictions" } : undefined}
        />
      ) : (
        <AnimatePresence initial={false}>
          <div className="space-y-3">
            {visibleAlerts.map((alert) => (
              <motion.div
                key={alert.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.97 }}
              >
                <div className="hidden sm:block">
                  <div
                    className={cn(
                      "rounded-xl border bg-white p-4",
                      SEVERITY_COLORS[alert.severity] ?? "border-gray-200"
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={cn(
                              "inline-flex rounded-full px-2 py-0.5 text-xs font-medium",
                              STATE_BADGE[alert.state] ?? ""
                            )}
                          >
                            {alert.state}
                          </span>
                          <span className="text-xs uppercase tracking-wide text-gray-500">
                            {alert.alert_type.replace(/_/g, " ")}
                          </span>
                          <span className="text-xs font-semibold uppercase tracking-wide">
                            {alert.severity}
                          </span>
                        </div>
                        <p className="mt-1 font-medium text-gray-900">{alert.title}</p>
                        <p className="mt-0.5 text-sm text-gray-600">{alert.body}</p>
                        <p className="mt-1 text-xs text-gray-400">
                          {new Date(alert.created_at).toLocaleString()}
                        </p>
                      </div>

                      {alert.state !== "resolved" && (
                        <div className="flex shrink-0 gap-2">
                          {alert.state === "open" && (
                            <button
                              onClick={() => handleSnooze(alert)}
                              disabled={actionId === alert.id}
                              className="rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs text-gray-600 transition-colors hover:bg-gray-50 disabled:opacity-50"
                            >
                              Snooze 24h
                            </button>
                          )}
                          <button
                            onClick={() => handleResolve(alert)}
                            disabled={actionId === alert.id}
                            className="rounded-lg border border-green-200 bg-green-50 px-2.5 py-1.5 text-xs text-green-700 transition-colors hover:bg-green-100 disabled:opacity-50"
                          >
                            Resolve
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="sm:hidden">
                  <MobileAlertCard
                    alert={alert}
                    actionId={actionId}
                    onSnooze={() => void handleSnooze(alert)}
                    onResolve={() => void handleResolve(alert)}
                  />
                </div>
              </motion.div>
            ))}
          </div>
        </AnimatePresence>
      )}
    </motion.div>
  );
}
