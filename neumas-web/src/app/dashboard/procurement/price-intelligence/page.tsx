"use client";

import { useEffect, useState } from "react";

import { getProcurementSummary } from "@/lib/api/endpoints";
import type { ProcurementSummary } from "@/lib/api/types";
import { captureUIError } from "@/lib/analytics";
import { formatCurrency } from "@/lib/currency";

export default function PriceIntelligencePage() {
  const [summary, setSummary] = useState<ProcurementSummary | null>(null);
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const payload = await getProcurementSummary();
        if (!cancelled) setSummary(payload);
      } catch (err) {
        captureUIError("price_intelligence_load", err);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-sky-700">Supplier Intelligence</p>
          <h1 className="mt-1 text-2xl font-semibold text-slate-950">Price Intelligence</h1>
          <p className="mt-2 text-sm text-slate-600">Latest vs historical price, contract variance, volatility, supplier comparison, and potential switch savings.</p>
        </header>
        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {(summary?.price_intelligence ?? []).map((item) => (
            <div key={item.canonical_ingredient_id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="font-semibold text-slate-950">{item.ingredient_name}</h2>
              <dl className="mt-4 space-y-2 text-sm text-slate-600">
                <div className="flex justify-between"><dt>Latest</dt><dd>{item.latest_price == null ? "N/A" : formatCurrency(item.latest_price, "USD")}</dd></div>
                <div className="flex justify-between"><dt>Historical</dt><dd>{item.historical_price == null ? "N/A" : formatCurrency(item.historical_price, "USD")}</dd></div>
                <div className="flex justify-between"><dt>Contract variance</dt><dd>{item.contract_variance == null ? "N/A" : formatCurrency(item.contract_variance, "USD")}</dd></div>
                <div className="flex justify-between"><dt>Volatility</dt><dd>{item.price_volatility == null ? "N/A" : formatCurrency(item.price_volatility, "USD")}</dd></div>
                <div className="flex justify-between"><dt>Switch savings</dt><dd>{item.potential_switch_savings == null ? "N/A" : formatCurrency(item.potential_switch_savings, "USD")}</dd></div>
                <div className="flex justify-between"><dt>Suppliers</dt><dd>{item.supplier_count}</dd></div>
              </dl>
            </div>
          ))}
        </section>
        {summary && summary.price_intelligence.length === 0 && <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-8 text-center text-sm text-slate-500">No supplier offer price intelligence yet.</div>}
      </div>
    </main>
  );
}
