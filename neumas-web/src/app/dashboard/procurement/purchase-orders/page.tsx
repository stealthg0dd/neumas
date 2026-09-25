"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { getPurchasingSummary } from "@/lib/api/endpoints";
import type { PurchasingSummary } from "@/lib/api/types";
import { captureUIError } from "@/lib/analytics";
import { formatCurrency } from "@/lib/currency";

export default function PurchaseOrdersPage() {
  const [summary, setSummary] = useState<PurchasingSummary | null>(null);
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const payload = await getPurchasingSummary();
        if (!cancelled) setSummary(payload);
      } catch (err) {
        captureUIError("purchase_orders_load", err);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, []);

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-sky-700">Purchasing</p>
          <h1 className="mt-1 text-2xl font-semibold text-slate-950">Purchase Orders</h1>
          <p className="mt-2 text-sm text-slate-600">Durable PO lifecycle from draft through acknowledgement, receiving, invoice, and reconciliation.</p>
        </header>
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500"><tr><th className="px-4 py-3">PO</th><th className="px-4 py-3">Supplier</th><th className="px-4 py-3">State</th><th className="px-4 py-3">Expected delivery</th><th className="px-4 py-3">Total</th><th className="px-4 py-3">Action</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {(summary?.purchase_orders ?? []).map((po) => (
                <tr key={po.id}>
                  <td className="px-4 py-4 font-semibold text-slate-950">{po.external_reference ?? po.id.slice(0, 8)}</td>
                  <td className="px-4 py-4">{po.vendor_id}</td>
                  <td className="px-4 py-4">{po.state}</td>
                  <td className="px-4 py-4">{po.expected_delivery_date ?? "N/A"}</td>
                  <td className="px-4 py-4">{formatCurrency(po.total, po.currency)}</td>
                  <td className="px-4 py-4"><Link href={`/dashboard/procurement/purchase-orders/${po.id}`} className="text-sm font-semibold text-sky-700">Open</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
          {summary && summary.purchase_orders.length === 0 && <div className="p-8 text-center text-sm text-slate-500">No purchase orders yet.</div>}
        </section>
      </div>
    </main>
  );
}
