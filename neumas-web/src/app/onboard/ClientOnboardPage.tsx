"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowRight,
  CheckCircle2,
  Loader2,
  MapPin,
  PlugZap,
  ScanLine,
  Upload,
  X,
} from "lucide-react";
import { toast } from "sonner";

import {
  getScanStatus,
  googleComplete,
  postScanUpload,
  updateOnboardingState,
} from "@/lib/api/endpoints";
import type {
  BusinessType,
  LoginResponse,
  OnboardingOutletInput,
  OnboardingStateResponse,
} from "@/lib/api/types";
import { saveSession, setAccessToken } from "@/lib/auth-session";
import { setOnboardingComplete, fetchCanonicalOnboardingState } from "@/lib/onboarding";
import { useAuthStore, selectHasSession } from "@/lib/store/auth";
import { captureUIError } from "@/lib/analytics";
import { getScanPipelineProgress } from "@/lib/scan-progress";
import {
  SCAN_UPLOAD_ACCEPT_ATTR,
  SCAN_UPLOAD_SIZE_ERROR,
  SCAN_UPLOAD_TYPE_ERROR,
  isSupportedScanUploadSize,
  isSupportedScanUploadType,
} from "@/lib/scan-upload-contract";
import { cn } from "@/lib/utils";

const TOTAL_STEPS = 5;

const BUSINESS_TYPES: BusinessType[] = [
  "Restaurant",
  "Cafe / Bakery",
  "Cloud Kitchen",
  "Catering",
  "Hotel / Hospitality",
  "Food Manufacture",
  "Bar / Pub",
  "Other",
];

const CURRENCIES = ["USD", "SGD", "EUR", "GBP", "AUD", "INR", "MYR", "IDR"];
const PROPERTY_TYPES = [...BUSINESS_TYPES];

type DataStartChoice = "invoice" | "shelf";

type BusinessForm = {
  orgName: string;
  businessType: BusinessType;
  country: string;
  currency: string;
  outletCount: number;
};

type OutletDraft = {
  onboarding_key: string;
  name: string;
  property_type: string;
  address: string;
  is_primary: boolean;
};

function createOutletDraft(overrides?: Partial<OutletDraft>): OutletDraft {
  return {
    onboarding_key: crypto.randomUUID(),
    name: "",
    property_type: "Restaurant",
    address: "",
    is_primary: false,
    ...overrides,
  };
}

function StepFrame({
  step,
  title,
  subtitle,
  children,
}: {
  step: number;
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-6">
      <p className="font-mono text-[11px] font-medium tracking-widest text-gray-400 uppercase">
        Step {step} of {TOTAL_STEPS}
      </p>
      <div>
        <h1 className="text-[26px] font-bold tracking-tight text-gray-900">{title}</h1>
        <p className="mt-2 text-[15px] text-gray-500">{subtitle}</p>
      </div>
      {children}
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="text-[13px] font-semibold text-gray-700">{label}</span>
      {children}
    </label>
  );
}

