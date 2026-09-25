"use client";

import { useEffect, useState } from "react";

import { getProcurementSummary } from "@/lib/api/endpoints";
import type { ProcurementSummary } from "@/lib/api/types";
import { captureUIError } from "@/lib/analytics";

export default function SuppliersPage() {
  const [summary, setSummary] = useState<ProcurementSummary | null>(null);
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const payload = await getProcurementSummary();
        if (!cancelled) setSummary(payload);
      } catch (err) {
        captureUIError("suppliers_load", err);
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
          <h1 className="mt-1 text-2xl font-semibold text-slate-950">Suppliers</h1>
          <p className="mt-2 text-sm text-slate-600">Extends existing vendors with commercial offers and performance metrics.</p>
        </header>
        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {(summary?.suppliers ?? []).map((supplier) => (
            <div key={String(supplier.id)} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="font-semibold text-slate-950">{String(supplier.name ?? "Supplier")}</h2>
              <p className="mt-2 text-sm text-slate-500">{String(supplier.contact_email ?? supplier.phone ?? "Commercial terms tracked through supplier offers.")}</p>
            </div>
          ))}
        </section>
        {summary && summary.suppliers.length === 0 && <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-8 text-center text-sm text-slate-500">No suppliers found.</div>}
      </div>
    </main>
  );
}
