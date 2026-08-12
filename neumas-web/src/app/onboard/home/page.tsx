"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowRight, Home, Loader2, PencilLine, Receipt, ScanLine, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { postScanUpload, updateOnboardingState } from "@/lib/api/endpoints";
import type { OnboardingStateResponse } from "@/lib/api/types";
import { setOnboardingComplete } from "@/lib/onboarding";
import { useAuthStore } from "@/lib/store/auth";
import { captureUIError } from "@/lib/analytics";

const DEFAULT_COUNTRY = "Singapore";
const DEFAULT_CURRENCY = "SGD";

function defaultHouseholdName(fullName: string | null | undefined): string {
  const firstName = (fullName ?? "").trim().split(/\s+/)[0];
  if (!firstName) return "My Household";
  return `${firstName}'s Household`;
}

export default function HouseholdOnboardingPage() {
  const router = useRouter();
  const profile = useAuthStore((s) => s.profile);

  const initialName = useMemo(
    () => defaultHouseholdName(profile?.full_name),
    [profile?.full_name]
  );

  const [form, setForm] = useState({
    householdName: initialName,
    householdSize: "2",
    country: DEFAULT_COUNTRY,
    currency: DEFAULT_CURRENCY,
    shoppingFrequency: "Weekly",
    favoriteStores: "",
    wasteGoal: "Reduce grocery waste",
    monthlyBudget: "",
    dietaryPreferences: "",
  });
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [mode, setMode] = useState<"scan" | "manual" | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);
  const [onboardingState, setOnboardingState] = useState<OnboardingStateResponse | null>(null);

  async function persistBaseState(nextStatus: "IN_PROGRESS" | "ACTIVATED") {
    const stores = form.favoriteStores
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);
    const dietaryPreferences = form.dietaryPreferences
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);

    const next = await updateOnboardingState({
      onboarding_status: nextStatus,
      onboarding_source: "household_onboarding",
      org_type: "HOUSEHOLD",
      org_name: form.householdName.trim() || initialName,
      country: form.country.trim(),
      currency: form.currency.trim().toUpperCase(),
      household_size: Number(form.householdSize),
      shopping_frequency: form.shoppingFrequency.trim() || undefined,
      favorite_stores: stores,
      waste_reduction_goal: form.wasteGoal.trim() || undefined,
      monthly_grocery_budget: form.monthlyBudget ? Number(form.monthlyBudget) : undefined,
      dietary_preferences: dietaryPreferences,
      data_start_choice: mode === "manual" ? "manual_pantry" : "scan_receipt",
      property_name: "Home",
      property_type: "HOUSEHOLD",
    });
    setOnboardingState(next);
    return next;
  }

  async function handleContinueHousehold() {
    try {
      const next = await persistBaseState("IN_PROGRESS");
      setOnboardingState(next);
      setStep(2);
    } catch (error) {
      captureUIError("household_onboarding_start", error);
      toast.error("We couldn't save your household setup just yet.");
    }
  }

  async function handleUpload(file: File) {
    try {
      setUploading(true);
      setMode("scan");
      await persistBaseState("IN_PROGRESS");
      await postScanUpload(file, "receipt");
      setUploadedFileName(file.name);
      setStep(3);
    } catch (error) {
      captureUIError("household_receipt_upload", error);
      toast.error("Receipt upload failed. Please try again.");
    } finally {
      setUploading(false);
    }
  }

  async function handleManualStart() {
    try {
      setMode("manual");
      await persistBaseState("IN_PROGRESS");
      setStep(3);
    } catch (error) {
      captureUIError("household_manual_start", error);
      toast.error("We couldn't start your pantry workspace.");
    }
  }

  async function finishOnboarding() {
    try {
      await persistBaseState("ACTIVATED");
      setOnboardingComplete();
      router.replace("/dashboard");
    } catch (error) {
      captureUIError("household_onboarding_activate", error);
      toast.error("We couldn't finish activation just yet.");
    }
  }

  return (
    <div className="min-h-screen bg-[#f5f5f7] px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="rounded-[28px] border border-gray-200 bg-white p-6 shadow-sm sm:p-8">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#0071a3]">
                Household onboarding
              </p>
              <h1 className="mt-2 text-3xl font-bold tracking-tight text-gray-900">
                Build your pantry workspace on the same Neumas platform
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-gray-500">
                Receipts, pantry items, alerts, shopping lists, and spending all stay on the
                shared Neumas inventory and scan infrastructure. This setup just tailors the
                labels and dashboard to a household.
              </p>
            </div>
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#0071a3]/10 text-[#0071a3]">
              <Home className="h-7 w-7" />
            </div>
          </div>

          <div className="mt-8 grid gap-3 sm:grid-cols-4">
            {[
              { id: 1, label: "Household" },
              { id: 2, label: "Get started" },
              { id: 3, label: "Review" },
              { id: 4, label: "Pantry created" },
            ].map((item) => {
              const active = step === item.id;
              const done = step > item.id;
              return (
                <div
                  key={item.id}
                  className={[
                    "rounded-2xl border px-4 py-3 text-sm",
                    done
                      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                      : active
                        ? "border-[#0071a3]/25 bg-[#f0f7fb] text-[#0071a3]"
                        : "border-gray-200 bg-white text-gray-500",
                  ].join(" ")}
                >
                  <span className="text-xs font-semibold uppercase tracking-[0.16em]">
                    Step {item.id}
                  </span>
                  <p className="mt-1 font-semibold">{item.label}</p>
                </div>
              );
            })}
          </div>
        </div>

        {step === 1 && (
          <div className="rounded-[28px] border border-gray-200 bg-white p-6 shadow-sm sm:p-8">
            <div className="grid gap-5 md:grid-cols-2">
              <label className="text-sm font-medium text-gray-700">
                Household name
                <input
                  value={form.householdName}
                  onChange={(event) => setForm((current) => ({ ...current, householdName: event.target.value }))}
                  className="mt-2 w-full rounded-xl border border-gray-200 px-4 py-3 text-sm text-gray-900 outline-none ring-0 transition focus:border-[#0071a3]"
                  placeholder={initialName}
                />
              </label>
              <label className="text-sm font-medium text-gray-700">
                Household size
                <input
                  type="number"
                  min={1}
                  max={20}
                  value={form.householdSize}
                  onChange={(event) => setForm((current) => ({ ...current, householdSize: event.target.value }))}
                  className="mt-2 w-full rounded-xl border border-gray-200 px-4 py-3 text-sm text-gray-900 outline-none ring-0 transition focus:border-[#0071a3]"
                />
              </label>
              <label className="text-sm font-medium text-gray-700">
                Country
                <input
                  value={form.country}
                  onChange={(event) => setForm((current) => ({ ...current, country: event.target.value }))}
                  className="mt-2 w-full rounded-xl border border-gray-200 px-4 py-3 text-sm text-gray-900 outline-none ring-0 transition focus:border-[#0071a3]"
                />
              </label>
              <label className="text-sm font-medium text-gray-700">
                Currency
                <input
                  value={form.currency}
                  onChange={(event) => setForm((current) => ({ ...current, currency: event.target.value.toUpperCase() }))}
                  className="mt-2 w-full rounded-xl border border-gray-200 px-4 py-3 text-sm text-gray-900 outline-none ring-0 transition focus:border-[#0071a3]"
                />
              </label>
              <label className="text-sm font-medium text-gray-700">
                Shopping frequency
                <input
                  value={form.shoppingFrequency}
                  onChange={(event) => setForm((current) => ({ ...current, shoppingFrequency: event.target.value }))}
                  className="mt-2 w-full rounded-xl border border-gray-200 px-4 py-3 text-sm text-gray-900 outline-none ring-0 transition focus:border-[#0071a3]"
                  placeholder="Weekly"
                />
              </label>
              <label className="text-sm font-medium text-gray-700">
                Favourite grocery stores
                <input
                  value={form.favoriteStores}
                  onChange={(event) => setForm((current) => ({ ...current, favoriteStores: event.target.value }))}
                  className="mt-2 w-full rounded-xl border border-gray-200 px-4 py-3 text-sm text-gray-900 outline-none ring-0 transition focus:border-[#0071a3]"
                  placeholder="NTUC, Cold Storage"
                />
              </label>
              <label className="text-sm font-medium text-gray-700">
                Waste reduction goal
                <input
                  value={form.wasteGoal}
                  onChange={(event) => setForm((current) => ({ ...current, wasteGoal: event.target.value }))}
                  className="mt-2 w-full rounded-xl border border-gray-200 px-4 py-3 text-sm text-gray-900 outline-none ring-0 transition focus:border-[#0071a3]"
                  placeholder="Reduce grocery waste"
                />
              </label>
              <label className="text-sm font-medium text-gray-700">
                Monthly grocery budget
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={form.monthlyBudget}
                  onChange={(event) => setForm((current) => ({ ...current, monthlyBudget: event.target.value }))}
                  className="mt-2 w-full rounded-xl border border-gray-200 px-4 py-3 text-sm text-gray-900 outline-none ring-0 transition focus:border-[#0071a3]"
                  placeholder="600"
                />
              </label>
            </div>

            <label className="mt-5 block text-sm font-medium text-gray-700">
              Dietary preferences
              <input
                value={form.dietaryPreferences}
                onChange={(event) => setForm((current) => ({ ...current, dietaryPreferences: event.target.value }))}
                className="mt-2 w-full rounded-xl border border-gray-200 px-4 py-3 text-sm text-gray-900 outline-none ring-0 transition focus:border-[#0071a3]"
                placeholder="Vegetarian, lactose-free"
              />
            </label>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => void handleContinueHousehold()}
                className="inline-flex items-center gap-2 rounded-xl bg-[#0071a3] px-5 py-3 text-sm font-semibold text-white hover:bg-[#005f8a]"
              >
                Continue
                <ArrowRight className="h-4 w-4" />
              </button>
              <p className="text-xs text-gray-400">
                Dietary preferences stay optional and never block onboarding.
              </p>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="grid gap-5 md:grid-cols-2">
            <label className="rounded-[28px] border border-gray-200 bg-white p-6 shadow-sm">
              <input
                type="file"
                accept="image/*,.pdf"
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) {
                    void handleUpload(file);
                  }
                }}
              />
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#0071a3]/10 text-[#0071a3]">
                <Receipt className="h-7 w-7" />
              </div>
              <h2 className="mt-5 text-xl font-semibold text-gray-900">Scan your first grocery receipt</h2>
              <p className="mt-2 text-sm leading-6 text-gray-500">
                This is the fastest way to build household pantry state using the existing
                receipt OCR, review, canonicalization, and inventory ledger flow.
              </p>
              <span className="mt-6 inline-flex items-center gap-2 rounded-xl bg-[#0071a3] px-4 py-2 text-sm font-semibold text-white">
                {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ScanLine className="h-4 w-4" />}
                {uploading ? "Uploading receipt..." : "Choose receipt"}
              </span>
            </label>

            <div className="rounded-[28px] border border-gray-200 bg-white p-6 shadow-sm">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#0071a3]/10 text-[#0071a3]">
                <PencilLine className="h-7 w-7" />
              </div>
              <h2 className="mt-5 text-xl font-semibold text-gray-900">Add pantry items manually</h2>
              <p className="mt-2 text-sm leading-6 text-gray-500">
                If you want to start without a receipt, continue into the household shell and
                add pantry items from the shared inventory workspace.
              </p>
              <button
                type="button"
                onClick={() => void handleManualStart()}
                className="mt-6 inline-flex items-center gap-2 rounded-xl border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
              >
                Continue without receipt
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="rounded-[28px] border border-gray-200 bg-white p-6 shadow-sm sm:p-8">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#0071a3]">
              Review
            </p>
            <h2 className="mt-2 text-2xl font-semibold text-gray-900">
              Use the existing review pipeline with household-friendly labels
            </h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-gray-500">
              {mode === "scan"
                ? `Your receipt${uploadedFileName ? ` (${uploadedFileName})` : ""} is now flowing through the current scan, OCR, canonical item, and inventory movement pipeline.`
                : "You can start with manual pantry items first and still use the existing shared review, alerts, and inventory logic afterwards."}
            </p>

            <div className="mt-6 grid gap-4 md:grid-cols-3">
              {[
                "Receipt or pantry input is normalized",
                "Detected items can be reviewed before they affect pantry state",
                "Ledger-backed inventory powers running low and use-soon signals",
              ].map((text) => (
                <div key={text} className="rounded-2xl border border-gray-100 bg-gray-50 p-4 text-sm text-gray-600">
                  {text}
                </div>
              ))}
            </div>

            <div className="mt-8 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => setStep(4)}
                className="inline-flex items-center gap-2 rounded-xl bg-[#0071a3] px-5 py-3 text-sm font-semibold text-white hover:bg-[#005f8a]"
              >
                Continue
                <ArrowRight className="h-4 w-4" />
              </button>
              <Link
                href="/dashboard/documents"
                className="inline-flex items-center gap-2 rounded-xl border border-gray-200 px-5 py-3 text-sm font-medium text-gray-600 hover:bg-gray-50"
              >
                Open review queue
              </Link>
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="rounded-[28px] border border-gray-200 bg-white p-6 shadow-sm sm:p-8">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#0071a3]">
                  Pantry created
                </p>
                <h2 className="mt-2 text-2xl font-semibold text-gray-900">
                  Your household shell is ready
                </h2>
                <p className="mt-3 max-w-2xl text-sm leading-6 text-gray-500">
                  The dashboard will show pantry items, categories, running-low eligibility,
                  use-soon eligibility where expiry exists, recent receipts, and spend signals
                  from the same shared Neumas inventory and analytics services.
                </p>
              </div>
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#0071a3]/10 text-[#0071a3]">
                <Sparkles className="h-7 w-7" />
              </div>
            </div>

            <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              {[
                "Items detected from receipts and review",
                "Categories grouped from canonical items",
                "Running-low logic from stock status and alerts",
                "Use-soon logic from expiry metadata where available",
              ].map((line) => (
                <div key={line} className="rounded-2xl border border-gray-100 bg-gray-50 p-4 text-sm text-gray-600">
                  {line}
                </div>
              ))}
            </div>

            <div className="mt-8 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => void finishOnboarding()}
                className="inline-flex items-center gap-2 rounded-xl bg-[#0071a3] px-5 py-3 text-sm font-semibold text-white hover:bg-[#005f8a]"
              >
                Open household home
                <ArrowRight className="h-4 w-4" />
              </button>
              <Link
                href="/dashboard/scans/new"
                className="inline-flex items-center gap-2 rounded-xl border border-gray-200 px-5 py-3 text-sm font-medium text-gray-600 hover:bg-gray-50"
              >
                Scan another receipt
              </Link>
            </div>

            {onboardingState?.household_profile?.household_name && (
              <p className="mt-4 text-xs text-gray-400">
                Household profile saved for {onboardingState.household_profile.household_name}.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
