"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { LogOut, Menu } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { SUPPLIER_NAV } from "@/lib/supplier-nav";
import { logout } from "@/lib/api/endpoints";
import { useAuthStore, selectHasSession } from "@/lib/store/auth";
import { cn } from "@/lib/utils";

export default function SupplierShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname() ?? "/supplier";
  const hasSession = useAuthStore(selectHasSession);
  const hasHydrated = useAuthStore((s) => s._hasHydrated);
  const profile = useAuthStore((s) => s.profile);
  const clearAuth = useAuthStore((s) => s.clearAuth);
  const [ready, setReady] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    if (!hasHydrated) return;
    if (hasSession) {
      setReady(true);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const { rehydrateSession } = await import("@/lib/auth-session");
        await rehydrateSession();
        if (cancelled) return;
        if (!useAuthStore.getState().token) {
          router.replace("/auth?next=/supplier");
          return;
        }
        setReady(true);
      } catch {
        if (!cancelled) router.replace("/auth?next=/supplier");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [hasHydrated, hasSession, router]);

  async function handleLogout() {
    try {
      await logout();
    } catch {
      /* ignore */
    }
    clearAuth();
    router.replace("/auth");
  }

  if (!ready) {
    return (
      <main className="min-h-screen bg-slate-50 px-4 py-8">
        <div className="mx-auto grid max-w-7xl gap-3 md:grid-cols-12">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="col-span-3 h-20 animate-pulse rounded-lg bg-white" />
          ))}
        </div>
      </main>
    );
  }

  const nav = (
    <nav className="space-y-1">
      {SUPPLIER_NAV.map((item) => {
        const active = item.match ? item.match(pathname) : pathname === item.href;
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={() => setSidebarOpen(false)}
            className={cn(
              "flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition",
              active ? "bg-slate-950 text-white" : "text-slate-600 hover:bg-slate-100",
            )}
          >
            <Icon className="h-4 w-4" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto grid max-w-[1400px] gap-0 lg:grid-cols-12">
        <aside className="hidden border-r border-slate-200 bg-white p-4 lg:col-span-2 lg:block">
          <p className="text-xs font-semibold uppercase tracking-wide text-sky-700">Supplier Network</p>
          <h1 className="mt-1 text-lg font-semibold text-slate-950">Workspace</h1>
          <p className="mt-1 truncate text-xs text-slate-500">{profile?.email}</p>
          <div className="mt-6">{nav}</div>
          <button
            onClick={() => void handleLogout()}
            className="mt-8 flex items-center gap-2 px-3 text-sm text-slate-500 hover:text-slate-900"
          >
            <LogOut className="h-4 w-4" /> Sign out
          </button>
        </aside>
        <div className="lg:col-span-10">
          <header className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 lg:hidden">
            <div>
              <p className="text-xs font-semibold uppercase text-sky-700">Supplier</p>
              <p className="text-sm font-semibold text-slate-950">Workspace</p>
            </div>
            <Button variant="outline" size="icon" onClick={() => setSidebarOpen(true)} aria-label="Open menu">
              <Menu className="h-4 w-4" />
            </Button>
          </header>
          <div className="p-4 sm:p-6">{children}</div>
        </div>
      </div>
      <Dialog open={sidebarOpen} onOpenChange={setSidebarOpen}>
        <DialogContent className="left-0 top-0 h-full max-w-xs translate-x-0 translate-y-0 rounded-none p-4">
          {nav}
        </DialogContent>
      </Dialog>
    </div>
  );
}
