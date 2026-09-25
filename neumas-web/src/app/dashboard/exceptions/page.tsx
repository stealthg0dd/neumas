"use client";

import { useEffect, useState } from "react";

import { getPurchasingSummary } from "@/lib/api/endpoints";
import type { PurchasingSummary } from "@/lib/api/types";
import { captureUIError } from "@/lib/analytics";

export default function ExceptionsPage() {
  const [summary, setSummary] = useState<PurchasingSummary | null>(null);
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const payload = await getPurchasingSummary();
        if (!cancelled) setSummary(payload);
      } catch (err) {
        captureUIError("exceptions_load", err);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, []);
  return (
    <main className="min-h-screen bg-slate-50 px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><p className="text-xs font-semibold uppercase tracking-wide text-sky-700">Exceptions</p><h1 className="mt-1 text-2xl font-semibold text-slate-950">Action Queue</h1><p className="mt-2 text-sm text-slate-600">Three-way match and acknowledgement changes that require review.</p></header>
        <section className="space-y-3">
          {(summary?.exceptions ?? []).map((item) => <div key={String(item.id)} className="rounded-2xl border border-amber-200 bg-amber-50 p-5"><h2 className="font-semibold text-amber-950">{String(item.status ?? "Review")}</h2><p className="mt-2 text-sm text-amber-800">{JSON.stringify(item.summary ?? {})}</p><button className="mt-4 rounded-lg bg-slate-950 px-3 py-2 text-xs font-semibold text-white">Review case</button></div>)}
        </section>
        {summary && summary.exceptions.length === 0 && <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-8 text-center text-sm text-slate-500">No purchasing exceptions yet.</div>}
      </div>
    </main>
  );
}
