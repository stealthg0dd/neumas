"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, Building2, Home, Loader2 } from "lucide-react";
import { toast } from "sonner";

import ClientOnboardPage from "./ClientOnboardPage";
import { googleComplete, updateOnboardingState } from "@/lib/api/endpoints";
import type { OnboardingStateResponse } from "@/lib/api/types";
import { saveSession, setAccessToken } from "@/lib/auth-session";
import { fetchCanonicalOnboardingState } from "@/lib/onboarding";
import { useAuthStore, selectHasSession } from "@/lib/store/auth";
import {
  isPersonaOnboardingEnabled,
  resolveWorkspaceExperience,
} from "@/lib/workspace-experience";
import { captureUIError } from "@/lib/analytics";

type Persona = "FNB" | "HOUSEHOLD";

function PersonaCards({
  busyPersona,
  onSelect,
}: {
  busyPersona: Persona | null;
  onSelect: (persona: Persona) => void;
}) {
  return (
    <div className="mx-auto flex min-h-screen max-w-5xl items-center px-6 py-12">
      <div className="w-full">
        <div className="mx-auto max-w-2xl text-center">
          <h1 className="text-3xl font-bold tracking-tight text-gray-900">
            How will you use Neumas?
          </h1>
          <p className="mt-3 text-sm text-gray-500">
            Choose the workspace that matches this account. You can keep using the
            shared Neumas platform without creating a second application.
          </p>
        </div>

        <div className="mx-auto mt-10 grid max-w-4xl gap-5 md:grid-cols-2">
          <button
            type="button"
            onClick={() => onSelect("FNB")}
            disabled={busyPersona !== null}
            className="rounded-3xl border border-gray-200 bg-white p-7 text-left shadow-sm transition-all hover:border-[#0071a3] hover:shadow-md disabled:opacity-70"
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#0071a3]/10 text-[#0071a3]">
              <Building2 className="h-6 w-6" />
            </div>
            <h2 className="mt-5 text-xl font-semibold text-gray-900">F&amp;B Business</h2>
            <p className="mt-2 text-sm leading-6 text-gray-500">
              Restaurants, cafes, cloud kitchens, catering and hospitality operations.
            </p>
            <div className="mt-6 flex items-center gap-2 text-sm font-semibold text-[#0071a3]">
              {busyPersona === "FNB" ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Setting up workspace
                </>
              ) : (
                <>
                  Continue with F&amp;B
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </div>
          </button>

          <button
            type="button"
            onClick={() => onSelect("HOUSEHOLD")}
            disabled={busyPersona !== null}
            className="rounded-3xl border border-gray-200 bg-white p-7 text-left shadow-sm transition-all hover:border-[#0071a3] hover:shadow-md disabled:opacity-70"
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#0071a3]/10 text-[#0071a3]">
              <Home className="h-6 w-6" />
            </div>
            <h2 className="mt-5 text-xl font-semibold text-gray-900">Home &amp; Household</h2>
            <p className="mt-2 text-sm leading-6 text-gray-500">
              Manage groceries, pantry, spending, waste and replenishment.
            </p>
            <div className="mt-6 flex items-center gap-2 text-sm font-semibold text-[#0071a3]">
              {busyPersona === "HOUSEHOLD" ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Setting up workspace
                </>
              ) : (
                <>
                  Continue with household
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </div>
          </button>
        </div>

        <p className="mt-8 text-center text-sm text-gray-500">
          Joining an existing team? Invitation-based users should inherit organization context.
        </p>
        <p className="mt-3 text-center text-xs text-gray-400">
          Need help? <Link href="mailto:hello@neumas.io" className="underline">Email us</Link>
        </p>
      </div>
    </div>
  );
}

function OnboardEntryInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const hasSession = useAuthStore(selectHasSession);
  const hasHydrated = useAuthStore((s) => s._hasHydrated);
  const profile = useAuthStore((s) => s.profile);
  const setProfile = useAuthStore((s) => s.setProfile);

  const supabaseJwt = searchParams?.get("supabase_jwt") ?? searchParams?.get("token");
  const isGoogleOnboarding = Boolean(supabaseJwt);

  const [onboarding, setOnboarding] = useState<OnboardingStateResponse | null>(null);
  const [busyPersona, setBusyPersona] = useState<Persona | null>(null);
  const [selectedPersona, setSelectedPersona] = useState<Persona | null>(null);
  const [loadingState, setLoadingState] = useState(true);

  useEffect(() => {
    if (supabaseJwt) setAccessToken(supabaseJwt);
  }, [supabaseJwt]);

  const experience = useMemo(
    () => resolveWorkspaceExperience(profile, onboarding),
    [onboarding, profile]
  );

  useEffect(() => {
    if (!isPersonaOnboardingEnabled()) {
      setLoadingState(false);
      return;
    }
    if (!hasHydrated) return;
    if (!hasSession) {
      setLoadingState(false);
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const state = await fetchCanonicalOnboardingState();
        if (!cancelled) {
          setOnboarding(state);
        }
      } finally {
        if (!cancelled) {
          setLoadingState(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [hasHydrated, hasSession]);

  useEffect(() => {
    if (!isPersonaOnboardingEnabled() || !hasHydrated) return;
    if (!hasSession && !isGoogleOnboarding) {
      router.replace("/auth");
      return;
    }
    if (hasSession && experience === "HOUSEHOLD") {
      router.replace("/onboard/home");
      return;
    }
    if (hasSession && experience === "INVITED") {
      router.replace("/dashboard");
    }
  }, [experience, hasHydrated, hasSession, isGoogleOnboarding, router]);

  const persistPersonaForSession = useCallback(
    async (persona: Persona) => {
      const nextState = await updateOnboardingState({
        onboarding_status: onboarding?.onboarding_status ?? "IN_PROGRESS",
        onboarding_source: "workspace_persona",
        org_type: persona,
        property_type: persona === "HOUSEHOLD" ? "HOUSEHOLD" : onboarding?.property_type ?? "Restaurant",
      });
      setOnboarding(nextState);
      if (profile) {
        setProfile({
          ...profile,
          org_type: persona,
          workspace_experience: persona,
          is_invited_user: false,
        });
      }
    },
    [onboarding, profile, setProfile]
  );

  const provisionGooglePersona = useCallback(
    async (persona: Persona) => {
      if (!supabaseJwt) {
        return;
      }
      const resp = await googleComplete(supabaseJwt, {
        org_name: "My Workspace",
        property_name: persona === "HOUSEHOLD" ? "Home" : "Main Property",
        org_type: persona,
        property_type: persona === "HOUSEHOLD" ? "HOUSEHOLD" : "Restaurant",
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
          profile: resp.profile,
        });
      } else {
        saveSession(resp);
      }

      setOnboarding({
        organization_id: resp.profile.org_id,
        property_id: resp.profile.property_id,
        org_type: persona,
        workspace_experience: persona,
        is_invited_user: false,
        has_properties: true,
        property_type: persona === "HOUSEHOLD" ? "HOUSEHOLD" : "Restaurant",
        address: null,
        onboarding_status: "IN_PROGRESS",
        onboarding_started_at: null,
        onboarding_completed_at: null,
        onboarding_version: 1,
        onboarding_source: "google_oauth",
        country: null,
        currency: null,
        has_scans: false,
        has_inventory_activity: false,
        is_complete: false,
        requires_onboarding: true,
      });
    },
    [supabaseJwt]
  );

  const handlePersonaSelect = useCallback(
    async (persona: Persona) => {
      try {
        setBusyPersona(persona);
        setSelectedPersona(persona);

        if (hasSession) {
          await persistPersonaForSession(persona);
        } else if (isGoogleOnboarding) {
          await provisionGooglePersona(persona);
        }

        if (persona === "HOUSEHOLD") {
          router.replace("/onboard/home");
        }
      } catch (err) {
        captureUIError("persona_selection", err);
        toast.error("We couldn't save your workspace choice. Please try again.");
      } finally {
        setBusyPersona(null);
      }
    },
    [hasSession, isGoogleOnboarding, persistPersonaForSession, provisionGooglePersona, router]
  );

  if (!hasHydrated || loadingState) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f5f5f7]">
        <div className="h-10 w-10 animate-pulse rounded-xl bg-gray-200" />
      </div>
    );
  }

  if (!isPersonaOnboardingEnabled()) {
    return <ClientOnboardPage selectedOrgType="FNB" />;
  }

  if (!hasSession && !isGoogleOnboarding) {
    return null;
  }

  if (hasSession && (experience === "FNB" || experience === "LEGACY_FNB")) {
    return <ClientOnboardPage selectedOrgType="FNB" />;
  }

  if (!hasSession && selectedPersona === "FNB") {
    return <ClientOnboardPage selectedOrgType="FNB" />;
  }

  if (hasSession && experience === "NEEDS_PERSONA") {
    return <PersonaCards busyPersona={busyPersona} onSelect={handlePersonaSelect} />;
  }

  if (!hasSession && isGoogleOnboarding && !selectedPersona) {
    return <PersonaCards busyPersona={busyPersona} onSelect={handlePersonaSelect} />;
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f5f5f7]">
      <div className="h-10 w-10 animate-pulse rounded-xl bg-gray-200" />
    </div>
  );
}

export default function OnboardPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-[#f5f5f7]">
          <div className="h-10 w-10 animate-pulse rounded-xl bg-gray-200" />
        </div>
      }
    >
      <OnboardEntryInner />
    </Suspense>
  );
}
