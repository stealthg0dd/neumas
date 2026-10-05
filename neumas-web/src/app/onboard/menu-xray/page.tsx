"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Loader2, ScanSearch } from "lucide-react";
import { toast } from "sonner";

import { updateOnboardingState } from "@/lib/api/endpoints";
import { setOnboardingComplete } from "@/lib/onboarding";
import { useAuthStore, selectHasSession } from "@/lib/store/auth";
import { captureUIError } from "@/lib/analytics";
import { cn } from "@/lib/utils";

const ROLES = [
  "Owner / Founder",
  "Operations",
  "Procurement",
  "Finance",
  "Chef / Kitchen",
  "Consultant",
  "Other",
] as const;

const BUSINESS_TYPES = [
  "Restaurant",
  "Cafe / Bakery",
  "Cloud Kitchen",
  "QSR",
  "Hotel / Hospitality",
  "Multi-brand Group",
  "Supplier / Distributor",
  "Other",
] as const;

const OUTLET_OPTIONS = ["1", "2–5", "6–20", "21–100", "100+"] as const;

const GOALS = [
  "Reduce food cost",
  "Improve margins",
  "Supplier sourcing",
  "Inventory control",
  "Waste reduction",
  "Multi-outlet operations",
  "Explore AI procurement",
] as const;

type Role = (typeof ROLES)[number];
type BusinessType = (typeof BUSINESS_TYPES)[number];
type OutletOption = (typeof OUTLET_OPTIONS)[number];
type Goal = (typeof GOALS)[number];

const MENU_XRAY_ONBOARDING_KEY = "neumas_menu_xray_onboarding_complete";

export function isMenuXRayOnboardingComplete(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(MENU_XRAY_ONBOARDING_KEY) === "1";
}

function setMenuXRayOnboardingComplete(): void {
  localStorage.setItem(MENU_XRAY_ONBOARDING_KEY, "1");
}

function Chip({
  label,
  selected,
  onClick,
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-xl border px-4 py-2.5 text-[13px] font-medium transition-all text-left",
        selected
          ? "border-[#0071a3] bg-[#0071a3]/8 text-[#0071a3] ring-1 ring-[#0071a3]/20"
          : "border-gray-200 bg-white text-gray-700 hover:border-gray-300 hover:bg-gray-50"
      )}
    >
      {label}
    </button>
  );
}

