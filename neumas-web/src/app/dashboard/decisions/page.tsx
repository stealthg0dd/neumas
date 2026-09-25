"use client";

import { useEffect, useState } from "react";

import { listAutonomyDecisions } from "@/lib/api/endpoints";
import type { DecisionRecord } from "@/lib/api/types";
import { captureUIError } from "@/lib/analytics";

export default function DecisionsPage() {
  const [decisions, setDecisions] = useState<DecisionRecord[]>([]);
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const payload = await listAutonomyDecisions();
        if (!cancelled) setDecisions(payload);
      } catch (err) {
        captureUIError("decisions_load", err);
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
          <p className="text-xs font-semibold uppercase tracking-wide text-sky-700">Decision Ledger</p>
          <h1 className="mt-1 text-2xl font-semibold text-slate-950">Decisions</h1>
          <p className="mt-2 text-sm text-slate-600">Inspect trigger, evidence, policy evaluation, approval, action trace, verification, and outcome records.</p>
        </header>
        <section className="space-y-4">
          {decisions.map((decision) => (
            <article key={decision.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-slate-950">{decision.title}</h2>
                  <p className="mt-1 text-sm text-slate-500">{decision.created_by_agent ?? "Agent"} · {decision.decision_type}</p>
                </div>
                <span className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600">{decision.status}</span>
              </div>
              <div className="mt-4 grid gap-4 md:grid-cols-3">
                <div className="rounded-xl bg-slate-50 p-3"><p className="text-xs font-semibold uppercase text-slate-500">Policy</p><p className="mt-1 text-sm text-slate-800">{decision.policy_result}</p></div>
                <div className="rounded-xl bg-slate-50 p-3"><p className="text-xs font-semibold uppercase text-slate-500">Confidence</p><p className="mt-1 text-sm text-slate-800">{Math.round(decision.confidence * 100)}%</p></div>
                <div className="rounded-xl bg-slate-50 p-3"><p className="text-xs font-semibold uppercase text-slate-500">Trace</p><p className="mt-1 text-sm text-slate-800">{decision.evidence.length} evidence · {decision.approvals.length} approvals · {decision.actions.length} actions</p></div>
              </div>
              <pre className="mt-4 overflow-x-auto rounded-xl bg-slate-950 p-4 text-xs text-slate-100">{JSON.stringify(decision.proposed_action, null, 2)}</pre>
            </article>
          ))}
          {decisions.length === 0 && <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-8 text-center text-sm text-slate-500">No durable decisions yet.</div>}
        </section>
      </div>
    </main>
  );
}