function StepBusiness({
  value,
  onChange,
  onNext,
}: {
  value: BusinessForm;
  onChange: (next: BusinessForm) => void;
  onNext: () => void;
}) {
  const valid =
    value.orgName.trim().length >= 2 &&
    value.country.trim().length >= 2 &&
    value.currency.trim().length >= 3 &&
    value.outletCount >= 1;

  return (
    <StepFrame
      step={1}
      title="Set up your F&B business"
      subtitle="This creates the durable business profile that the rest of onboarding and the dashboard will use."
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Field label="Organization name">
            <input
              type="text"
              autoFocus
              autoComplete="organization"
              value={value.orgName}
              onChange={(e) => onChange({ ...value, orgName: e.target.value })}
              placeholder="e.g. Greenleaf Hospitality Group"
              className="w-full rounded-xl border border-gray-200 px-4 py-3 text-[14px] text-gray-900 outline-none placeholder:text-gray-300 focus:border-[#0071a3] focus:ring-2 focus:ring-[#0071a3]/20"
            />
          </Field>
        </div>
        <Field label="Business type">
          <select
            value={value.businessType}
            onChange={(e) => onChange({ ...value, businessType: e.target.value as BusinessType })}
            className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-[14px] text-gray-900 outline-none focus:border-[#0071a3] focus:ring-2 focus:ring-[#0071a3]/20"
          >
            {BUSINESS_TYPES.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Country">
          <input
            type="text"
            value={value.country}
            onChange={(e) => onChange({ ...value, country: e.target.value })}
            placeholder="Singapore"
            className="w-full rounded-xl border border-gray-200 px-4 py-3 text-[14px] text-gray-900 outline-none placeholder:text-gray-300 focus:border-[#0071a3] focus:ring-2 focus:ring-[#0071a3]/20"
          />
        </Field>
        <Field label="Currency">
          <select
            value={value.currency}
            onChange={(e) => onChange({ ...value, currency: e.target.value })}
            className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-[14px] text-gray-900 outline-none focus:border-[#0071a3] focus:ring-2 focus:ring-[#0071a3]/20"
          >
            {CURRENCIES.map((currency) => (
              <option key={currency} value={currency}>
                {currency}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Number of outlets">
          <input
            type="number"
            min={1}
            max={500}
            value={value.outletCount}
            onChange={(e) =>
              onChange({
                ...value,
                outletCount: Math.max(1, Number(e.target.value || 1)),
              })
            }
            className="w-full rounded-xl border border-gray-200 px-4 py-3 text-[14px] text-gray-900 outline-none focus:border-[#0071a3] focus:ring-2 focus:ring-[#0071a3]/20"
          />
        </Field>
      </div>

      <button
        type="button"
        onClick={onNext}
        disabled={!valid}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#0071a3] py-3.5 text-[14px] font-semibold text-white shadow-sm transition-all hover:bg-[#005f8a] disabled:opacity-50"
      >
        Continue to outlets
        <ArrowRight className="h-4 w-4" />
      </button>
    </StepFrame>
  );
}

function StepOutlets({
  outlets,
  targetCount,
  onChange,
  onBack,
  onNext,
}: {
  outlets: OutletDraft[];
  targetCount: number;
  onChange: (next: OutletDraft[]) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  const valid =
    outlets.length > 0 &&
    outlets.every((outlet) => outlet.name.trim().length >= 2 && outlet.property_type.trim().length >= 2) &&
    outlets.some((outlet) => outlet.is_primary);

  function addOutlet() {
    onChange([...outlets, createOutletDraft()]);
  }

  function removeOutlet(key: string) {
    const next = outlets.filter((outlet) => outlet.onboarding_key !== key);
    if (next.length > 0 && !next.some((outlet) => outlet.is_primary)) {
      next[0] = { ...next[0], is_primary: true };
    }
    onChange(next);
  }

  function updateOutlet(key: string, patch: Partial<OutletDraft>) {
    const next = outlets.map((outlet) =>
      outlet.onboarding_key === key ? { ...outlet, ...patch } : outlet
    );
    onChange(next);
  }

  function makePrimary(key: string) {
    onChange(
      outlets.map((outlet) => ({
        ...outlet,
        is_primary: outlet.onboarding_key === key,
      }))
    );
  }

  return (
    <StepFrame
      step={2}
      title="Add your outlets"
      subtitle={`Persist one or more real outlet records. Target from Step 1: ${targetCount} outlet${targetCount === 1 ? "" : "s"}.`}
    >
      <div className="space-y-3">
        {outlets.map((outlet, index) => (
          <div key={outlet.onboarding_key} className="rounded-2xl border border-gray-200 bg-white p-4">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-[13px] font-semibold text-gray-800">Outlet {index + 1}</p>
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2 text-[12px] text-gray-500">
                  <input
                    type="radio"
                    checked={outlet.is_primary}
                    onChange={() => makePrimary(outlet.onboarding_key)}
                  />
                  Primary
                </label>
                {outlets.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeOutlet(outlet.onboarding_key)}
                    className="rounded-lg p-1 text-gray-300 hover:text-gray-500"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <Field label="Outlet name">
                <input
                  type="text"
                  value={outlet.name}
                  onChange={(e) => updateOutlet(outlet.onboarding_key, { name: e.target.value })}
                  placeholder="Main Kitchen"
                  className="w-full rounded-xl border border-gray-200 px-4 py-3 text-[14px] text-gray-900 outline-none focus:border-[#0071a3] focus:ring-2 focus:ring-[#0071a3]/20"
                />
              </Field>
              <Field label="Property type">
                <select
                  value={outlet.property_type}
                  onChange={(e) =>
                    updateOutlet(outlet.onboarding_key, { property_type: e.target.value })
                  }
                  className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-[14px] text-gray-900 outline-none focus:border-[#0071a3] focus:ring-2 focus:ring-[#0071a3]/20"
                >
                  {PROPERTY_TYPES.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </Field>
              <div className="md:col-span-2">
                <Field label="Address (optional)">
                  <input
                    type="text"
                    value={outlet.address}
                    onChange={(e) => updateOutlet(outlet.onboarding_key, { address: e.target.value })}
                    placeholder="123 Market Street"
                    className="w-full rounded-xl border border-gray-200 px-4 py-3 text-[14px] text-gray-900 outline-none focus:border-[#0071a3] focus:ring-2 focus:ring-[#0071a3]/20"
                  />
                </Field>
              </div>
            </div>
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={addOutlet}
        className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-gray-300 py-3 text-[13px] font-medium text-gray-500 transition-colors hover:border-gray-400 hover:text-gray-700"
      >
        <MapPin className="h-4 w-4" />
        Add another outlet
      </button>

      <div className="flex gap-3">
        <button
          type="button"
          onClick={onBack}
          className="flex-1 rounded-xl border border-gray-200 py-3 text-[14px] font-medium text-gray-600 transition-colors hover:bg-gray-50"
        >
          Back
        </button>
        <button
          type="button"
          onClick={onNext}
          disabled={!valid}
          className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-[#0071a3] py-3 text-[14px] font-semibold text-white transition-all hover:bg-[#005f8a] disabled:opacity-50"
        >
          Continue
          <ArrowRight className="h-4 w-4" />
        </button>
      </div>
    </StepFrame>
  );
}

function StepDataStart({
  choice,
  onChoose,
  onBack,
  onNext,
}: {
  choice: DataStartChoice;
  onChoose: (choice: DataStartChoice) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  return (
    <StepFrame
      step={3}
      title="Choose how to start your data"
      subtitle="Use the existing Neumas upload and scan pipeline. Source connections are only shown as coming soon."
    >
      <div className="grid gap-4 md:grid-cols-3">
        {[
          {
            id: "invoice" as const,
            title: "Upload invoice / delivery note",
            description: "Best for line-item extraction, document review, canonicalization and inventory posting.",
            icon: Upload,
            enabled: true,
          },
          {
            id: "shelf" as const,
            title: "Scan shelf / stock",
            description: "Use the current scan flow to capture shelf or stock evidence from the same upload path.",
            icon: ScanLine,
            enabled: true,
          },
          {
            id: "connect" as const,
            title: "Connect source",
            description: "Coming soon. We do not pretend live POS or source connectivity exists yet.",
            icon: PlugZap,
            enabled: false,
          },
        ].map((option) => {
          const Icon = option.icon;
          const selected = choice === option.id;
          return (
            <button
              key={option.id}
              type="button"
              disabled={!option.enabled}
              onClick={() => {
                if (option.enabled && option.id !== "connect") {
                  onChoose(option.id);
                }
              }}
              className={cn(
                "rounded-2xl border p-5 text-left transition-all",
                option.enabled ? "bg-white hover:border-[#0071a3]" : "cursor-not-allowed bg-gray-50 opacity-70",
                selected ? "border-[#0071a3] ring-2 ring-[#0071a3]/15" : "border-gray-200"
              )}
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#0071a3]/10 text-[#0071a3]">
                <Icon className="h-5 w-5" />
              </div>
              <p className="mt-4 text-[15px] font-semibold text-gray-900">{option.title}</p>
              <p className="mt-2 text-[13px] leading-6 text-gray-500">{option.description}</p>
            </button>
          );
        })}
      </div>

      <div className="flex gap-3">
        <button
          type="button"
          onClick={onBack}
          className="flex-1 rounded-xl border border-gray-200 py-3 text-[14px] font-medium text-gray-600 transition-colors hover:bg-gray-50"
        >
          Back
        </button>
        <button
          type="button"
          onClick={onNext}
          className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-[#0071a3] py-3 text-[14px] font-semibold text-white transition-all hover:bg-[#005f8a]"
        >
          Continue
          <ArrowRight className="h-4 w-4" />
        </button>
      </div>
    </StepFrame>
  );
}

function StepUpload({
  choice,
  onBack,
  onComplete,
  onSkip,
}: {
  choice: DataStartChoice;
  onBack: () => void;
  onComplete: () => void;
  onSkip: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [activeScanId, setActiveScanId] = useState<string | null>(null);
  const [pollTimedOut, setPollTimedOut] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [progressLabel, setProgressLabel] = useState("Uploading evidence");
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollStartedAtRef = useRef<number | null>(null);

  const uploadLabel =
    choice === "shelf" ? "Upload shelf or stock evidence" : "Upload invoice or delivery note";
  const uploadDescription =
    choice === "shelf"
      ? "This still uses the current Neumas upload pipeline and worker flow."
      : "This uses the current Neumas document pipeline with review, canonicalization and ledger posting.";
  const scanType = choice === "shelf" ? "full" : "receipt";

  const resetFile = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    pollStartedAtRef.current = null;
    setFile(null);
    if (preview) URL.revokeObjectURL(preview);
    setPreview(null);
    setDone(false);
    setActiveScanId(null);
    setPollTimedOut(false);
    setBusy(false);
    setUploadProgress(0);
    setProgressLabel("Uploading evidence");
  }, [preview]);

  const onFileSelected = useCallback(
    (selected: File) => {
      if (!isSupportedScanUploadType(selected)) {
        toast.error(SCAN_UPLOAD_TYPE_ERROR);
        return;
      }
      if (!isSupportedScanUploadSize(selected)) {
        toast.error(SCAN_UPLOAD_SIZE_ERROR);
        return;
      }
      resetFile();
      setFile(selected);
      if (selected.type.startsWith("image/")) {
        setPreview(URL.createObjectURL(selected));
      }
    },
    [resetFile]
  );

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    pollStartedAtRef.current = null;
  }, []);

  const checkScanStatus = useCallback(
    async (scanId: string) => {
      const status = await getScanStatus(scanId);
      const nextProgress = getScanPipelineProgress(status);
      setUploadProgress(nextProgress.value);
      setProgressLabel(nextProgress.label);

      if (
        status.status === "completed" ||
        status.status === "partial_failed" ||
        status.status === "completed_with_partial_analysis" ||
        status.status === "needs_review" ||
        status.status === "failed" ||
        status.status === "failed_provider_unavailable" ||
        status.status === "failed_invalid_file"
      ) {
        stopPolling();
        setBusy(false);
        if (
          status.status === "completed" ||
          status.status === "partial_failed" ||
          status.status === "completed_with_partial_analysis" ||
          status.status === "needs_review"
        ) {
          setDone(true);
          setPollTimedOut(false);
          setUploadProgress(100);
          toast.success(
            choice === "shelf"
              ? "Evidence uploaded — continue to activation."
              : `Document queued — ${status.items_detected ?? 0} items extracted so far.`
          );
        } else {
          toast.error(status.error_message || "Analysis failed; retry.");
        }
        return true;
      }
      return false;
    },
    [choice, stopPolling]
  );

  const startPolling = useCallback(
    (scanId: string) => {
      stopPolling();
      pollStartedAtRef.current = Date.now();
      pollRef.current = setInterval(async () => {
        try {
          const completed = await checkScanStatus(scanId);
          if (completed) return;
          const startedAt = pollStartedAtRef.current;
          if (startedAt && Date.now() - startedAt > 30_000) {
            stopPolling();
            setBusy(false);
            setPollTimedOut(true);
            toast.message("Still processing. Tap Refresh Status to check again.");
          }
        } catch {
          // Ignore transient polling failures.
        }
      }, 2000);
    },
    [checkScanStatus, stopPolling]
  );

  async function runScan() {
    if (!file) return;
    setBusy(true);
    setPollTimedOut(false);
    setUploadProgress(5);
    setProgressLabel("Uploading evidence");
    try {
      const response = await postScanUpload(file, scanType, (progress) => {
        setUploadProgress(Math.max(5, Math.min(30, Math.round(progress * 0.3))));
      });
      const scanId = response.scan_id ?? response.id ?? null;
      if (!scanId) {
        toast.error("Could not start scan.");
        setBusy(false);
        return;
      }
      setActiveScanId(scanId);
      setUploadProgress(35);
      setProgressLabel("Evidence uploaded, worker queued");
      startPolling(scanId);
    } catch (err) {
      captureUIError("fnb_onboard_upload", err);
      toast.error("Failed to upload evidence.");
      setBusy(false);
      setUploadProgress(0);
    }
  }

  async function refreshScanStatus() {
    if (!activeScanId) return;
    setBusy(true);
    setPollTimedOut(false);
    try {
      const completed = await checkScanStatus(activeScanId);
      if (!completed) {
        setBusy(false);
        setPollTimedOut(true);
      }
    } catch {
      setBusy(false);
      setPollTimedOut(true);
      toast.error("Could not refresh scan status.");
    }
  }

  useEffect(() => () => stopPolling(), [stopPolling]);

  return (
    <StepFrame
      step={4}
      title={uploadLabel}
      subtitle={uploadDescription}
    >
      {done ? (
        <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-6 text-center">
          <CheckCircle2 className="mx-auto mb-3 h-10 w-10 text-emerald-500" />
          <p className="text-[16px] font-semibold text-emerald-800">
            First evidence captured
          </p>
          <p className="mt-1 text-[13px] text-emerald-700">
            Continue to activation. The existing async worker and review flow will keep processing in the background.
          </p>
        </div>
      ) : (
        <>
          <div
            role="button"
            tabIndex={0}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                (event.target as HTMLElement).click();
              }
            }}
            onDragOver={(event) => {
              event.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(event) => {
              event.preventDefault();
              setDragging(false);
              const nextFile = event.dataTransfer.files[0];
              if (nextFile) onFileSelected(nextFile);
            }}
            onClick={() => {
              const input = document.createElement("input");
              input.type = "file";
              input.accept = SCAN_UPLOAD_ACCEPT_ATTR;
              input.onchange = () => {
                if (input.files?.[0]) onFileSelected(input.files[0]);
              };
              input.click();
            }}
            className={cn(
              "flex min-h-[180px] cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed transition-colors",
              dragging ? "border-[#0071a3] bg-[#f0f7fb]" : file ? "border-emerald-300 bg-emerald-50" : "border-gray-200 bg-gray-50 hover:border-gray-300"
            )}
          >
            {preview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={preview} alt="Preview" className="max-h-40 rounded-xl object-contain" />
            ) : (
              <>
                <Upload className="h-8 w-8 text-gray-300" />
                <div className="text-center">
                  <p className="text-[14px] font-medium text-gray-600">
                    {file ? file.name : "Drop a file or click to upload"}
                  </p>
                  <p className="mt-0.5 text-[12px] text-gray-400">
                    JPEG, PNG, WebP · up to 10 MB
                  </p>
                </div>
              </>
            )}
          </div>
          {file && (
            <div className="flex items-center justify-between rounded-xl bg-gray-50 px-4 py-3">
              <div className="flex items-center gap-2 min-w-0">
                <Upload className="h-4 w-4 shrink-0 text-gray-400" />
                <p className="truncate text-[13px] text-gray-700">{file.name}</p>
              </div>
              <button type="button" onClick={resetFile} className="text-gray-300 hover:text-gray-500">
                <X className="h-4 w-4" />
              </button>
            </div>
          )}
        </>
      )}

      {(busy || uploadProgress > 0) && !done && (
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <div className="mb-2 flex items-center justify-between text-xs text-gray-500">
            <span>{progressLabel}</span>
            <span className="font-mono">{uploadProgress}%</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-gray-100">
            <div className="h-full rounded-full bg-[#0071a3] transition-all" style={{ width: `${uploadProgress}%` }} />
          </div>
        </div>
      )}

      {pollTimedOut && !done && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
          <p className="text-[13px] font-medium text-amber-900">
            Processing is still running on the server.
          </p>
          <p className="mt-1 text-[12px] text-amber-700">
            Use Refresh Status to check again without re-uploading.
          </p>
        </div>
      )}

      <div className="flex gap-3">
        <button
          type="button"
          onClick={onBack}
          className="flex-1 rounded-xl border border-gray-200 py-3 text-[14px] font-medium text-gray-600 hover:bg-gray-50"
        >
          Back
        </button>
        {done ? (
          <button
            type="button"
            onClick={onComplete}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-[#0071a3] py-3 text-[14px] font-semibold text-white hover:bg-[#005f8a]"
          >
            Continue
            <ArrowRight className="h-4 w-4" />
          </button>
        ) : pollTimedOut && activeScanId ? (
          <button
            type="button"
            onClick={refreshScanStatus}
            disabled={busy}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-[#0071a3] py-3 text-[14px] font-semibold text-white hover:bg-[#005f8a] disabled:opacity-60"
          >
            {busy ? <><Loader2 className="h-4 w-4 animate-spin" /> Refreshing…</> : "Refresh Status"}
          </button>
        ) : (
          <button
            type="button"
            onClick={runScan}
            disabled={!file || busy}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-[#0071a3] py-3 text-[14px] font-semibold text-white hover:bg-[#005f8a] disabled:opacity-60"
          >
            {busy ? <><Loader2 className="h-4 w-4 animate-spin" /> Processing…</> : "Use existing scan pipeline"}
          </button>
        )}
      </div>

      <button
        type="button"
        onClick={onSkip}
        className="w-full text-center text-[12px] text-gray-400 hover:text-gray-600 underline underline-offset-2"
      >
        Skip for now — unlock dashboard and continue later
      </button>
    </StepFrame>
  );
}

function StepActivate({
  business,
  onboarding,
  onBack,
  onFinish,
  busy,
}: {
  business: BusinessForm;
  onboarding: OnboardingStateResponse | null;
  onBack: () => void;
  onFinish: () => void;
  busy: boolean;
}) {
  const milestones = onboarding?.activation_milestones;
  const checklist = onboarding?.activation_checklist ?? [];

  return (
    <StepFrame
      step={5}
      title={`${business.orgName || "Your workspace"} is ready to activate`}
      subtitle="Dashboard access is unlocked after business setup and at least one outlet. Remaining activation steps stay visible inside the dashboard."
    >
      <div className="rounded-2xl border border-black/[0.06] bg-white p-5">
        <p className="mb-4 text-[11px] font-semibold tracking-widest text-gray-400 uppercase">
          Durable milestones
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          {[
            ["Business setup completed", milestones?.business_setup_completed],
            ["First property created", milestones?.first_property_created],
            ["First document uploaded", milestones?.first_document_uploaded],
            ["First document approved", milestones?.first_document_approved],
            ["First ledger post", milestones?.first_ledger_post],
            ["First forecast generated", milestones?.first_forecast_generated],
            ["First reorder reviewed", milestones?.first_reorder_reviewed],
          ].map(([label, done]) => (
            <div key={String(label)} className="flex items-center gap-2 text-[13px] text-gray-700">
              <CheckCircle2 className={cn("h-4 w-4", done ? "text-emerald-500" : "text-gray-300")} />
              <span>{label}</span>
            </div>
          ))}
        </div>
      </div>

      {checklist.length > 0 && (
        <div className="rounded-2xl border border-blue-100 bg-blue-50 p-5">
          <p className="mb-3 text-[11px] font-semibold tracking-widest text-blue-700 uppercase">
            Next tasks
          </p>
          <div className="space-y-2">
            {checklist.filter((step) => !step.completed).slice(0, 4).map((step) => (
              <div key={step.id}>
                <p className="text-[13px] font-semibold text-blue-900">{step.label}</p>
                {step.description && <p className="text-[12px] text-blue-700">{step.description}</p>}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex gap-3">
        <button
          type="button"
          onClick={onBack}
          className="flex-1 rounded-xl border border-gray-200 py-3 text-[14px] font-medium text-gray-600 hover:bg-gray-50"
        >
          Back
        </button>
        <button
          type="button"
          onClick={onFinish}
          disabled={busy}
          className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-[#0071a3] py-3 text-[14px] font-semibold text-white hover:bg-[#005f8a] disabled:opacity-60"
        >
          {busy ? <><Loader2 className="h-4 w-4 animate-spin" /> Saving…</> : <>Open dashboard<ArrowRight className="h-4 w-4" /></>}
        </button>
      </div>
    </StepFrame>
  );
}

export default function ClientOnboardPage({
  selectedOrgType = "FNB",
}: {
  selectedOrgType?: "FNB" | "HOUSEHOLD";
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const hasSession = useAuthStore(selectHasSession);
  const profile = useAuthStore((state) => state.profile);
  const hasHydrated = useAuthStore((state) => state._hasHydrated);

  const supabaseJwt = searchParams?.get("supabase_jwt") ?? searchParams?.get("token");
  const isGoogleOnboarding = Boolean(supabaseJwt);

  const [step, setStep] = useState(1);
  const [busy, setBusy] = useState(false);
  const [completionMode, setCompletionMode] = useState<"activated" | "skipped">("activated");
  const [provisionedSession, setProvisionedSession] = useState<LoginResponse | null>(null);
  const [onboardingState, setOnboardingState] = useState<OnboardingStateResponse | null>(null);
  const [dataStartChoice, setDataStartChoice] = useState<DataStartChoice>("invoice");
  const [outletBatchKey] = useState(() => crypto.randomUUID());
  const [business, setBusiness] = useState<BusinessForm>({
    orgName: "",
    businessType: "Restaurant",
    country: "Singapore",
    currency: "SGD",
    outletCount: 1,
  });
  const [outlets, setOutlets] = useState<OutletDraft[]>([
    createOutletDraft({ is_primary: true }),
  ]);

  useEffect(() => {
    if (supabaseJwt) setAccessToken(supabaseJwt);
  }, [supabaseJwt]);

  useEffect(() => {
    if (!hasHydrated || !hasSession) return;
    let cancelled = false;
    void (async () => {
      const state = await fetchCanonicalOnboardingState();
      if (!state || cancelled) return;
      setOnboardingState(state);
      if (state.business_type || state.country || state.currency) {
        setBusiness((current) => ({
          ...current,
          orgName: state.organization_id ? current.orgName || current.orgName : current.orgName,
          businessType: (state.business_type as BusinessType | undefined) ?? current.businessType,
          country: state.country ?? current.country,
          currency: state.currency ?? current.currency,
          outletCount: state.target_outlet_count ?? current.outletCount,
        }));
      }
      if (state.outlets && state.outlets.length > 0) {
        setOutlets(
          state.outlets.map((outlet, index) =>
            createOutletDraft({
              onboarding_key: outlet.onboarding_key ?? crypto.randomUUID(),
              name: outlet.name,
              property_type: outlet.property_type ?? "Restaurant",
              address: outlet.address ?? "",
              is_primary: outlet.is_primary || index === 0,
            })
          )
        );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [hasHydrated, hasSession]);

  useEffect(() => {
    if (hasHydrated && !hasSession && !isGoogleOnboarding) {
      router.replace("/auth");
    }
  }, [hasHydrated, hasSession, isGoogleOnboarding, router]);

  const primaryOutlet = useMemo(
    () => outlets.find((outlet) => outlet.is_primary) ?? outlets[0],
    [outlets]
  );

  const outletInputs: OnboardingOutletInput[] = useMemo(
    () =>
      outlets.map((outlet) => ({
        onboarding_key: outlet.onboarding_key,
        name: outlet.name.trim() || "Unnamed Outlet",
        property_type: outlet.property_type,
        address: outlet.address.trim() || null,
        is_primary: outlet.is_primary,
      })),
    [outlets]
  );

  const ensureProvisioned = useCallback(async () => {
    if (profile?.property_id || provisionedSession?.profile?.property_id) return true;
    if (!isGoogleOnboarding || !supabaseJwt) return hasSession;
    if (provisionedSession?.profile?.property_id) return true;

    setBusy(true);
    try {
      const response = await googleComplete(supabaseJwt, {
        org_name: business.orgName.trim() || "My Workspace",
        property_name: primaryOutlet?.name.trim() || "Main Outlet",
        org_type: selectedOrgType,
        property_type: primaryOutlet?.property_type ?? business.businessType,
        role: "admin",
      });
      const { createClient } = await import("@/utils/supabase/client");
      const supabase = createClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (session?.access_token) {
        saveSession({
          access_token: session.access_token,
          refresh_token: session.refresh_token ?? null,
          expires_in: session.expires_in ?? 3600,
          profile: response.profile,
        });
      } else {
        saveSession(response);
      }
      setProvisionedSession(response);
      return true;
    } catch (err) {
      captureUIError("fnb_google_provision", err);
      toast.error("We couldn't finish workspace provisioning. Please try again.");
      return false;
    } finally {
      setBusy(false);
    }
  }, [
    business.businessType,
    business.orgName,
    hasSession,
    isGoogleOnboarding,
    primaryOutlet,
    profile?.property_id,
    provisionedSession?.profile?.property_id,
    selectedOrgType,
    supabaseJwt,
  ]);

  const persistBusinessAndOutlets = useCallback(async () => {
    const ok = await ensureProvisioned();
    if (!ok) return false;

    const payload = {
      onboarding_status: "IN_PROGRESS" as const,
      onboarding_source: isGoogleOnboarding ? "google_oauth" : "self_serve",
      org_type: selectedOrgType,
      business_type: business.businessType,
      org_name: business.orgName.trim(),
      country: business.country.trim(),
      currency: business.currency.trim().toUpperCase(),
      outlet_count: business.outletCount,
      idempotency_key: outletBatchKey,
      outlets: outletInputs,
      property_name: primaryOutlet?.name.trim() || "Main Outlet",
      property_type: primaryOutlet?.property_type ?? business.businessType,
      address: primaryOutlet?.address.trim() || null,
    };

    try {
      const nextState = await updateOnboardingState(payload);
      setOnboardingState(nextState);
      return true;
    } catch (err) {
      if (isGoogleOnboarding) {
        const reprovisioned = await ensureProvisioned();
        if (reprovisioned) {
          try {
            const nextState = await updateOnboardingState(payload);
            setOnboardingState(nextState);
            return true;
          } catch (retryErr) {
            captureUIError("fnb_onboard_persist_retry", retryErr);
          }
        }
      }
      captureUIError("fnb_onboard_persist", err);
      toast.error("We couldn't save your business and outlet setup. Please retry.");
      return false;
    }
  }, [
    business,
    ensureProvisioned,
    isGoogleOnboarding,
    outletBatchKey,
    outletInputs,
    primaryOutlet,
    selectedOrgType,
  ]);

  async function handleOutletsNext() {
    const saved = await persistBusinessAndOutlets();
    if (saved) setStep(3);
  }

  async function handleFinish() {
    setBusy(true);
    try {
      const nextState = await updateOnboardingState({
        onboarding_status: completionMode === "activated" ? "ACTIVATED" : "SKIPPED",
        onboarding_source: isGoogleOnboarding ? "google_oauth" : "self_serve",
        org_type: selectedOrgType,
        business_type: business.businessType,
        org_name: business.orgName.trim(),
        country: business.country.trim(),
        currency: business.currency.trim().toUpperCase(),
        outlet_count: business.outletCount,
        data_start_choice: dataStartChoice,
        idempotency_key: outletBatchKey,
        outlets: outletInputs,
        property_name: primaryOutlet?.name.trim() || "Main Outlet",
        property_type: primaryOutlet?.property_type ?? business.businessType,
        address: primaryOutlet?.address.trim() || null,
      });
      setOnboardingState(nextState);
      setOnboardingComplete();
      router.replace("/dashboard");
    } catch (err) {
      captureUIError("fnb_onboard_finish", err);
      toast.error("We couldn't finish activation. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f5f5f7] px-4 py-8">
      <div className="w-full max-w-3xl rounded-[28px] border border-black/[0.06] bg-white p-6 shadow-sm sm:p-8">
        <div className="mb-6 flex items-center gap-1">
          {Array.from({ length: TOTAL_STEPS }, (_, index) => (
            <span
              key={index}
              className={cn(
                "h-2 rounded-full transition-all",
                index + 1 <= step ? "w-4 bg-[#0071a3]" : "w-2 bg-gray-200"
              )}
            />
          ))}
        </div>

        {step === 1 && (
          <StepBusiness
            value={business}
            onChange={setBusiness}
            onNext={() => setStep(2)}
          />
        )}
        {step === 2 && (
          <StepOutlets
            outlets={outlets}
            targetCount={business.outletCount}
            onChange={setOutlets}
            onBack={() => setStep(1)}
            onNext={() => void handleOutletsNext()}
          />
        )}
        {step === 3 && (
          <StepDataStart
            choice={dataStartChoice}
            onChoose={setDataStartChoice}
            onBack={() => setStep(2)}
            onNext={() => setStep(4)}
          />
        )}
        {step === 4 && (
          <StepUpload
            choice={dataStartChoice}
            onBack={() => setStep(3)}
            onComplete={() => {
              setCompletionMode("activated");
              setStep(5);
            }}
            onSkip={() => {
              setCompletionMode("skipped");
              setStep(5);
            }}
          />
        )}
        {step === 5 && (
          <StepActivate
            business={business}
            onboarding={onboardingState}
            onBack={() => setStep(4)}
            onFinish={() => void handleFinish()}
            busy={busy}
          />
        )}

        {step < TOTAL_STEPS && (
          <p className="mt-6 text-center text-[12px] text-gray-400">
            Need help?{" "}
            <Link href="mailto:hello@neumas.io" className="underline hover:text-gray-600">
              Email us
            </Link>
          </p>
        )}
      </div>
    </div>
  );
}
