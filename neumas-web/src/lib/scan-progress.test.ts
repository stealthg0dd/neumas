import { describe, expect, it } from "vitest";

import {
  classifyScanPollError,
  getScanPipelineProgress,
  isFailureTerminalScanStatus,
  isSuccessTerminalScanStatus,
} from "@/lib/scan-progress";

describe("getScanPipelineProgress status contract", () => {
  it("maps uploaded state to the required pending message", () => {
    const result = getScanPipelineProgress({
      status: "uploaded",
      stage_details: null,
    });

    expect(result.label).toBe("Receipt uploaded, analysis pending");
  });

  it("maps partial analysis completion to the required fallback message", () => {
    const result = getScanPipelineProgress({
      status: "completed_with_partial_analysis",
      stage_details: null,
    });

    expect(result.label).toBe("AI provider temporarily unavailable; showing extracted basics");
  });

  it("maps provider/file failures to the required retry message", () => {
    const providerFailure = getScanPipelineProgress({
      status: "failed_provider_unavailable",
      stage_details: null,
    });
    const fileFailure = getScanPipelineProgress({
      status: "failed_invalid_file",
      stage_details: null,
    });

    expect(providerFailure.label).toBe("Analysis failed; retry");
    expect(fileFailure.label).toBe("Analysis failed; retry");
  });
});

describe("scan poll terminal status detection", () => {
  it("treats completed, partial and needs_review as success-terminal", () => {
    expect(isSuccessTerminalScanStatus("completed")).toBe(true);
    expect(isSuccessTerminalScanStatus("partial_failed")).toBe(true);
    expect(isSuccessTerminalScanStatus("completed_with_partial_analysis")).toBe(true);
    expect(isSuccessTerminalScanStatus("needs_review")).toBe(true);
  });

  it("does not treat in-progress statuses as terminal", () => {
    expect(isSuccessTerminalScanStatus("uploaded")).toBe(false);
    expect(isSuccessTerminalScanStatus("queued")).toBe(false);
    expect(isSuccessTerminalScanStatus("processing")).toBe(false);
    expect(isFailureTerminalScanStatus("processing")).toBe(false);
  });

  it("treats failed statuses as failure-terminal", () => {
    expect(isFailureTerminalScanStatus("failed")).toBe(true);
    expect(isFailureTerminalScanStatus("failed_provider_unavailable")).toBe(true);
    expect(isFailureTerminalScanStatus("failed_invalid_file")).toBe(true);
  });
});

describe("classifyScanPollError", () => {
  it("stops polling and shows a session-expired message on 401", () => {
    const action = classifyScanPollError(401, 0);

    expect(action).toEqual({
      type: "stop",
      label: "Session expired. Please refresh and try again.",
    });
  });

  it("stops polling and shows a not-found message on 404", () => {
    const action = classifyScanPollError(404, 0);

    expect(action).toEqual({ type: "stop", label: "Scan not found. Please try again." });
  });

  it("logs and keeps polling on an unexpected 4xx", () => {
    const action = classifyScanPollError(400, 0);

    expect(action).toEqual({ type: "log_and_continue", delayMs: 2000 });
  });

  it("backs off to 5s after 3 consecutive 5xx errors", () => {
    expect(classifyScanPollError(500, 0)).toEqual({ type: "continue", delayMs: 2000 });
    expect(classifyScanPollError(500, 1)).toEqual({ type: "continue", delayMs: 2000 });
    expect(classifyScanPollError(500, 2)).toEqual({ type: "continue", delayMs: 5000 });
  });

  it("backs off the same way on network errors (no response)", () => {
    expect(classifyScanPollError(undefined, 2)).toEqual({ type: "continue", delayMs: 5000 });
  });

  it("stops polling after 5 consecutive 5xx/network errors", () => {
    const action = classifyScanPollError(503, 5);

    expect(action).toEqual({ type: "stop", label: "Server error. Please try again later." });
  });
});
