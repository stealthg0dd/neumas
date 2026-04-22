export function formatCurrency(amount: number, code = "USD"): string {
  const currencyCode = (code || "USD").toUpperCase();
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currencyCode,
  }).format(amount || 0);
}