function MenuXRayOnboardInner() {
  const router = useRouter();
  const hasSession = useAuthStore(selectHasSession);
  const hasHydrated = useAuthStore((s) => s._hasHydrated);
  const profile = useAuthStore((s) => s.profile);

  const [name, setName] = useState("");
  const [company, setCompany] = useState("");
  const [role, setRole] = useState<Role | null>(null);
  const [businessType, setBusinessType] = useState<BusinessType | null>(null);
  const [outlets, setOutlets] = useState<OutletOption | null>(null);
  const [country, setCountry] = useState("");
  const [goal, setGoal] = useState<Goal | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!hasHydrated) return;
    if (!hasSession) {
      router.replace("/auth?next=/onboard/menu-xray");
      return;
    }
    if (profile?.full_name) setName(profile.full_name);
    if (profile?.org_name) setCompany(profile.org_name);
  }, [hasHydrated, hasSession, profile, router]);

  const isValid =
    name.trim().length >= 2 &&
    company.trim().length >= 2 &&
    role !== null &&
    businessType !== null &&
    outlets !== null &&
    country.trim().length >= 2 &&
    goal !== null;

  async function handleSubmit() {
    if (!isValid) return;
    setBusy(true);
    try {
      await updateOnboardingState({
        onboarding_status: "ACTIVATED",
        onboarding_source: "menu_xray_ph",
        org_type: "FNB",
        org_name: company.trim(),
        business_type: businessType!,
        country: country.trim(),
        outlet_count: outlets === "1" ? 1 : outlets === "2–5" ? 2 : outlets === "6–20" ? 6 : outlets === "21–100" ? 21 : 100,
        onboarding_role: role!,
        onboarding_goal: goal!,
        property_name: company.trim(),
        property_type: businessType!,
      });
      setMenuXRayOnboardingComplete();
      setOnboardingComplete();
      router.replace("/dashboard/menu-xray");
    } catch (err) {
      captureUIError("menu_xray_onboarding", err);
      toast.error("Couldn't save your profile. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  if (!hasHydrated) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f5f5f7]">
        <div className="h-10 w-10 animate-pulse rounded-xl bg-gray-200" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-start justify-center bg-[#f5f5f7] px-4 py-10 sm:py-16">
      <div className="w-full max-w-2xl">
        {/* Header */}
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-[#0071a3]/10">
            <ScanSearch className="h-6 w-6 text-[#0071a3]" />
          </div>
          <div className="mb-1 text-[11px] font-semibold tracking-widest text-[#0071a3] uppercase">
            1 minute setup
          </div>
          <h1 className="text-[26px] font-bold tracking-tight text-gray-900">
            Set up your Menu X-Ray
          </h1>
          <p className="mt-2 text-[15px] text-gray-500">
            Tell us about your business so we can surface the right insights.
          </p>
        </div>

        <div className="rounded-[28px] border border-black/[0.06] bg-white p-6 shadow-sm sm:p-8">
          <div className="space-y-6">
            {/* Name */}
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block space-y-1.5">
                <span className="text-[13px] font-semibold text-gray-700">Your name</span>
                <input
                  type="text"
                  autoComplete="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Alex Chen"
                  className="w-full rounded-xl border border-gray-200 px-4 py-3 text-[14px] text-gray-900 outline-none placeholder:text-gray-300 focus:border-[#0071a3] focus:ring-2 focus:ring-[#0071a3]/20"
                />
              </label>

              {/* Work email — read-only from auth */}
              <label className="block space-y-1.5">
                <span className="text-[13px] font-semibold text-gray-700">Work email</span>
                <input
                  type="email"
                  readOnly
                  value={profile?.email ?? ""}
                  className="w-full rounded-xl border border-gray-100 bg-gray-50 px-4 py-3 text-[14px] text-gray-400 outline-none cursor-not-allowed"
                />
              </label>
            </div>

            {/* Company */}
            <label className="block space-y-1.5">
              <span className="text-[13px] font-semibold text-gray-700">
                Company / restaurant / brand name
              </span>
              <input
                type="text"
                autoComplete="organization"
                value={company}
                onChange={(e) => setCompany(e.target.value)}
                placeholder="e.g. Greenleaf Kitchen Group"
                className="w-full rounded-xl border border-gray-200 px-4 py-3 text-[14px] text-gray-900 outline-none placeholder:text-gray-300 focus:border-[#0071a3] focus:ring-2 focus:ring-[#0071a3]/20"
              />
            </label>

            {/* Role */}
            <div className="space-y-2">
              <p className="text-[13px] font-semibold text-gray-700">Your role</p>
              <div className="flex flex-wrap gap-2">
                {ROLES.map((r) => (
                  <Chip
                    key={r}
                    label={r}
                    selected={role === r}
                    onClick={() => setRole(r)}
                  />
                ))}
              </div>
            </div>

            {/* Business type */}
            <div className="space-y-2">
              <p className="text-[13px] font-semibold text-gray-700">Business type</p>
              <div className="flex flex-wrap gap-2">
                {BUSINESS_TYPES.map((bt) => (
                  <Chip
                    key={bt}
                    label={bt}
                    selected={businessType === bt}
                    onClick={() => setBusinessType(bt)}
                  />
                ))}
              </div>
            </div>

            {/* Number of outlets + Country */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <p className="text-[13px] font-semibold text-gray-700">Number of outlets</p>
                <div className="flex flex-wrap gap-2">
                  {OUTLET_OPTIONS.map((o) => (
                    <Chip
                      key={o}
                      label={o}
                      selected={outlets === o}
                      onClick={() => setOutlets(o)}
                    />
                  ))}
                </div>
              </div>

              <label className="block space-y-1.5">
                <span className="text-[13px] font-semibold text-gray-700">
                  Country / primary market
                </span>
                <input
                  type="text"
                  value={country}
                  onChange={(e) => setCountry(e.target.value)}
                  placeholder="Singapore"
                  className="w-full rounded-xl border border-gray-200 px-4 py-3 text-[14px] text-gray-900 outline-none placeholder:text-gray-300 focus:border-[#0071a3] focus:ring-2 focus:ring-[#0071a3]/20"
                />
              </label>
            </div>

            {/* Main goal */}
            <div className="space-y-2">
              <p className="text-[13px] font-semibold text-gray-700">Main goal</p>
              <div className="flex flex-wrap gap-2">
                {GOALS.map((g) => (
                  <Chip
                    key={g}
                    label={g}
                    selected={goal === g}
                    onClick={() => setGoal(g)}
                  />
                ))}
              </div>
            </div>
          </div>

          {/* CTA */}
          <div className="mt-8">
            <button
              type="button"
              onClick={() => void handleSubmit()}
              disabled={!isValid || busy}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#0071a3] py-4 text-[15px] font-semibold text-white shadow-sm transition-all hover:bg-[#005f8a] disabled:opacity-50"
            >
              {busy ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" />
                  Setting up…
                </>
              ) : (
                <>
                  Start Menu X-Ray
                  <ArrowRight className="h-5 w-5" />
                </>
              )}
            </button>
            <p className="mt-3 text-center text-[12px] text-gray-400">
              No credit card required · Your data is private
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function MenuXRayOnboardPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-[#f5f5f7]">
          <div className="h-10 w-10 animate-pulse rounded-xl bg-gray-200" />
        </div>
      }
    >
      <MenuXRayOnboardInner />
    </Suspense>
  );
}
