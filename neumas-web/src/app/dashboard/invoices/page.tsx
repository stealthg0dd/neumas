"use client";

import { useEffect, useState } from "react";

import { getPurchasingSummary } from "@/lib/api/endpoints";
import type { PurchasingSummary } from "@/lib/api/types";
import { captureUIError } from "@/lib/analytics";
import { formatCurrency } from "@/lib/currency";

export default function InvoicesPage() {
  const [summary, setSummary] = useState<PurchasingSummary | null>(null);
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const payload = await getPurchasingSummary();
        if (!cancelled) setSummary(payload);
      } catch (err) {
        captureUIError("invoices_load", err);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, []);
  return (
    <main className="min-h-screen bg-slate-50 px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><p className="text-xs font-semibold uppercase tracking-wide text-sky-700">Invoices</p><h1 className="mt-1 text-2xl font-semibold text-slate-950">Supplier Invoices</h1><p className="mt-2 text-sm text-slate-600">Scanned documents can link to supplier invoices, purchase orders, and goods receipts.</p></header>
        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {(summary?.invoices ?? []).map((invoice) => <div key={String(invoice.id)} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="font-semibold text-slate-950">{String(invoice.invoice_number ?? invoice.id)}</h2><p className="mt-2 text-sm text-slate-500">{formatCurrency(Number(invoice.total ?? 0), String(invoice.currency ?? "USD"))}</p></div>)}
        </section>
        {summary && summary.invoices.length === 0 && <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-8 text-center text-sm text-slate-500">No supplier invoices yet.</div>}
      </div>
    </main>
  );
}
