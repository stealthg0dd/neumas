"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { activateSupplierAgent, getSupplierSummary } from "@/lib/api/endpoints";
import type { SupplierWorkspaceSummary } from "@/lib/api/types";

export default function SupplierAgentApiPage() {
  const [summary, setSummary] = useState<SupplierWorkspaceSummary | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    setSummary(await getSupplierSummary());
  }
  useEffect(() => {
    void load();
  }, []);

  async function activate() {
    setBusy(true);
    try {
      await activateSupplierAgent();
      await load();
    } finally {
      setBusy(false);
    }
  }

  const enabled = summary?.account?.agent_endpoint_enabled;
  const caps = summary?.capabilities ?? [];

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <header className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <p className="text-xs font-semibold uppercase text-sky-700">Agent commerce</p>
        <h1 className="mt-1 text-2xl font-semibold">Agent API</h1>
        <p className="mt-2 text-sm text-slate-600">
          Activate your agent endpoint, then manage credentials from Developer tools.
        </p>
      </header>
      <section className="grid grid-cols-12 gap-4">
        <div className="col-span-12 rounded-lg border border-slate-200 bg-white p-5 shadow-sm lg:col-span-7">
          <p className="text-sm font-semibold">Endpoint status</p>
          <p className="mt-2 text-2xl font-semibold text-slate-950">{enabled ? "Active" : "Not activated"}</p>
          {!enabled ? (
            <button
              disabled={busy || !summary?.account}
              onClick={() => void activate()}
              className="mt-4 rounded-lg bg-sky-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              Activate agent endpoint
            </button>
          ) : (
            <Link href="/dashboard/developer" className="mt-4 inline-block text-sm font-semibold text-sky-700">
              Manage API credentials →
            </Link>
          )}
          <div className="mt-6 space-y-2 text-sm text-slate-600">
            <p>REST: `/api/agent-commerce/v1/*`</p>
            <p>MCP: `/api/agent-commerce/v1/mcp`</p>
            <p>Webhook ingest: `/api/supplier/webhooks/ingest`</p>
          </div>
        </div>
        <div className="col-span-12 rounded-lg border border-slate-200 bg-white p-5 shadow-sm lg:col-span-5">
          <p className="text-sm font-semibold">Capabilities</p>
          <ul className="mt-3 space-y-2 text-sm">
            {caps.map((cap) => (
              <li key={String(cap.id ?? cap.capability)} className="flex justify-between border-b border-slate-100 pb-2">
                <span>{String(cap.capability)}</span>
                <span className={cap.enabled ? "text-emerald-700" : "text-slate-400"}>
                  {cap.enabled ? "on" : "off"}
                </span>
              </li>
            ))}
            {!caps.length ? <li className="text-slate-500">No capabilities until profile is created.</li> : null}
          </ul>
        </div>
      </section>
    </div>
  );
}
