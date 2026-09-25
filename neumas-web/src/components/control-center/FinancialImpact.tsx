export function FinancialImpact({ value }: { value: string | null | undefined }) {
  return (
    <span className="inline-flex rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-xs font-semibold text-sky-700">
      {value ?? "Impact not yet quantified"}
    </span>
  );
}
