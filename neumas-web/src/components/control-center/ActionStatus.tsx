export function ActionStatus({
  status,
  approvalRequired,
}: {
  status: string;
  approvalRequired?: boolean;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-2 py-0.5 text-xs font-medium text-slate-600">
      <span className={`h-1.5 w-1.5 rounded-full ${approvalRequired ? "bg-amber-500" : "bg-emerald-500"}`} />
      {approvalRequired ? "Approval required" : status.replace(/_/g, " ")}
    </span>
  );
}
