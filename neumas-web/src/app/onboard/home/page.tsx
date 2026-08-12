"use client";

import Link from "next/link";
import { ArrowRight, Home, ShieldCheck } from "lucide-react";

export default function HouseholdOnboardingPlaceholderPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f5f5f7] px-6 py-12">
      <div className="w-full max-w-2xl rounded-[28px] border border-gray-200 bg-white p-8 shadow-sm">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#0071a3]/10 text-[#0071a3]">
          <Home className="h-7 w-7" />
        </div>
        <h1 className="mt-6 text-3xl font-bold tracking-tight text-gray-900">
          Household onboarding is reserved for the next phase.
        </h1>
        <p className="mt-3 text-sm leading-6 text-gray-500">
          Your workspace persona is saved. Shared authentication, documents, scans,
          inventory, alerts and analytics remain on the same Neumas platform while the
          household-specific dashboard is completed.
        </p>

        <div className="mt-8 rounded-2xl border border-gray-100 bg-gray-50 p-5">
          <div className="flex items-start gap-3">
            <ShieldCheck className="mt-0.5 h-5 w-5 text-[#0071a3]" />
            <div>
              <p className="text-sm font-semibold text-gray-900">What is already preserved</p>
              <p className="mt-1 text-sm text-gray-500">
                Your account, workspace context, permissions and canonical onboarding state
                are already stored server-side.
              </p>
            </div>
          </div>
        </div>

        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <Link
            href="/dashboard"
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#0071a3] px-5 py-3 text-sm font-semibold text-white hover:bg-[#005f8a]"
          >
            Continue to dashboard
            <ArrowRight className="h-4 w-4" />
          </Link>
          <Link
            href="mailto:hello@neumas.io"
            className="inline-flex items-center justify-center rounded-xl border border-gray-200 px-5 py-3 text-sm font-medium text-gray-600 hover:bg-gray-50"
          >
            Contact Neumas
          </Link>
        </div>
      </div>
    </div>
  );
}
