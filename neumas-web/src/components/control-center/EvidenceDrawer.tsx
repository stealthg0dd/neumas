"use client";

import { X } from "lucide-react";

import type { ControlCenterAction } from "@/lib/api/types";

export function EvidenceDrawer({
  action,
  onClose,
}: {
  action: ControlCenterAction | null;
  onClose: () => void;
}) {
  if (!action) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/20" role="dialog" aria-modal="true">
      <div className="h-full w-full max-w-xl overflow-y-auto bg-white p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Evidence</p>
            <h2 className="mt-1 text-xl font-semibold text-slate-950">{action.title}</h2>
          </div>
          <button
            type="button"
            aria-label="Close evidence"
            onClick={onClose}
            className="rounded-lg border border-slate-200 p-2 text-slate-500 hover:bg-slate-50"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <dl className="mt-6 space-y-5">
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">What changed</dt>
            <dd className="mt-1 text-sm text-slate-800">{action.what_changed}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Impact</dt>
            <dd className="mt-1 text-sm text-slate-800">{action.impact ?? "Not quantified from current data."}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Recommended action</dt>
            <dd className="mt-1 text-sm text-slate-800">{action.recommended_action}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Evidence</dt>
            <dd className="mt-2">
              {action.evidence.length ? (
                <ul className="space-y-2">
                  {action.evidence.map((item) => (
                    <li key={item} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                      {item}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-slate-500">No additional evidence attached.</p>
              )}
            </dd>
          </div>
        </dl>
      </div>
    </div>
  );
}
