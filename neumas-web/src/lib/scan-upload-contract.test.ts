import { describe, expect, it } from "vitest";

import {
  SCAN_UPLOAD_MAX_BYTES,
  isSupportedScanUploadSize,
  isSupportedScanUploadType,
} from "@/lib/scan-upload-contract";

describe("scan upload contract", () => {
  it("accepts supported image mime types", () => {
    const jpg = new File(["x"], "a.jpg", { type: "image/jpeg" });
    const png = new File(["x"], "a.png", { type: "image/png" });
    const webp = new File(["x"], "a.webp", { type: "image/webp" });

    expect(isSupportedScanUploadType(jpg)).toBe(true);
    expect(isSupportedScanUploadType(png)).toBe(true);
    expect(isSupportedScanUploadType(webp)).toBe(true);
  });

  it("rejects unsupported upload mime types", () => {
    const pdf = new File(["x"], "a.pdf", { type: "application/pdf" });
    const txt = new File(["x"], "a.txt", { type: "text/plain" });

    expect(isSupportedScanUploadType(pdf)).toBe(false);
    expect(isSupportedScanUploadType(txt)).toBe(false);
  });

  it("enforces 10MB maximum size", () => {
    const ok = new File([new Uint8Array(SCAN_UPLOAD_MAX_BYTES)], "ok.jpg", { type: "image/jpeg" });
    const tooLarge = new File([new Uint8Array(SCAN_UPLOAD_MAX_BYTES + 1)], "big.jpg", { type: "image/jpeg" });

    expect(isSupportedScanUploadSize(ok)).toBe(true);
    expect(isSupportedScanUploadSize(tooLarge)).toBe(false);
  });
});
