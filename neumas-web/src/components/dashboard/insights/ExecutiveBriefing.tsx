"use client";

import { useEffect, useState } from "react";
import { MessageSquareQuote } from "lucide-react";

import { getExecutiveBriefing } from "@/lib/api/endpoints";
import type { ExecutiveBriefingResponse } from "@/lib/api/types";

export function ExecutiveBriefing() {
  const [briefing, setBriefing] = useState<ExecutiveBriefingResponse | null>(null);

  useEffect(() => {
    void getExecutiveBriefing()
      .then(setBriefing)
      .catch(() => setBriefing(null));
  }, []);

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4">
      <div className="flex items-center gap-2">
        <MessageSquareQuote className="h-4 w-4 text-sky-700" />
        <div>
          <h3 className="text-sm font-semibold text-gray-900">Executive Briefing</h3>
          <p className="text-xs text-gray-500">Audit-log summary from the last 7 days.</p>
        </div>
      </div>

      <div className="mt-4 space-y-3">
        {(briefing?.bullets ?? [
          "Recent operating activity will appear here once audit logs accumulate.",
          "New scans, reorders, and exports are summarized into a short operator brief.",
          "Run a fresh workflow to seed the first executive view.",
        ]).map((bullet) => (
          <div key={bullet} className="rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-700">
            {bullet}
          </div>
        ))}
      </div>
    </div>
  );
}
