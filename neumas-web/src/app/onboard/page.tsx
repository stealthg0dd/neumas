"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Upload } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { getScanStatus, postScanUpload } from "@/lib/api/endpoints";
import { setOnboardingComplete } from "@/lib/onboarding";
import { useAuthStore, selectIsAuthenticated } from "@/lib/store/auth";
import { captureUIError } from "@/lib/analytics";
import { cn } from "@/lib/utils";

const STEPS = 3;

export default function OnboardPage() {
  const router = useRouter();
  const isAuth = useAuthStore(selectIsAuthenticated);
  const hasHydrated = useAuthStore((s) => s._hasHydrated);

  const [step, setStep] = useState(1);
  const [household, setHousehold] = useState<1 | 2 | 3 | 4 | 5>(1);
  const [frequency, setFrequency] = useState<"Daily" | "Weekly" | "Bi-weekly">("Weekly");

  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [scanDone, setScanDone] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [pushOn, setPushOn] = useState(true);
  const [emailOn, setEmailOn] = useState(true);

  useEffect(() => {
    if (hasHydrated && !isAuth) {
      router.replace("/auth");
    }
  }, [hasHydrated, isAuth, router]);

  const resetFile = useCallback(() => {
    setFile(null);
    if (preview) URL.revokeObjectURL(preview);
    setPreview(null);
    setScanDone(false);
  }, [preview]);

  const onFile = useCallback(
    (f: File) => {
      if (!f.type.startsWith("image/")) {
        toast.error("Please upload an image (JPEG, PNG, WebP).");
        return;
      }
      if (f.size > 10 * 1024 * 1024) {
        toast.error("Image must be under 10 MB.");
        return;
      }
      resetFile();
      setFile(f);
      setPreview(URL.createObjectURL(f));
    },
    [resetFile]
  );

  const runScan = async () => {
    if (!file) return;
    setBusy(true);
    setScanDone(false);
    try {
      const res = await postScanUpload(file, "receipt");
      const sid = res.scan_id ?? res.id ?? null;
      if (!sid) {
        toast.error("Could not start scan.");
        setBusy(false);
        return;
      }
      toast.success("Scan queued — analyzing…");
      pollRef.current = setInterval(async () => {
        try {
          const s = await getScanStatus(sid);
          if (s.status === "completed" || s.status === "failed") {
            if (pollRef.current) {
              clearInterval(pollRef.current);
              pollRef.current = null;
            }
            setBusy(false);
            if (s.status === "completed") {
              setScanDone(true);
              toast.success("Scan complete.");
            } else {
              toast.error(s.error_message ?? "Scan failed.");
            }
          }
        } catch {
          /* keep polling */
        }
      }, 2000);
    } catch (err) {
      captureUIError("onboard_scan", err);
      setBusy(false);
    }
  };

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  function finishOnboarding() {
    setOnboardingComplete();
    router.replace("/dashboard");
  }

  if (!hasHydrated) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white">
        <div className="h-10 w-10 animate-pulse rounded-xl bg-gray-200" />
      </div>
    );
  }

  if (!isAuth) {
    return null;
  }

  return (
    <div className="min-h-screen bg-[#fafafa] px-4 py-12 sm:px-6">
      <div className="mx-auto max-w-lg">
        <div className="mb-10 flex justify-center gap-2">
          {Array.from({ length: STEPS }, (_, i) => (
            <span
              key={i}
              className={cn(
                "h-2.5 w-2.5 rounded-full transition-colors",
                i + 1 <= step ? "bg-blue-600" : "bg-gray-300"
              )}
              aria-hidden
            />
          ))}
        </div>

        {step === 1 && (
          <div className="rounded-2xl border border-gray-200 bg-white p-8 shadow-sm">
            <h1 className="text-2xl font-bold text-gray-900">Welcome to Neumas! Let&apos;s set up your household.</h1>
            <p className="mt-6 text-sm font-medium text-gray-700">Household size</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {([1, 2, 3, 4, 5] as const).map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setHousehold(n)}
                  className={cn(
                    "rounded-full px-4 py-2 text-sm font-medium transition-colors",
                    household === n
                      ? "bg-blue-600 text-white"
                      : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                  )}
                >
                  {n === 5 ? "5+" : n}
                </button>
              ))}
            </div>
            <p className="mt-6 text-sm font-medium text-gray-700">Grocery frequency</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {(["Daily", "Weekly", "Bi-weekly"] as const).map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setFrequency(f)}
                  className={cn(
                    "rounded-full px-4 py-2 text-sm font-medium transition-colors",
                    frequency === f
                      ? "bg-blue-600 text-white"
                      : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                  )}
                >
                  {f}
                </button>
              ))}
            </div>
            <Button className="mt-8 w-full bg-blue-600 py-6 text-base hover:bg-blue-700" onClick={() => setStep(2)}>
              Continue →
            </Button>
          </div>
        )}

        {step === 2 && (
          <div className="rounded-2xl border border-gray-200 bg-white p-8 shadow-sm">
            <h1 className="text-2xl font-bold text-gray-900">Scan your first receipt or pantry item</h1>
            <p className="mt-2 text-sm text-gray-600">
              Upload a clear photo of a receipt or your pantry — same upload flow as your dashboard scan screen.
            </p>
            <div
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") (e.target as HTMLElement).click();
              }}
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragging(false);
                const f = e.dataTransfer.files[0];
                if (f) onFile(f);
              }}
              className={cn(
                "relative mt-6 flex min-h-[240px] cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed transition-colors",
                dragging ? "border-blue-500 bg-blue-50/50" : "border-gray-200 bg-gray-50/50 hover:bg-gray-50"
              )}
              onClick={() => document.getElementById("onboard-scan-file")?.click()}
            >
              <input
                id="onboard-scan-file"
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) onFile(f);
                }}
              />
              {preview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={preview}
                  alt="Preview"
                  className="absolute inset-3 h-[calc(100%-24px)] w-[calc(100%-24px)] rounded-xl object-cover"
                />
              ) : (
                <>
                  <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-100">
                    <Upload className="h-7 w-7 text-blue-600" />
                  </div>
                  <p className="text-sm font-medium text-gray-900">Drop an image or click to browse</p>
                  <p className="mt-1 text-xs text-gray-500">JPEG, PNG, WebP · max 10 MB</p>
                </>
              )}
            </div>
            <div className="mt-4 flex flex-col gap-3 sm:flex-row">
              <Button
                className="flex-1 bg-blue-600 hover:bg-blue-700"
                disabled={!file || busy}
                onClick={runScan}
              >
                {busy ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Analyzing…
                  </>
                ) : (
                  "Analyze"
                )}
              </Button>
              <Button variant="outline" type="button" onClick={resetFile} disabled={busy}>
                Reset
              </Button>
            </div>
            {scanDone && (
              <Button className="mt-4 w-full bg-blue-600 hover:bg-blue-700" onClick={() => setStep(3)}>
                Continue →
              </Button>
            )}
            <button
              type="button"
              onClick={() => setStep(3)}
              className="mt-6 w-full text-center text-sm text-gray-400 transition-colors hover:text-gray-600"
            >
              Skip for now
            </button>
          </div>
        )}

        {step === 3 && (
          <div className="rounded-2xl border border-gray-200 bg-white p-8 shadow-sm">
            <h1 className="text-2xl font-bold text-gray-900">Get alerts before you run out</h1>
            <div className="mt-8 space-y-4">
              <label className="flex items-center justify-between gap-4 rounded-xl border border-gray-100 px-4 py-3">
                <span className="text-sm font-medium text-gray-800">Push notifications</span>
                <input
                  type="checkbox"
                  className="h-5 w-5 accent-blue-600"
                  checked={pushOn}
                  onChange={(e) => setPushOn(e.target.checked)}
                />
              </label>
              <label className="flex items-center justify-between gap-4 rounded-xl border border-gray-100 px-4 py-3">
                <span className="text-sm font-medium text-gray-800">Email alerts</span>
                <input
                  type="checkbox"
                  className="h-5 w-5 accent-blue-600"
                  checked={emailOn}
                  onChange={(e) => setEmailOn(e.target.checked)}
                />
              </label>
            </div>
            <Button className="mt-10 w-full bg-blue-600 py-6 text-base hover:bg-blue-700" onClick={finishOnboarding}>
              Take me to my dashboard
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
