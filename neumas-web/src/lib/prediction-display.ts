import type { Prediction, UrgencyLevel } from "@/lib/api/types";

const URGENCY_RANK: Record<UrgencyLevel, number> = {
  critical: 0,
  urgent: 1,
  soon: 2,
  later: 3,
};

export function daysUntilStockout(predictionDateIso: string): number {
  const ms = new Date(predictionDateIso).getTime() - Date.now();
  return Math.max(0, Math.ceil(ms / 86_400_000));
}

/** API may return 0–1 or 0–100 */
export function confidenceToPercent(confidence: number): number {
  if (confidence <= 1 && confidence >= 0) return Math.round(confidence * 100);
  return Math.round(confidence);
}

export function sortPredictionsByUrgencyThenDays(predictions: Prediction[]): Prediction[] {
  return [...predictions].sort((a, b) => {
    const ua = a.stockout_risk_level ?? "later";
    const ub = b.stockout_risk_level ?? "later";
    const r = URGENCY_RANK[ua] - URGENCY_RANK[ub];
    if (r !== 0) return r;
    return daysUntilStockout(a.prediction_date) - daysUntilStockout(b.prediction_date);
  });
}

export function getFeatures(p: Prediction) {
  const raw = p.features_used;
  if (!raw || typeof raw !== "object") return null;
  return raw as {
    sample_size?: number;
    days_remaining?: number;
    avg_daily_consumption?: number;
    inventory_recency_days?: number | null;
    pattern_confidence?: number;
    reason?: string;
  };
}
