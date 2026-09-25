"use client";

import { useEffect, useState } from "react";

import { getPurchasingSummary } from "@/lib/api/endpoints";
import type { PurchasingSummary } from "@/lib/api/types";
import { captureUIError } from "@/lib/analytics";

export default function DeliveriesPage() {
  const [summary, setSummary] = useState<PurchasingSummary | null>(null);
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const payload = await getPurchasingSummary();
        if (!cancelled) setSummary(payload);
      } catch (err) {
        captureUIError("deliveries_load", err);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, []);
  return (
    <main className="min-h-screen bg-slate-50 px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><p className="text-xs font-semibold uppercase tracking-wide text-sky-700">Receiving</p><h1 className="mt-1 text-2xl font-semibold text-slate-950">Deliveries</h1><p className="mt-2 text-sm text-slate-600">Goods receipts post inventory via the ledger service.</p></header>
        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {(summary?.goods_receipts ?? []).map((receipt) => <div key={String(receipt.id)} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="font-semibold text-slate-950">{String(receipt.status ?? "Receipt")}</h2><p className="mt-2 text-sm text-slate-500">{String(receipt.receipt_date ?? "")}</p></div>)}
        </section>
        {summary && summary.goods_receipts.length === 0 && <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-8 text-center text-sm text-slate-500">No goods receipts yet.</div>}
      </div>
    </main>
  );
}
