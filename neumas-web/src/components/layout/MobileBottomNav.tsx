"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type Tab = {
  href: string;
  icon: string;
  label: string;
  center?: boolean;
  isActive: (pathname: string) => boolean;
};

const tabs: Tab[] = [
  {
    href: "/dashboard",
    icon: "⌂",
    label: "Home",
    isActive: (p) => p === "/dashboard" || p === "/dashboard/",
  },
  {
    href: "/dashboard/scans/new",
    icon: "⊕",
    label: "Scan",
    center: true,
    isActive: (p) => p.startsWith("/dashboard/scans"),
  },
  {
    href: "/dashboard/predictions",
    icon: "◈",
    label: "Predict",
    isActive: (p) => p.startsWith("/dashboard/predictions"),
  },
  {
    href: "/dashboard/shopping",
    icon: "⊞",
    label: "Lists",
    isActive: (p) => p.startsWith("/dashboard/shopping"),
  },
  {
    href: "/dashboard/alerts",
    icon: "◎",
    label: "Alerts",
    isActive: (p) => p.startsWith("/dashboard/alerts"),
  },
];

export function MobileBottomNav() {
  const pathname = usePathname() ?? "";

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 border-t border-gray-100 bg-white shadow-lg sm:hidden"
      style={{ paddingBottom: "max(0.5rem, env(safe-area-inset-bottom))" }}
      aria-label="Primary"
    >
      <div className="flex h-16 items-end justify-around px-1 pt-1">
        {tabs.map((tab) => {
          const active = tab.isActive(pathname);

          if (tab.center) {
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className="relative -mt-4 flex min-h-[44px] min-w-[44px] flex-1 flex-col items-center justify-end pb-1"
              >
                <span
                  className={`flex h-14 w-14 items-center justify-center rounded-full text-2xl shadow-md transition-colors ${
                    active ? "bg-blue-600 text-white" : "bg-blue-100 text-blue-600"
                  }`}
                  aria-hidden
                >
                  {tab.icon}
                </span>
                <span
                  className={`mt-0.5 text-sm font-medium ${active ? "text-blue-600" : "text-gray-400"}`}
                >
                  {tab.label}
                </span>
              </Link>
            );
          }

          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`flex min-h-[44px] min-w-[44px] flex-1 flex-col items-center justify-center gap-0.5 pb-1 ${
                active ? "text-blue-600" : "text-gray-400"
              }`}
            >
              <span className="text-xl leading-none" aria-hidden>
                {tab.icon}
              </span>
              <span className="text-sm font-medium">{tab.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
