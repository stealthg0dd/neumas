"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { useAuthStore } from "@/lib/store/auth";
import { getNavigationForWorkspace } from "@/lib/navigation";
import { resolveWorkspaceExperience } from "@/lib/workspace-experience";
import { cn } from "@/lib/utils";

export function MobileBottomNav() {
  const pathname = usePathname() ?? "";
  const profile = useAuthStore((s) => s.profile);
  const navigation = getNavigationForWorkspace(
    resolveWorkspaceExperience(profile),
    profile?.role
  );
  const items = navigation.primary.slice(0, 5);

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t border-gray-200 bg-white/95 backdrop-blur md:hidden"
      style={{ paddingBottom: "max(0.5rem, env(safe-area-inset-bottom))" }}
      aria-label="Mobile navigation"
    >
      <div className="grid grid-cols-5 gap-1 px-2 pt-2">
        {items.map((item) => {
          const active = item.match ? item.match(pathname) : pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex min-h-[56px] flex-col items-center justify-center gap-1 rounded-xl px-2 py-2 text-xs font-medium transition-colors",
                active ? "bg-blue-50 text-blue-700" : "text-gray-500 hover:bg-gray-50 hover:text-gray-900"
              )}
            >
              <item.icon className="h-5 w-5" />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
