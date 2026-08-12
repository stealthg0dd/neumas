"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LogOut,
} from "lucide-react";

import { useAuthStore } from "@/lib/store/auth";
import { logout } from "@/lib/api/endpoints";
import { cn } from "@/lib/utils";
import { getNavigationForWorkspace } from "@/lib/navigation";
import { resolveWorkspaceExperience } from "@/lib/workspace-experience";

interface SidebarProps {
  className?: string;
  onNavigate?: () => void;
}

export function Sidebar({ className, onNavigate }: SidebarProps) {
  const pathname = usePathname() || "";
  const router = useRouter();
  const profile = useAuthStore((s) => s.profile);
  const clearAuth = useAuthStore((s) => s.clearAuth);
  const displayName = profile?.full_name || profile?.email?.split("@")[0] || "User";
  const workspaceExperience = resolveWorkspaceExperience(profile);
  const navigation = getNavigationForWorkspace(workspaceExperience, profile?.role);
  const subtitle = workspaceExperience === "HOUSEHOLD"
    ? "Pantry and grocery intelligence"
    : "Shift-ready control center";

  async function handleLogout() {
    try {
      await logout();
    } catch {
      /* clear client state even if API logout fails */
    }
    clearAuth();
    onNavigate?.();
    router.replace("/auth");
  }

  return (
    <aside
      className={cn(
        "flex h-full min-h-0 w-full flex-col bg-white",
        className
      )}
    >
      <div className="flex h-16 shrink-0 items-center border-b border-gray-100 px-5">
        <div>
          <span className="block text-lg font-semibold text-gray-900">Neumas</span>
          <span className="block text-xs text-gray-400">{subtitle}</span>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4">
        <div className="space-y-1">
          {navigation.primary.map(({ href, label, icon: Icon, match }) => {
            const active = match ? match(pathname) : pathname === href || (href !== "/dashboard" && pathname.startsWith(href));
            return (
              <Link
                key={href}
                href={href}
                onClick={onNavigate}
                className={cn(
                  "flex min-h-[44px] items-center gap-3 rounded-xl border border-transparent px-3 py-2.5 text-sm transition-colors",
                  active
                    ? "border-blue-100 bg-blue-50 text-blue-700"
                    : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span>{label}</span>
              </Link>
            );
          })}
        </div>

        {navigation.admin.length > 0 && (
          <div className="mt-5 border-t border-gray-100 pt-4">
            <p className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-gray-400">
              {workspaceExperience === "HOUSEHOLD" ? "Workspace" : "Admin"}
            </p>
            <div className="space-y-1">
              {navigation.admin.map(({ href, label, icon: Icon, match }) => {
                const active = match ? match(pathname) : pathname === href || pathname.startsWith(`${href}/`);
                return (
                  <Link
                    key={href}
                    href={href}
                    onClick={onNavigate}
                    className={cn(
                      "flex min-h-[44px] items-center gap-3 rounded-xl border border-transparent px-3 py-2.5 text-sm transition-colors",
                      active
                        ? "border-blue-100 bg-blue-50 text-blue-700"
                        : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                    )}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    <span>{label}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        )}
      </nav>

      <div className="border-t border-gray-100 p-4">
        <p className="truncate text-sm font-medium text-gray-900">{displayName}</p>
        <p className="truncate text-xs text-gray-400">{profile?.email ?? "Signed in"}</p>
        <button
          onClick={handleLogout}
          className="mt-3 flex min-h-[44px] w-full items-center gap-2 rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-600 transition-colors hover:bg-gray-50 hover:text-gray-900"
        >
          <LogOut className="h-4 w-4" />
          <span>Sign out</span>
        </button>
      </div>
    </aside>
  );
}
