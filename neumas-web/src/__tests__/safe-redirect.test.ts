import { describe, expect, it } from "vitest";

import { resolveSafeNextPath } from "@/lib/safe-redirect";

describe("resolveSafeNextPath", () => {
  it("accepts a same-origin absolute path", () => {
    expect(resolveSafeNextPath("/dashboard/inventory")).toBe("/dashboard/inventory");
  });

  it("falls back to /dashboard when next is missing", () => {
    expect(resolveSafeNextPath(null)).toBe("/dashboard");
    expect(resolveSafeNextPath(undefined)).toBe("/dashboard");
    expect(resolveSafeNextPath("")).toBe("/dashboard");
  });

  it("respects a custom fallback", () => {
    expect(resolveSafeNextPath(null, "/onboard")).toBe("/onboard");
  });

  it("rejects an absolute external URL", () => {
    expect(resolveSafeNextPath("https://evil.example.com/phish")).toBe("/dashboard");
    expect(resolveSafeNextPath("http://evil.example.com")).toBe("/dashboard");
  });

  it("rejects a protocol-relative URL (open redirect via //)", () => {
    expect(resolveSafeNextPath("//evil.example.com")).toBe("/dashboard");
    expect(resolveSafeNextPath("//evil.example.com/dashboard")).toBe("/dashboard");
  });

  it("rejects a backslash-based bypass of the // check", () => {
    expect(resolveSafeNextPath("/\\evil.example.com")).toBe("/dashboard");
    expect(resolveSafeNextPath("\\\\evil.example.com")).toBe("/dashboard");
  });

  it("rejects any value containing a scheme separator, even nested in a query string", () => {
    // Deliberately conservative: rejecting a same-origin path that merely contains "://" in a
    // query value is an acceptable false positive for an open-redirect guard — the alternative
    // (parsing/allow-listing query values) is far more error-prone to get right.
    expect(resolveSafeNextPath("javascript:alert(1)")).toBe("/dashboard");
    expect(resolveSafeNextPath("/redirect://evil.example.com")).toBe("/dashboard");
    expect(resolveSafeNextPath("/redirect?to=http://evil.example.com")).toBe("/dashboard");
  });

  it("rejects a value that does not start with a single leading slash", () => {
    expect(resolveSafeNextPath("dashboard")).toBe("/dashboard");
    expect(resolveSafeNextPath("evil.example.com/dashboard")).toBe("/dashboard");
  });
});
