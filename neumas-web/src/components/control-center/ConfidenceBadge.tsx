export function ConfidenceBadge({ value }: { value: number | null | undefined }) {
  if (value === null || value === undefined) {
    return <span className="text-xs font-medium text-slate-400">Confidence N/A</span>;
  }
  const pct = value <= 1 ? Math.round(value * 100) : Math.round(value);
  const tone = pct >= 80 ? "text-emerald-700 bg-emerald-50 border-emerald-200" : pct >= 60 ? "text-amber-700 bg-amber-50 border-amber-200" : "text-rose-700 bg-rose-50 border-rose-200";
  return <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold ${tone}`}>{pct}% confidence</span>;
}
