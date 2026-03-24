"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  LayoutDashboard,
  Package,
  ScanLine,
  TrendingUp,
  ShoppingCart,
  BarChart2,
  Settings,
  Zap,
  ChevronLeft,
  ChevronRight,
  LogOut,
} from "lucide-react";

import { useUIStore } from "@/lib/store/ui";
import { useAuthStore } from "@/lib/store/auth";
import { logout } from "@/lib/api/endpoints";
import { useRouter } from "next/navigation";

// ── Nav items ─────────────────────────────────────────────────────────────────

const NAV_ITEMS = [
  { href: "/dashboard",             label: "Dashboard",   icon: LayoutDashboard },
  { href: "/dashboard/inventory",   label: "Inventory",   icon: Package },
  { href: "/dashboard/scans",       label: "Scans",       icon: ScanLine },
  { href: "/dashboard/predictions", label: "Predictions", icon: TrendingUp },
  { href: "/dashboard/shopping",    label: "Shopping",    icon: ShoppingCart },
  { href: "/dashboard/analytics",   label: "Analytics",   icon: BarChart2 },
  { href: "/dashboard/settings",    label: "Settings",    icon: Settings },
];

// ── Component ──────────────────────────────────────────────────────────────────

export function Sidebar() {
  const pathname    = usePathname();
  const router      = useRouter();
  const collapsed   = useUIStore((s) => s.sidebarCollapsed);
  const toggle      = useUIStore((s) => s.toggleSidebarCollapsed);
  const profile     = useAuthStore((s) => s.profile);
  const clearAuth   = useAuthStore((s) => s.clearAuth);

  async function handleLogout() {
    try { await logout(); } catch { /* swallow */ }
    clearAuth();
    router.replace("/login");
  }

  return (
    <motion.aside
      animate={{ width: collapsed ? 64 : 240 }}
      transition={{ duration: 0.25, ease: [0.23, 1, 0.32, 1] }}
      className="relative flex flex-col h-full glass-heavy border-r border-border/50 shrink-0 overflow-hidden"
    >
      {/* ── Logo ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center h-16 px-4 border-b border-border/40">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-500 to-purple-500 flex items-center justify-center shrink-0">
            <Zap className="w-4 h-4 text-white" />
          </div>
          <AnimatePresence>
            {!collapsed && (
              <motion.span
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -8 }}
                transition={{ duration: 0.2 }}
                className="text-lg font-bold gradient-text tracking-tight whitespace-nowrap"
              >
                Neumas
              </motion.span>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* ── Nav ──────────────────────────────────────────────────────────── */}
      <nav className="flex-1 py-4 px-2 space-y-0.5 overflow-y-auto">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || (href !== "/dashboard" && pathname.startsWith(href));
          return (
            <Link
              key={href}
              href={href}
              className={[
                "flex items-center gap-3 h-10 px-3 rounded-lg text-sm font-medium transition-all group",
                active
                  ? "bg-cyan-500/15 text-cyan-400 border border-cyan-500/25"
                  : "text-muted-foreground hover:text-foreground hover:bg-surface-2",
              ].join(" ")}
              title={collapsed ? label : undefined}
            >
              <Icon
                className={[
                  "w-4 h-4 shrink-0 transition-colors",
                  active ? "text-cyan-400" : "text-muted-foreground group-hover:text-foreground",
                ].join(" ")}
              />
              <AnimatePresence>
                {!collapsed && (
                  <motion.span
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.15 }}
                    className="truncate"
                  >
                    {label}
                  </motion.span>
                )}
              </AnimatePresence>

              {/* Active indicator pill */}
              {active && (
                <motion.div
                  layoutId="nav-active"
                  className="ml-auto w-1.5 h-1.5 rounded-full bg-cyan-400 shrink-0"
                  transition={{ type: "spring", stiffness: 400, damping: 30 }}
                />
              )}
            </Link>
          );
        })}
      </nav>

      {/* ── User + Logout ─────────────────────────────────────────────────── */}
      <div className="border-t border-border/40 p-2 space-y-0.5">
        {/* User info row */}
        {!collapsed && profile && (
          <div className="px-3 py-2">
            <p className="text-xs font-medium text-foreground/80 truncate">
              {profile.full_name || profile.email}
            </p>
            <p className="text-xs text-muted-foreground truncate">{profile.org_name}</p>
          </div>
        )}

        {/* Logout */}
        <button
          onClick={handleLogout}
          className="flex items-center gap-3 w-full h-10 px-3 rounded-lg text-sm text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-all"
          title={collapsed ? "Logout" : undefined}
        >
          <LogOut className="w-4 h-4 shrink-0" />
          <AnimatePresence>
            {!collapsed && (
              <motion.span
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="text-sm"
              >
                Logout
              </motion.span>
            )}
          </AnimatePresence>
        </button>
      </div>

      {/* ── Collapse toggle ────────────────────────────────────────────────── */}
      <button
        onClick={toggle}
        className="absolute -right-3 top-20 z-10 w-6 h-6 rounded-full bg-surface-2 border border-border/60 flex items-center justify-center text-muted-foreground hover:text-foreground hover:border-cyan-500/50 transition-all shadow-sm"
        aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
      >
        {collapsed
          ? <ChevronRight className="w-3 h-3" />
          : <ChevronLeft  className="w-3 h-3" />
        }
      </button>
    </motion.aside>
  );
}
