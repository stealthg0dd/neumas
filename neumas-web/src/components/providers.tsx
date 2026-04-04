"use client";

import { useEffect } from "react";
import { PostHogProvider } from "posthog-js/react";
import posthog from "posthog-js";
import { Toaster } from "sonner";

import { initPostHog } from "@/lib/analytics";
import { PageTracker } from "@/components/analytics/PageTracker";

export function Providers({ children }: { children: React.ReactNode }) {
  // Initialise PostHog once on the client. initPostHog() is idempotent and
  // guards against server-side execution.
  useEffect(() => {
    initPostHog();
  }, []);

  return (
    <PostHogProvider client={posthog}>
      <PageTracker />
      {children}
      <Toaster
        position="bottom-right"
        theme="dark"
        toastOptions={{
          style: {
            background: "oklch(0.13 0.008 240)",
            border: "1px solid oklch(0.22 0.01 240 / 0.6)",
            color: "oklch(0.95 0.005 240)",
          },
        }}
      />
    </PostHogProvider>
  );
}
