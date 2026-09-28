"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { ArrowRight, CircleDollarSign, Network, RefreshCw } from "lucide-react";

import { getExchangeSummary } from "@/lib/api/endpoints";
import type { ExchangeSummary } from "@/lib/api/types";

const stages = ["Requirement", "RFQ", "Offers", "Negotiation", "Policy", "Order", "Fulfilment", "Reconciliation"];

function money(value: number | null | undefined) {
  return value == null ? "N/A" : new Intl.NumberFormat("en-SG", { style: "currency", currency: "SGD", maximumFractionDigits: 0 }).format(value);
}

export default function ExchangePage() {
  const [summary, setSummary] = useState<ExchangeSummary | null>(null);
  const [loading, setLoading] = useState(true);
  async function load() {
    setLoading(true);
    try { setSummary(await getExchangeSummary()); } finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []);
  const metrics = useMemo(() => [
    ["RFQ value", money(summary?.rfq_value)], ["Active RFQs", summary?.active_rfqs ?? "N/A"], ["Offers received", summary?.offers_received ?? "N/A"],
    ["Orders created", summary?.orders_created ?? "N/A"], ["Commercial improvement", money(summary?.commercial_improvement)],
    ["Active buyer agents", summary?.active_buyer_agents ?? "N/A"], ["Active suppliers", summary?.active_suppliers ?? "N/A"],
  ], [summary]);

  return <main className="min-h-screen bg-slate-50 px-4 py-6 sm:px-6 lg:px-8"><div className="mx-auto max-w-7xl space-y-6">
    <header className="flex items-center justify-between rounded-lg border border-slate-200 bg-white p-5 shadow-sm"><div><p className="text-xs font-semibold uppercase tracking-wide text-sky-700">Agentic Commerce</p><h1 className="mt-1 text-2xl font-semibold text-slate-950">Neumas Exchange</h1><p className="mt-2 text-sm text-slate-600">Live commercial activity governed by supplier eligibility, policy, and evidence.</p></div><button aria-label="Refresh exchange" onClick={() => void load()} className="rounded-lg border border-slate-200 p-2"><RefreshCw className="h-4 w-4" /></button></header>
    {loading ? <div className="grid gap-3 md:grid-cols-4">{Array.from({ length: 7 }).map((_, i) => <div key={i} className="h-24 animate-pulse rounded-lg bg-white" />)}</div> : <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">{metrics.map(([label, value]) => <div key={String(label)} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm"><p className="text-xs font-semibold uppercase text-slate-500">{label}</p><p className="mt-2 text-xl font-semibold text-slate-950">{value}</p></div>)}</section>}
    <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-center gap-2"><Network className="h-5 w-5 text-sky-700" /><h2 className="font-semibold text-slate-950">Live transaction funnel</h2></div><div className="mt-5 grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-8">{stages.map((stage, index) => <motion.div key={stage} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.04 }} className="relative rounded-lg border border-slate-200 bg-slate-50 p-3"><p className="text-xs font-semibold text-slate-500">{index + 1}</p><p className="mt-1 text-sm font-semibold text-slate-950">{stage}</p>{index < stages.length - 1 ? <ArrowRight className="absolute -right-2 top-1/2 hidden h-4 w-4 -translate-y-1/2 text-slate-400 xl:block" /> : null}</motion.div>)}</div></section>
    <div className="grid gap-6 lg:grid-cols-2"><section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm"><div className="flex justify-between"><h2 className="font-semibold">Live RFQs</h2><Link href="/dashboard/rfqs" className="text-sm font-semibold text-sky-700">View all</Link></div><div className="mt-4 space-y-3">{summary?.rfqs.slice(0, 6).map((rfq) => <Link key={rfq.id} href={`/dashboard/rfqs/${rfq.id}`} className="flex items-center justify-between rounded-lg border border-slate-200 p-3"><div><p className="font-medium text-slate-950">{rfq.title}</p><p className="text-xs text-slate-500">{rfq.offers.length} offers · {rfq.invitations.length} invited</p></div><span className="text-xs font-semibold text-sky-700">{rfq.status}</span></Link>)}{summary && !summary.rfqs.length ? <p className="text-sm text-slate-500">No RFQs yet.</p> : null}</div></section>
    <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm"><h2 className="font-semibold">Network activity</h2><div className="mt-4 space-y-3">{summary?.network_activity.slice(0, 8).map((event, index) => <div key={String(event.id ?? index)} className="flex gap-3 border-b border-slate-100 pb-3"><CircleDollarSign className="h-4 w-4 text-emerald-600" /><div><p className="text-sm font-medium text-slate-900">{String(event.event_type ?? "Commercial update")}</p><p className="text-xs text-slate-500">Offer version {String(event.to_version ?? "")}</p></div></div>)}{summary && !summary.network_activity.length ? <p className="text-sm text-slate-500">No network activity yet.</p> : null}</div></section></div>
  </div></main>;
}
