"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { use } from "react";
import { RotateCcw, Wand2 } from "lucide-react";
import { toast } from "sonner";

import { getScan, getScanStatus, rerunScanWithHint } from "@/lib/api/endpoints";
import type { Scan, ScanStatusResponse } from "@/lib/api/types";
import { PageErrorState, PageLoadingState } from "@/components/ui/PageState";

export default function ScanDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [scan, setScan] = useState<Scan | null>(null);
  const [status, setStatus] = useState<ScanStatusResponse | null>(null);
  const [hint, setHint] = useState("");
  const [rerunning, setRerunning] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [scanData, statusData] = await Promise.all([getScan(id), getScanStatus(id)]);
      setScan(scanData);
      setStatus(statusData);
    } catch {
      setError("We couldn't load this scan.");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleRerun() {
    if (!hint.trim()) {
      toast.error("Add a short hint so the VisionAgent knows what to correct.");
      return;
    }
    setRerunning(true);
    try {
      await rerunScanWithHint(id, hint.trim());
      toast.success("Scan queued for re-run with your hint.");
      setTimeout(() => void load(), 2500);
    } catch {
      toast.error("Unable to queue the scan re-run.");
    } finally {
      setRerunning(false);
    }
  }

  if (loading) {
    return <PageLoadingState title="Loading scan" message="Fetching extracted items and processing details." />;
  }

  if (error || !scan || !status) {
    return <PageErrorState title="Scan unavailable" message={error ?? "Scan not found"} onRetry={() => void load()} />;
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <Link href="/dashboard/scans/history" className="text-sm text-sky-700 hover:underline">
        Back to scan history
      </Link>

      <div className="rounded-2xl border border-gray-200 bg-white p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-sky-700">Scan detail</p>
            <h1 className="mt-1 text-2xl font-bold text-slate-900">{scan.scan_type} scan</h1>
            <p className="mt-1 text-sm text-slate-500">
              Status: {status.status.replace(/_/g, " ")} · {scan.items_detected} detected items
            </p>
          </div>
          <button
            type="button"
            onClick={() => void load()}
            className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
          >
            <RotateCcw className="h-4 w-4" />
            Refresh
          </button>
        </div>

        <div className="mt-5 grid gap-4 lg:grid-cols-[1.4fr_1fr]">
          <div className="rounded-xl bg-slate-50 p-4">
            <p className="text-sm font-semibold text-slate-900">Extracted items</p>
            <div className="mt-3 space-y-2">
              {(status.extracted_items ?? []).length === 0 ? (
                <p className="text-sm text-slate-500">No extracted items are available yet.</p>
              ) : (
                (status.extracted_items ?? []).map((item, index) => (
                  <div key={`${String(item.name ?? item.item_name)}-${index}`} className="rounded-lg bg-white px-3 py-2 text-sm text-slate-700">
                    <span className="font-medium">{String(item.name ?? item.item_name ?? "Unknown item")}</span>
                    {" · "}
                    {String(item.quantity ?? 1)} {String(item.unit ?? "unit")}
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
            <div className="flex items-center gap-2">
              <Wand2 className="h-4 w-4 text-amber-700" />
              <p className="text-sm font-semibold text-amber-900">Re-run with Hint</p>
            </div>
            <p className="mt-2 text-sm text-amber-800">
              Tell the VisionAgent what it missed, for example “treat Coke Zero 24x330ml as quantity 24 cans.”
            </p>
            <textarea
              value={hint}
              onChange={(e) => setHint(e.target.value)}
              rows={5}
              className="mt-3 w-full rounded-xl border border-amber-200 bg-white px-3 py-2 text-sm text-slate-700"
              placeholder="Describe the correction you want the model to apply."
            />
            <button
              type="button"
              disabled={rerunning}
              onClick={() => void handleRerun()}
              className="mt-3 inline-flex w-full items-center justify-center rounded-xl bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-60"
            >
              {rerunning ? "Queuing…" : "Re-run with Hint"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
