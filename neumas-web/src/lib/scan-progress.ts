import type { ScanStatus, ScanStatusResponse } from "@/lib/api/types";

// Statuses that mean the scan pipeline finished successfully (possibly with
// warnings) and polling should stop with the extracted results shown.
const SUCCESS_TERMINAL_STATUSES: readonly ScanStatus[] = [
  "completed",
  "partial_failed",
  "completed_with_partial_analysis",
  "needs_review",
];

// Statuses that mean the scan pipeline failed and polling should stop with
// an error shown to the user.
const FAILURE_TERMINAL_STATUSES: readonly ScanStatus[] = [
  "failed",
  "failed_provider_unavailable",
  "failed_invalid_file",
];

export function isSuccessTerminalScanStatus(status: ScanStatus): boolean {
  return SUCCESS_TERMINAL_STATUSES.includes(status);
}

export function isFailureTerminalScanStatus(status: ScanStatus): boolean {
  return FAILURE_TERMINAL_STATUSES.includes(status);
}

export type ScanPollErrorAction =
  | { type: "stop"; label: string }
  | { type: "log_and_continue"; delayMs: number }
  | { type: "continue"; delayMs: number };

/**
 * Decide what the scan-status poller should do after a failed request.
 *
 * `consecutiveErrors` is the number of 5xx/network failures observed so far
 * *before* this one (i.e. 0 on the first failure).
 */
export function classifyScanPollError(
  status: number | undefined,
  consecutiveErrors: number
): ScanPollErrorAction {
  if (status === 401) {
    return { type: "stop", label: "Session expired. Please refresh and try again." };
  }

  if (status === 404) {
    return { type: "stop", label: "Scan not found. Please try again." };
  }

  if (status !== undefined && status < 500) {
    return { type: "log_and_continue", delayMs: 2000 };
  }

  const nextCount = consecutiveErrors + 1;
  if (nextCount > 5) {
    return { type: "stop", label: "Server error. Please try again later." };
  }

  return { type: "continue", delayMs: nextCount > 2 ? 5000 : 2000 };
}

function getStageStatus(
  stageDetails: Record<string, unknown> | null | undefined,
  stage: string
): string | null {
  const value = stageDetails?.[stage];
  if (!value || typeof value !== "object") return null;

  const status = (value as Record<string, unknown>).status;
  return typeof status === "string" ? status : null;
}

export function getScanPipelineProgress(
  scan: Pick<ScanStatusResponse, "status" | "stage_details"> | null | undefined
): { value: number; label: string } {
  if (!scan) {
    return { value: 35, label: "Receipt uploaded, analysis pending" };
  }

  if (scan.status === "completed") {
    return { value: 100, label: "AI analysis complete" };
  }

  if (scan.status === "partial_failed") {
    return { value: 100, label: "Analysis complete with warnings" };
  }

  if (scan.status === "completed_with_partial_analysis") {
    return { value: 100, label: "AI provider temporarily unavailable; showing extracted basics" };
  }

  if (scan.status === "needs_review") {
    return { value: 100, label: "Needs manual review" };
  }

  if (scan.status === "failed_provider_unavailable" || scan.status === "failed_invalid_file") {
    return { value: 100, label: "Analysis failed; retry" };
  }

  if (scan.status === "failed") {
    return { value: 100, label: "Analysis failed" };
  }

  if (scan.status === "queued") {
    return { value: 35, label: "Receipt uploaded, analysis pending" };
  }

  if (scan.status === "uploaded") {
    return { value: 35, label: "Receipt uploaded, analysis pending" };
  }

  const stageDetails = scan.stage_details;
  const currentStage =
    typeof stageDetails?.current_stage === "string" ? stageDetails.current_stage : null;

  if (currentStage === "ocr" || getStageStatus(stageDetails, "ocr") === "running") {
    return { value: 55, label: "Running OCR extraction" };
  }

  if (
    currentStage === "inventory" ||
    getStageStatus(stageDetails, "inventory") === "running"
  ) {
    return { value: 72, label: "Updating inventory" };
  }

  if (
    currentStage === "baseline" ||
    getStageStatus(stageDetails, "baseline") === "running"
  ) {
    return { value: 86, label: "Recomputing baseline" };
  }

  if (
    currentStage === "predictions" ||
    getStageStatus(stageDetails, "predictions") === "running"
  ) {
    return { value: 96, label: "Refreshing predictions" };
  }

  return { value: 45, label: "Preparing AI analysis" };
}
