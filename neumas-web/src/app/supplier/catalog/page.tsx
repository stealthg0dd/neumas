"use client";

import { useState } from "react";
import { importSupplierCatalog } from "@/lib/api/endpoints";

export default function SupplierCatalogPage() {
  const [csv, setCsv] = useState("name,sku,unit,pack_size,unit_price,moq\nRoma Tomato,TOM-001,kg,5,3.20,10\n");
  const [result, setResult] = useState<{ imported: number; skipped: number; errors: string[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function runImport() {
    setBusy(true);
    setError(null);
    try {
      setResult(await importSupplierCatalog({ format: "csv", csv_text: csv }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <header className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <p className="text-xs font-semibold uppercase text-sky-700">Onboarding</p>
        <h1 className="mt-1 text-2xl font-semibold text-slate-950">Catalog import</h1>
        <p className="mt-2 text-sm text-slate-600">CSV, manual UI, REST, and webhook supported. EDI/cXML/SFTP not in this phase.</p>
      </header>
      {error ? <p className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p> : null}
      <section className="grid grid-cols-12 gap-4">
        <div className="col-span-12 lg:col-span-8">
          <textarea
            value={csv}
            onChange={(e) => setCsv(e.target.value)}
            rows={14}
            className="w-full rounded-lg border border-slate-200 bg-white p-3 font-mono text-xs text-slate-800 shadow-sm"
          />
          <button
            disabled={busy}
            onClick={() => void runImport()}
            className="mt-3 rounded-lg bg-slate-950 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            Import CSV
          </button>
        </div>
        <div className="col-span-12 space-y-3 lg:col-span-4">
          <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-xs font-semibold uppercase text-slate-500">Channels</p>
            <ul className="mt-3 space-y-2 text-sm text-slate-700">
              <li>CSV upload (this page)</li>
              <li>Manual UI edits</li>
              <li>REST `POST /api/supplier/catalog/import`</li>
              <li>Webhook `POST /api/supplier/webhooks/ingest`</li>
            </ul>
          </div>
          {result ? (
            <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-xs font-semibold uppercase text-slate-500">Last import</p>
              <p className="mt-2 text-sm">Imported {result.imported}</p>
              <p className="text-sm">Skipped {result.skipped}</p>
              {result.errors.length ? (
                <ul className="mt-2 space-y-1 text-xs text-rose-600">
                  {result.errors.map((e) => (
                    <li key={e}>{e}</li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}
