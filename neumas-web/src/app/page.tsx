"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { LandingPage } from "@/components/landing/LandingPage";
import { selectIsAuthenticated, useAuthStore } from "@/lib/store/auth";

export default function RootPage() {
  const router = useRouter();
  const isAuth = useAuthStore(selectIsAuthenticated);
  const hasHydrated = useAuthStore((s) => s._hasHydrated);

  useEffect(() => {
    if (hasHydrated && isAuth) {
      router.replace("/dashboard");
    }
  }, [hasHydrated, isAuth, router]);

  if (!hasHydrated) {
    return (
      <div className="min-h-screen bg-white">
        <div className="flex min-h-screen items-center justify-center">
          <div className="h-10 w-10 animate-pulse rounded-xl bg-gray-200" />
        </div>
      </div>
    );
  }

  if (isAuth) {
    return null;
  }

  return <LandingPage />;
}
