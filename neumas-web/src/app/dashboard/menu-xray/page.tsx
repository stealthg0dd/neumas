"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  FileText,
  Loader2,
  ScanSearch,
  Sparkles,
  Upload,
} from "lucide-react";
import { toast } from "sonner";

import { uploadScan, getScanStatus } from "@/lib/api/endpoints";
import { useAuthStore, selectHasSession } from "@/lib/store/auth";
import { captureUIError } from "@/lib/analytics";
import { getScanPipelineProgress } from "@/lib/scan-progress";
import { cn } from "@/lib/utils";
import { isMenuXRayOnboardingComplete } from "@/app/onboard/menu-xray/page";

// Menu X-Ray accepts images and PDFs
const MENU_XRAY_ACCEPT = "image/jpeg,image/png,image/webp,application/pdf";
const MENU_XRAY_MAX_BYTES = 20 * 1024 * 1024; // 20 MB for menus

type UploadState =
  | { phase: "idle" }
  | { phase: "uploading"; progress: number; label: string }
  | { phase: "processing"; progress: number; label: string; analysisId: string }
  | { phase: "error"; message: string };

function FlowStep({
  number,
  title,
  description,
  active,
}: {
  number: number;
  title: string;
  description: string;
  active?: boolean;
}) {
  return (
    <div className={cn("flex gap-4", active ? "opacity-100" : "opacity-50")}>
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 border-[#0071a3] text-[13px] font-bold text-[#0071a3]">
        {number}
      </div>
      <div>
        <p className="text-[14px] font-semibold text-gray-900">{title}</p>
        <p className="mt-0.5 text-[13px] text-gray-500">{description}</p>
      </div>
    </div>
  );
}

export default function MenuXRayPage() {
  const router = useRouter();
  const hasSession = useAuthStore(selectHasSession);
  const hasHydrated = useAuthStore((s) => s._hasHydrated);

  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [uploadState, setUploadState] = useState<UploadState>({ phase: "idle" });
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Redirect to onboarding if not completed
  useEffect(() => {
    if (!hasHydrated) return;
    if (!hasSession) {
      router.replace("/auth?next=/dashboard/menu-xray");
      return;
    }
    if (!isMenuXRayOnboardingComplete()) {
      router.replace("/onboard/menu-xray");
    }
  }, [hasHydrated, hasSession, router]);

  useEffect(() => () => { if (pollRef.current) clearTimeout(pollRef.current); }, []);

  const validateFile = useCallback((f: File): string | null => {
    const allowed = MENU_XRAY_ACCEPT.split(",");
    if (!allowed.includes(f.type)) {
      return "Please upload a PDF or image file (JPEG, PNG, WebP).";
    }
    if (f.size > MENU_XRAY_MAX_BYTES) {
      return "File too large. Maximum size is 20 MB.";
    }
    return null;
  }, []);

  const onFile = useCallback(
    (f: File) => {
      const err = validateFile(f);
      if (err) {
        toast.error(err);
        return;
      }
      if (pollRef.current) clearTimeout(pollRef.current);
      setFile(f);
      setUploadState({ phase: "idle" });
    },
    [validateFile]
  );

  const startPolling = useCallback((analysisId: string) => {
    const poll = async () => {
      try {
        const status = await getScanStatus(analysisId);
        const next = getScanPipelineProgress(status);
        setUploadState({
          phase: "processing",
          progress: next.value,
          label: next.label,
          analysisId,
        });

        const terminal = [
          "completed", "partial_failed", "completed_with_partial_analysis",
          "needs_review", "failed", "failed_provider_unavailable", "failed_invalid_file",
        ];
        if (terminal.includes(status.status)) {
          if (
            status.status === "completed" ||
            status.status === "partial_failed" ||
            status.status === "completed_with_partial_analysis" ||
            status.status === "needs_review"
          ) {
            // Navigate to results page instead of inline done state
            router.push(`/dashboard/menu-xray/${analysisId}`);
          } else {
            setUploadState({
              phase: "error",
              message: status.error_message ?? "Analysis failed — please retry.",
            });
          }
          return;
        }
        pollRef.current = setTimeout(poll, 2500);
      } catch {
        pollRef.current = setTimeout(poll, 4000);
      }
    };
    pollRef.current = setTimeout(poll, 2000);
  }, [router]);

  async function runAnalysis(f: File) {
    setUploadState({ phase: "uploading", progress: 5, label: "Uploading menu…" });
    try {
      const response = await uploadScan(f, "menu", (progress) => {
        setUploadState({
          phase: "uploading",
          progress: Math.max(5, Math.min(30, Math.round(progress * 0.3))),
          label: "Uploading menu…",
        });
      });
      const analysisId = response.scan_id ?? response.id ?? null;
      if (!analysisId) {
        setUploadState({ phase: "error", message: "Upload failed — please retry." });
        return;
      }
      setUploadState({
        phase: "processing",
        progress: 35,
        label: "Menu uploaded — analysing…",
        analysisId,
      });
      startPolling(analysisId);
    } catch (err) {
      captureUIError("menu_xray_upload", err);
      setUploadState({ phase: "error", message: "Upload failed. Please check your connection and retry." });
    }
  }

  function handleUseSample() {
    router.push("/dashboard/menu-xray/sample");
  }

  function reset() {
    if (pollRef.current) clearTimeout(pollRef.current);
    setFile(null);
    setUploadState({ phase: "idle" });
  }

  const isProcessing =
    uploadState.phase === "uploading" || uploadState.phase === "processing";
  const progress = isProcessing ? uploadState.progress : 0;

  if (!hasHydrated) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <div className="h-10 w-10 animate-pulse rounded-xl bg-gray-200" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-8 pb-12">
      {/* Hero */}
      <div>
        <div className="flex items-center gap-2 text-[11px] font-semibold tracking-widest text-[#0071a3] uppercase mb-3">
          <ScanSearch className="h-4 w-4" />
          Menu X-Ray
        </div>
        <h1 className="text-[clamp(1.75rem,5vw,2.25rem)] font-bold tracking-tight text-gray-900 leading-tight">
          See the economics hiding
          <br className="hidden sm:block" />
          {" "}inside your menu.
        </h1>
        <p className="mt-3 text-[16px] text-gray-500 max-w-xl">
          Upload your menu and Neumas will extract items, flag cost drivers, and surface margin opportunities in seconds.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        {/* Upload card */}
        <div className="lg:col-span-3">
          <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
            {uploadState.phase === "error" ? (
              <div className="space-y-4">
                <div className="rounded-2xl border border-red-100 bg-red-50 p-5 text-center">
                  <p className="text-[15px] font-semibold text-red-800">Upload failed</p>
                  <p className="mt-1 text-[13px] text-red-700">{uploadState.message}</p>
                </div>
                <button
                  type="button"
                  onClick={reset}
                  className="w-full rounded-xl border border-gray-200 py-3 text-[14px] font-medium text-gray-600 hover:bg-gray-50"
                >
                  Try again
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Drop zone */}
                <div
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      document.getElementById("mx-file-input")?.click();
                    }
                  }}
                  onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                  onDragLeave={() => setDragging(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDragging(false);
                    const f = e.dataTransfer.files[0];
                    if (f) onFile(f);
                  }}
                  onClick={() => document.getElementById("mx-file-input")?.click()}
                  className={cn(
                    "flex min-h-[220px] cursor-pointer flex-col items-center justify-center gap-4 rounded-2xl border-2 border-dashed transition-colors",
                    dragging
                      ? "border-[#0071a3] bg-[#f0f7fb]"
                      : file
                      ? "border-[#0071a3]/40 bg-[#f0f7fb]/50"
                      : "border-gray-200 bg-gray-50 hover:border-gray-300 hover:bg-gray-100/50"
                  )}
                >
                  <input
                    id="mx-file-input"
                    type="file"
                    accept={MENU_XRAY_ACCEPT}
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) onFile(f);
                    }}
                  />
                  {file ? (
                    <>
                      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#0071a3]/10">
                        <FileText className="h-7 w-7 text-[#0071a3]" />
                      </div>
                      <div className="text-center">
                        <p className="text-[14px] font-semibold text-gray-800">{file.name}</p>
                        <p className="mt-0.5 text-[12px] text-gray-400">
                          {(file.size / (1024 * 1024)).toFixed(2)} MB · Click to change
                        </p>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gray-100">
                        <Upload className="h-7 w-7 text-gray-400" />
                      </div>
                      <div className="text-center">
                        <p className="text-[15px] font-semibold text-gray-700">
                          Drop your menu here
                        </p>
                        <p className="mt-1 text-[13px] text-gray-400">
                          PDF, JPEG, PNG or WebP · up to 20 MB
                        </p>
                      </div>
                    </>
                  )}
                </div>

                {/* Progress bar */}
                {isProcessing && (
                  <div className="rounded-xl border border-gray-100 bg-white p-4">
                    <div className="mb-2 flex items-center justify-between text-xs text-gray-500">
                      <span>{uploadState.label}</span>
                      <span className="font-mono">{progress}%</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-gray-100">
                      <div
                        className="h-full rounded-full bg-[#0071a3] transition-all duration-500"
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                  </div>
                )}

                {/* Action buttons */}
                <div className="grid gap-3">
                  <button
                    type="button"
                    disabled={!file || isProcessing}
                    onClick={() => file && void runAnalysis(file)}
                    className="flex items-center justify-center gap-2 rounded-xl bg-[#0071a3] py-3.5 text-[14px] font-semibold text-white shadow-sm transition-all hover:bg-[#005f8a] disabled:opacity-50"
                  >
                    {isProcessing ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        {uploadState.phase === "uploading" ? "Uploading…" : "Analysing…"}
                      </>
                    ) : (
                      <>
                        <ScanSearch className="h-4 w-4" />
                        X-Ray this menu
                      </>
                    )}
                  </button>

                  <div className="relative">
                    <div className="absolute inset-0 flex items-center">
                      <div className="w-full border-t border-gray-100" />
                    </div>
                    <div className="relative flex justify-center text-[11px]">
                      <span className="bg-white px-3 text-gray-400">or</span>
                    </div>
                  </div>

                  <button
                    type="button"
                    disabled={isProcessing}
                    onClick={handleUseSample}
                    className="flex items-center justify-center gap-2 rounded-xl border border-amber-200 bg-amber-50 py-3 text-[14px] font-medium text-amber-800 transition-all hover:bg-amber-100 disabled:opacity-50"
                  >
                    <Sparkles className="h-4 w-4 text-amber-500" />
                    Try Sample Menu
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right panel */}
        <div className="lg:col-span-2 space-y-4">
          {/* Flow steps */}
          <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
            <p className="mb-5 text-[11px] font-semibold tracking-widest text-gray-400 uppercase">
              How it works
            </p>
            <div className="space-y-5">
              <FlowStep
                number={1}
                title="Scan"
                description="Upload your menu PDF or photo. We extract every item, category, and price."
                active
              />
              <FlowStep
                number={2}
                title="Understand"
                description="See your menu mapped by cost tier, margin band, and contribution."
                active={uploadState.phase !== "idle" || file !== null}
              />
              <FlowStep
                number={3}
                title="Find Opportunities"
                description="Get AI-ranked recommendations: what to reprice, bundle, or retire."
                active={uploadState.phase === "processing"}
              />
            </div>
          </div>

          {/* What you get */}
          <div className="rounded-2xl border border-blue-50 bg-gradient-to-br from-[#f0f7fb] to-white p-5">
            <p className="mb-3 text-[11px] font-semibold tracking-widest text-[#0071a3] uppercase">
              What you get
            </p>
            <ul className="space-y-2.5 text-[13px] text-gray-600">
              {[
                "Item-level cost and margin breakdown",
                "Price sensitivity flags",
                "Menu engineering quadrant",
                "Top 3 actionable recommendations",
                "Exportable report",
              ].map((item) => (
                <li key={item} className="flex items-start gap-2">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#0071a3]" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
