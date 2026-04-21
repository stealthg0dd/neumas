"use client";

import { useEffect } from "react";

export function PWARegistration() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
      return;
    }

    const register = async () => {
      try {
        await navigator.serviceWorker.register("/sw.js");
      } catch (error) {
        if (process.env.NODE_ENV === "development") {
          console.warn("Service worker registration failed", error);
        }
      }
    };

    void register();
  }, []);

  return null;
}
