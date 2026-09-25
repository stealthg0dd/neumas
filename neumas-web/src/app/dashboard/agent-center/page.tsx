"use client";

import { useEffect, useState } from "react";

import { getAgentCenterSummary } from "@/lib/api/endpoints";
import type { AgentCenterSummary } from "@/lib/api/types";
import { captureUIError } from "@/lib/analytics";

function pct(value: number | null | undefined) {
  return value == null ? "N/A" : `${Math.round(value * 100)}%`;
}

export default function AgentCenterPage() {
  const [summary, setSummary] = useState<AgentCenterSummary | null>(null);
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const payload = await getAgentCenterSummary();
        if (!cancelled) setSummary(payload);
      } catch (err) {
        captureUIError("agent_center_load", err);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const metrics = [
    ["Active agents", summary?.active_agents ?? "N/A"],
    ["Tasks executed", summary?.tasks_executed ?? "N/A"],
    ["Policy compliance", pct(summary?.policy_compliance)],
    ["Time saved", summary?.time_saved_hours == null ? "N/A" : `${summary.time_saved_hours}h`],
    ["POs/actions executed", summary?.actions_executed ?? "N/A"],
    ["Savings captured", summary?.savings_captured ?? "N/A"],
  ];

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-sky-700">Agent Center</p>
          <h1 className="mt-1 text-2xl font-semibold text-slate-950">Bounded Autonomous Roles</h1>
          <p className="mt-2 text-sm text-slate-600">Agents operate through domain services, policies, decisions, approvals, and the internal action gateway.</p>
        </header>
        <section className="grid gap-4 md:grid-cols-3 xl:grid-cols-6">
          {metrics.map(([label, value]) => (
            <div key={label} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
              <p className="mt-2 text-xl font-semibold text-slate-950">{String(value)}</p>
            </div>
          ))}
        </section>
        <section className="grid gap-6 xl:grid-cols-[1fr_340px]">
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr><th className="px-4 py-3">Agent & Task</th><th className="px-4 py-3">Reason/Evidence</th><th className="px-4 py-3">Confidence</th><th className="px-4 py-3">Policy</th><th className="px-4 py-3">Progress</th><th className="px-4 py-3">Status</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {(summary?.tasks ?? []).map((task, index) => (
                  <tr key={index}>
                    <td className="px-4 py-4 font-semibold text-slate-950">{String(task.agent)} · {String(task.task)}</td>
                    <td className="px-4 py-4">{String(task.reason)}</td>
                    <td className="px-4 py-4">{String(task.confidence)}</td>
                    <td className="px-4 py-4">{String(task.policy)}</td>
                    <td className="px-4 py-4">{Array.isArray(task.progress) ? task.progress.join(" -> ") : "Detect -> Evaluate -> Policy -> Execute -> Verify -> Learn"}</td>
                    <td className="px-4 py-4">{String(task.status)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {summary && summary.tasks.length === 0 && <div className="p-8 text-center text-sm text-slate-500">No agent tasks yet.</div>}
          </div>
          <aside className="space-y-4">
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><h2 className="font-semibold text-slate-950">Autonomy level</h2><p className="mt-2 text-sm text-slate-600">{summary?.autonomy_level ?? "N/A"}</p></div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><h2 className="font-semibold text-slate-950">Policy boundaries</h2><p className="mt-2 text-sm text-slate-600">{(summary?.policy_boundaries ?? []).map((p) => String(p.name ?? p.mode)).join(", ") || "No policy boundaries configured."}</p></div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><h2 className="font-semibold text-slate-950">Exception watchlist</h2><p className="mt-2 text-sm text-slate-600">{summary?.exception_watchlist.length ?? 0} open exception task(s)</p></div>
          </aside>
        </section>
      </div>
    </main>
  );
}
