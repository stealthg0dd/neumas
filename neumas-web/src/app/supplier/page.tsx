"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { ArrowRight, RefreshCw } from "lucide-react";

import {
  activateSupplierAgent,
  createSupplierAccount,
  getSupplierSummary,
} from "@/lib/api/endpoints";
import type { SupplierWorkspaceSummary } from "@/lib/api/types";
import { SUPPLIER_ONBOARDING_STEPS } from "@/lib/supplier-nav";

function money(value: number | null | undefined) {
  return value == null
    ? "—"
    : new Intl.NumberFormat("en-SG", { style: "currency", currency: "SGD", maximumFractionDigits: 0 }).format(value);
}

function pct(value: number | null | undefined) {
  return value == null ? "—" : `${Number(value).toFixed(0)}%`;
}

export default function SupplierHomePage() {
  const [summary, setSummary] = useState<SupplierWorkspaceSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      setSummary(await getSupplierSummary());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load supplier workspace");
      setSummary(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const metrics = useMemo(() => {
    const m = summary?.metrics;
    return [
      ["Open RFQ value", money(m?.open_rfq_value)],
      ["RFQs requiring response", m?.rfqs_requiring_response ?? "—"],
      ["Offers submitted", m?.offers_submitted ?? "—"],
      ["Orders won", m?.orders_won ?? "—"],
      ["Agent-sourced revenue", money(m?.agent_sourced_revenue)],
      ["Catalog readiness", pct(m?.catalog_readiness_pct)],
      ["Fill rate", pct(m?.fill_rate)],
    ] as const;
  }, [summary]);

  async function startOnboarding() {
    if (!name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await createSupplierAccount({ display_name: name.trim() });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create supplier profile");
    } finally {
      setBusy(false);
    }
  }

  async function activate() {
    setBusy(true);
    setError(null);
    try {
      await activateSupplierAgent();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not activate agent endpoint");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <header className="flex items-start justify-between rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-sky-700">Supplier portal</p>
          <h1 className="mt-1 text-2xl font-semibold text-slate-950">
            {summary?.account?.display_name ?? "Become agent-ready"}
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-600">
            Onboard catalog, availability, commercial terms, and activate your agent endpoint without Neumas engineering help.
          </p>
        </div>
        <button aria-label="Refresh supplier workspace" onClick={() => void load()} className="rounded-lg border border-slate-200 p-2">
          <RefreshCw className="h-4 w-4" />
        </button>
      </header>

      {error ? <p className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p> : null}

      {loading ? (
        <div className="grid grid-cols-12 gap-3">
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="col-span-12 h-24 animate-pulse rounded-lg bg-white sm:col-span-6 lg:col-span-3 xl:col-span-3" />
          ))}
        </div>
      ) : !summary?.account ? (
        <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-950">Create supplier profile</h2>
          <p className="mt-2 text-sm text-slate-600">Reuses your org vendor identity — no duplicate supplier entity.</p>
          <div className="mt-4 flex flex-col gap-3 sm:flex-row">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Supplier trading name"
              className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm"
            />
            <button
              disabled={busy || !name.trim()}
              onClick={() => void startOnboarding()}
              className="rounded-lg bg-slate-950 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              Start onboarding
            </button>
          </div>
        </section>
      ) : (
        <>
          <section className="grid grid-cols-12 gap-3">
            {metrics.map(([label, value], index) => (
              <motion.div
                key={label}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.03 }}
                className="col-span-6 rounded-lg border border-slate-200 bg-white p-4 shadow-sm lg:col-span-3 xl:col-span-3"
              >
                <p className="text-xs font-semibold uppercase text-slate-500">{label}</p>
                <p className="mt-2 text-xl font-semibold text-slate-950">{value}</p>
              </motion.div>
            ))}
          </section>

          <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="font-semibold text-slate-950">Onboarding</h2>
                <p className="text-sm text-slate-500">Step: {summary.account.onboarding_step}</p>
              </div>
              {!summary.account.agent_endpoint_enabled ? (
                <button
                  disabled={busy}
                  onClick={() => void activate()}
                  className="rounded-lg bg-sky-700 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
                >
                  Activate agent endpoint
                </button>
              ) : (
                <span className="rounded-lg bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">Agent ready</span>
              )}
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-9">
              {SUPPLIER_ONBOARDING_STEPS.map((step, index) => {
                const current = summary.account?.onboarding_step === step.key;
                const done =
                  summary.account?.onboarding_step === "complete" ||
                  SUPPLIER_ONBOARDING_STEPS.findIndex((s) => s.key === summary.account?.onboarding_step) > index;
                return (
                  <div
                    key={step.key}
                    className={`rounded-lg border p-3 ${current ? "border-sky-600 bg-sky-50" : done ? "border-emerald-200 bg-emerald-50" : "border-slate-200 bg-slate-50"}`}
                  >
                    <p className="text-[10px] font-semibold uppercase text-slate-500">{index + 1}</p>
                    <p className="mt-1 text-xs font-semibold text-slate-900">{step.label}</p>
                  </div>
                );
              })}
            </div>
          </section>

          <div className="grid grid-cols-12 gap-4">
            <Link href="/supplier/rfqs" className="col-span-12 rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:col-span-6 lg:col-span-4">
              <p className="text-sm font-semibold text-slate-950">RFQs</p>
              <p className="mt-1 text-xs text-slate-500">{summary.metrics.rfqs_requiring_response} need response</p>
              <ArrowRight className="mt-3 h-4 w-4 text-sky-700" />
            </Link>
            <Link href="/supplier/catalog" className="col-span-12 rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:col-span-6 lg:col-span-4">
              <p className="text-sm font-semibold text-slate-950">Catalog</p>
              <p className="mt-1 text-xs text-slate-500">{pct(summary.metrics.catalog_readiness_pct)} ready</p>
              <ArrowRight className="mt-3 h-4 w-4 text-sky-700" />
            </Link>
            <Link href="/supplier/agent-api" className="col-span-12 rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:col-span-6 lg:col-span-4">
              <p className="text-sm font-semibold text-slate-950">Agent API</p>
              <p className="mt-1 text-xs text-slate-500">
                {summary.account.agent_endpoint_enabled ? "Endpoint active" : "Activate to publish"}
              </p>
              <ArrowRight className="mt-3 h-4 w-4 text-sky-700" />
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
