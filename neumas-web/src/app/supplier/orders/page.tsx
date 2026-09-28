"use client";

import { useEffect, useState } from "react";
import { getSupplierSummary } from "@/lib/api/endpoints";

export default function SupplierOrdersPage() {
  const [won, setWon] = useState<number | null>(null);
  useEffect(() => {
    void getSupplierSummary().then((s) => setWon(s.metrics.orders_won));
  }, []);
  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <header className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <p className="text-xs font-semibold uppercase text-sky-700">Fulfilment</p>
        <h1 className="mt-1 text-2xl font-semibold">Orders won</h1>
        <p className="mt-2 text-sm text-slate-600">Accepted offers for your vendor identity.</p>
      </header>
      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <p className="text-xs font-semibold uppercase text-slate-500">Orders won</p>
        <p className="mt-2 text-3xl font-semibold text-slate-950">{won == null ? "—" : won}</p>
        {!won ? <p className="mt-4 text-sm text-slate-500">No won orders yet. Respond to open RFQs to start winning volume.</p> : null}
      </section>
    </div>
  );
}
