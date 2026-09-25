import type { ControlCenterPriority } from "@/lib/api/types";

const priorityTone: Record<ControlCenterPriority, string> = {
  P0: "border-rose-200 bg-rose-50 text-rose-700",
  P1: "border-amber-200 bg-amber-50 text-amber-700",
  P2: "border-slate-200 bg-slate-50 text-slate-600",
};

export function RiskBadge({ priority }: { priority: ControlCenterPriority }) {
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold ${priorityTone[priority]}`}>
      {priority}
    </span>
  );
}
