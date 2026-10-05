"use client";

import { useEffect, useState } from "react";
import {
  createSupplierServiceArea,
  getSupplierSummary,
  upsertSupplierCommercialTerms,
} from "@/lib/api/endpoints";
import type { SupplierWorkspaceSummary } from "@/lib/api/types";

export default function SupplierSettingsPage() {
  const [summary, setSummary] = useState<SupplierWorkspaceSummary | null>(null);
  const [areaName, setAreaName] = useState("Central");
  const [areaValue, setAreaValue] = useState("01");
  const [paymentTerms, setPaymentTerms] = useState("Net 30");
  const [mov, setMov] = useState("200");
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    void getSupplierSummary().then(setSummary);
  }, []);

  async function saveArea() {
    await createSupplierServiceArea({ name: areaName, area_type: "postal_code", area_value: areaValue });
    setMessage("Service area saved");
    setSummary(await getSupplierSummary());
  }

  async function saveTerms() {
    await upsertSupplierCommercialTerms({
      payment_terms: paymentTerms,
      minimum_order_value: Number(mov),
      currency: "SGD",
      pack_rules: {},
      moq_rules: { default_moq: Number(mov) },
    });
    setMessage("Commercial terms saved");
    setSummary(await getSupplierSummary());
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <header className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <p className="text-xs font-semibold uppercase text-sky-700">Settings</p>
        <h1 className="mt-1 text-2xl font-semibold">Service areas & commercial terms</h1>
      </header>
      {message ? <p className="text-sm text-emerald-700">{message}</p> : null}
      <div className="grid grid-cols-12 gap-4">
        <section className="col-span-12 space-y-3 rounded-lg border border-slate-200 bg-white p-5 shadow-sm lg:col-span-6">
          <h2 className="font-semibold">Service area</h2>
          <input value={areaName} onChange={(e) => setAreaName(e.target.value)} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" placeholder="Name" />
          <input value={areaValue} onChange={(e) => setAreaValue(e.target.value)} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" placeholder="Postal / city value" />
          <button onClick={() => void saveArea()} className="rounded-lg bg-slate-950 px-3 py-2 text-sm font-semibold text-white">Save area</button>
          <ul className="mt-4 space-y-2 text-sm text-slate-600">
            {(summary?.service_areas ?? []).map((area) => (
              <li key={String(area.id)}>{String(area.name)} · {String(area.area_value)}</li>
            ))}
          </ul>
        </section>
        <section className="col-span-12 space-y-3 rounded-lg border border-slate-200 bg-white p-5 shadow-sm lg:col-span-6">
          <h2 className="font-semibold">Commercial terms / MOQ</h2>
          <input value={paymentTerms} onChange={(e) => setPaymentTerms(e.target.value)} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
          <input value={mov} onChange={(e) => setMov(e.target.value)} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" placeholder="Minimum order value" />
          <button onClick={() => void saveTerms()} className="rounded-lg bg-slate-950 px-3 py-2 text-sm font-semibold text-white">Save terms</button>
          {summary?.commercial_terms ? (
            <p className="mt-3 text-sm text-slate-600">
              Active MOV: {String(summary.commercial_terms.minimum_order_value ?? "—")} · {String(summary.commercial_terms.payment_terms ?? "")}
            </p>
          ) : null}
        </section>
      </div>
    </div>
  );
}
