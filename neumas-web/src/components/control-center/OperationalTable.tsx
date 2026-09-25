"use client";

import Link from "next/link";
import { ExternalLink } from "lucide-react";

import type { ControlCenterAction } from "@/lib/api/types";
import { ActionStatus } from "./ActionStatus";
import { ConfidenceBadge } from "./ConfidenceBadge";
import { FinancialImpact } from "./FinancialImpact";
import { RiskBadge } from "./RiskBadge";

export function OperationalTable({
  actions,
  emptyLabel,
  onInspect,
}: {
  actions: ControlCenterAction[];
  emptyLabel: string;
  onInspect: (action: ControlCenterAction) => void;
}) {
  if (!actions.length) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
        {emptyLabel}
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="overflow-x-auto">
        <table className="min-w-[980px] w-full border-collapse text-left text-sm">
          <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Risk</th>
              <th className="px-4 py-3">What changed</th>
              <th className="px-4 py-3">Impact</th>
              <th className="px-4 py-3">Evidence</th>
              <th className="px-4 py-3">Action</th>
              <th className="px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {actions.map((action) => (
              <tr key={`${action.category}-${action.id}`} className="align-top">
                <td className="px-4 py-4"><RiskBadge priority={action.priority} /></td>
                <td className="max-w-[240px] px-4 py-4">
                  <div className="font-semibold text-slate-950">{action.title}</div>
                  <div className="mt-1 text-slate-600">{action.what_changed}</div>
                  <div className="mt-2"><ConfidenceBadge value={action.confidence} /></div>
                </td>
                <td className="px-4 py-4"><FinancialImpact value={action.impact} /></td>
                <td className="max-w-[220px] px-4 py-4 text-slate-600">{action.evidence[0] ?? "Evidence pending"}</td>
                <td className="max-w-[220px] px-4 py-4">
                  <div className="text-slate-700">{action.recommended_action}</div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => onInspect(action)}
                      className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      Evidence
                    </button>
                    {action.href && (
                      <Link href={action.href} className="inline-flex items-center gap-1 rounded-lg bg-slate-900 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-slate-800">
                        Open <ExternalLink className="h-3 w-3" />
                      </Link>
                    )}
                  </div>
                </td>
                <td className="px-4 py-4"><ActionStatus status={action.status} approvalRequired={action.approval_required} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
