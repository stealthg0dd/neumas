"use client";

import { Toaster } from "sonner";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <>
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
    </>
  );
}
