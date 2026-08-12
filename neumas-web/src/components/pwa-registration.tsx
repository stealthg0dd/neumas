"use client";

import { useEffect } from "react";

const CHUNK_RECOVERY_KEY = "neumas-chunk-recovery-attempted";
const SW_RELOAD_KEY = "neumas-sw-controller-reloaded";

function logDevelopment(...messages: unknown[]) {
  if (process.env.NODE_ENV === "development") {
    console.info("[pwa]", ...messages);
  }
}

function isChunkFailure(event: ErrorEvent | PromiseRejectionEvent) {
  const reason =
    "reason" in event
      ? event.reason
      : event.error || event.message || event.filename || "";
  const message = String(reason?.message || reason || "");
  const filename = "filename" in event ? event.filename || "" : "";
  const target = "target" in event ? event.target : null;
  const scriptSource = target instanceof HTMLScriptElement ? target.src : "";

  return (
    message.includes("ChunkLoadError") ||
    message.includes("Loading chunk") ||
    message.includes("/_next/static/chunks/") ||
    filename.includes("/_next/static/chunks/") ||
    scriptSource.includes("/_next/static/chunks/")
  );
}

async function clearServiceWorkerState() {
  if ("caches" in window) {
    const cacheNames = await caches.keys();
    await Promise.all(cacheNames.map((cacheName) => caches.delete(cacheName)));
  }

  if ("serviceWorker" in navigator) {
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(registrations.map((registration) => registration.unregister()));
  }
}

export function PWARegistration() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
      return;
    }

    let reloadingForControllerChange = false;

    const recoverFromChunkFailure = () => {
      if (sessionStorage.getItem(CHUNK_RECOVERY_KEY)) {
        return;
      }

      sessionStorage.setItem(CHUNK_RECOVERY_KEY, "1");
      void clearServiceWorkerState().finally(() => {
        window.location.reload();
      });
    };

    const handleError = (event: ErrorEvent) => {
      if (isChunkFailure(event)) {
        recoverFromChunkFailure();
      }
    };

    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      if (isChunkFailure(event)) {
        recoverFromChunkFailure();
      }
    };

    const handleControllerChange = () => {
      if (reloadingForControllerChange || sessionStorage.getItem(SW_RELOAD_KEY)) {
        return;
      }

      reloadingForControllerChange = true;
      sessionStorage.setItem(SW_RELOAD_KEY, "1");
      window.location.reload();
    };

    const register = async () => {
      try {
        const registration = await navigator.serviceWorker.register("/sw.js");
        logDevelopment("registered service worker", registration.scope);

        if (registration.waiting) {
          logDevelopment("found waiting service worker");
          registration.waiting.postMessage({ type: "SKIP_WAITING" });
        }

        registration.addEventListener("updatefound", () => {
          const installingWorker = registration.installing;
          if (!installingWorker) return;

          installingWorker.addEventListener("statechange", () => {
            if (installingWorker.state === "installed" && navigator.serviceWorker.controller) {
              logDevelopment("new service worker installed");
              installingWorker.postMessage({ type: "SKIP_WAITING" });
            }
          });
        });

        await registration.update();
      } catch (error) {
        if (process.env.NODE_ENV === "development") {
          console.warn("Service worker registration failed", error);
        }
      }
    };

    window.addEventListener("error", handleError, true);
    window.addEventListener("unhandledrejection", handleUnhandledRejection);
    navigator.serviceWorker.addEventListener("controllerchange", handleControllerChange);
    void register();

    return () => {
      window.removeEventListener("error", handleError, true);
      window.removeEventListener("unhandledrejection", handleUnhandledRejection);
      navigator.serviceWorker.removeEventListener("controllerchange", handleControllerChange);
    };
  }, []);

  return null;
}
