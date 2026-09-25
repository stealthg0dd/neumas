"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { getPurchasingSummary } from "@/lib/api/endpoints";
import type { PurchaseOrder } from "@/lib/api/types";
import { formatCurrency } from "@/lib/currency";

export default function PurchaseOrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [id, setId] = useState<string>("");
  useEffect(() => {
    async function load() {
      const resolved = await params;
      setId(resolved.id);
      const summary = await getPurchasingSummary();
      setOrders(summary.purchase_orders);
    }
    void load();
  }, [params]);
  const po = useMemo(() => orders.find((row) => row.id === id), [orders, id]);
  return (
    <main className="min-h-screen bg-slate-50 px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-5xl space-y-6">
        <Link href="/dashboard/procurement/purchase-orders" className="text-sm font-semibold text-slate-600">Back to purchase orders</Link>
        {!po ? <div className="h-64 animate-pulse rounded-2xl bg-white" /> : (
          <>
            <header className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><p className="text-xs font-semibold uppercase tracking-wide text-sky-700">Purchase Order</p><h1 className="mt-1 text-2xl font-semibold text-slate-950">{po.external_reference ?? po.id}</h1><p className="mt-2 text-sm text-slate-600">{po.state} · {formatCurrency(po.total, po.currency)}</p></header>
            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="font-semibold text-slate-950">Commercial Snapshot</h2><pre className="mt-3 overflow-x-auto rounded-xl bg-slate-950 p-4 text-xs text-white">{JSON.stringify(po.items, null, 2)}</pre></section>
          </>
        )}
      </div>
    </main>
  );
}
