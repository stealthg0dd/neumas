import {
  AlertTriangle,
  BarChart3,
  Bell,
  Camera,
  Clock3,
  Cog,
  History,
  Home,
  Package,
  Receipt,
  Settings,
  Shield,
  ShoppingCart,
  Sparkles,
  TrendingUp,
  Wallet,
} from "lucide-react";

import type { LucideIcon } from "lucide-react";
import type { WorkspaceExperience } from "@/lib/api/types";

export interface WorkspaceNavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  match?: (pathname: string) => boolean;
}

interface WorkspaceNavigation {
  primary: WorkspaceNavItem[];
  admin: WorkspaceNavItem[];
  allowedPrefixes: string[];
  dashboardTitle: string;
  dashboardEyebrow: string;
  dashboardDescription: string;
}

function startsWith(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

function routeMatchesPrefix(pathname: string, prefix: string): boolean {
  if (prefix === "/dashboard") {
    return pathname === "/dashboard" || pathname === "/dashboard/";
  }
  return startsWith(pathname, prefix);
}

const FNB_PRIMARY: WorkspaceNavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: Home, match: (p) => p === "/dashboard" || p === "/dashboard/" },
  { href: "/dashboard/inventory", label: "Inventory", icon: Package, match: (p) => startsWith(p, "/dashboard/inventory") },
  { href: "/dashboard/scans", label: "Scans", icon: Camera, match: (p) => startsWith(p, "/dashboard/scans") },
  { href: "/dashboard/predictions", label: "Predictions", icon: TrendingUp, match: (p) => startsWith(p, "/dashboard/predictions") },
  { href: "/dashboard/shopping", label: "Shopping", icon: ShoppingCart, match: (p) => startsWith(p, "/dashboard/shopping") || startsWith(p, "/dashboard/restock") },
  { href: "/dashboard/analytics", label: "Insights", icon: BarChart3, match: (p) => startsWith(p, "/dashboard/analytics") || startsWith(p, "/dashboard/reports") },
  { href: "/dashboard/alerts", label: "Alerts", icon: Bell, match: (p) => startsWith(p, "/dashboard/alerts") },
  { href: "/dashboard/settings", label: "Settings", icon: Settings, match: (p) => startsWith(p, "/dashboard/settings") },
];

const FNB_ADMIN: WorkspaceNavItem[] = [
  { href: "/dashboard/admin", label: "Admin", icon: Shield, match: (p) => startsWith(p, "/dashboard/admin") },
  { href: "/dashboard/vendors", label: "Vendors", icon: Cog, match: (p) => startsWith(p, "/dashboard/vendors") },
];

const HOUSEHOLD_PRIMARY: WorkspaceNavItem[] = [
  { href: "/dashboard", label: "Home", icon: Home, match: (p) => p === "/dashboard" || p === "/dashboard/" },
  { href: "/dashboard/inventory", label: "My Pantry", icon: Package, match: (p) => startsWith(p, "/dashboard/inventory") },
  { href: "/dashboard/scans/new", label: "Scan Receipt", icon: Receipt, match: (p) => p === "/dashboard/scans/new" },
  { href: "/dashboard/shopping", label: "Smart List", icon: ShoppingCart, match: (p) => startsWith(p, "/dashboard/shopping") },
  { href: "/dashboard/alerts", label: "Use Soon", icon: Clock3, match: (p) => startsWith(p, "/dashboard/alerts") },
  { href: "/dashboard/analytics", label: "Spending", icon: Wallet, match: (p) => startsWith(p, "/dashboard/analytics") },
  { href: "/dashboard/predictions", label: "Savings", icon: Sparkles, match: (p) => startsWith(p, "/dashboard/predictions") },
  { href: "/dashboard/scans", label: "History", icon: History, match: (p) => startsWith(p, "/dashboard/scans") && p !== "/dashboard/scans/new" },
  { href: "/dashboard/settings", label: "Household", icon: AlertTriangle, match: (p) => startsWith(p, "/dashboard/settings") },
];

const HOUSEHOLD_SECONDARY: WorkspaceNavItem[] = [
  { href: "/dashboard/settings", label: "Settings", icon: Settings, match: (p) => startsWith(p, "/dashboard/settings") },
];

const FNB_ALLOWED_PREFIXES = [
  "/dashboard",
  "/dashboard/inventory",
  "/dashboard/scans",
  "/dashboard/predictions",
  "/dashboard/shopping",
  "/dashboard/alerts",
  "/dashboard/analytics",
  "/dashboard/reports",
  "/dashboard/settings",
  "/dashboard/restock",
  "/dashboard/documents",
  "/dashboard/vendors",
  "/dashboard/admin",
];

const HOUSEHOLD_ALLOWED_PREFIXES = [
  "/dashboard",
  "/dashboard/inventory",
  "/dashboard/scans",
  "/dashboard/predictions",
  "/dashboard/shopping",
  "/dashboard/alerts",
  "/dashboard/analytics",
  "/dashboard/settings",
  "/dashboard/documents",
];

export function getNavigationForWorkspace(
  workspaceExperience: WorkspaceExperience | undefined,
  role: string | undefined
): WorkspaceNavigation {
  const isHousehold = workspaceExperience === "HOUSEHOLD";
  const isAdmin = role === "admin" || role === "super_admin";

  if (isHousehold) {
    return {
      primary: HOUSEHOLD_PRIMARY,
      admin: isAdmin ? HOUSEHOLD_SECONDARY : HOUSEHOLD_SECONDARY,
      allowedPrefixes: HOUSEHOLD_ALLOWED_PREFIXES,
      dashboardTitle: "Household Home",
      dashboardEyebrow: "Household snapshot",
      dashboardDescription: "Track pantry state, what is running low, what to use soon, and what to buy next.",
    };
  }

  return {
    primary: FNB_PRIMARY,
    admin: isAdmin ? FNB_ADMIN : [],
    allowedPrefixes: isAdmin ? FNB_ALLOWED_PREFIXES : FNB_ALLOWED_PREFIXES.filter((prefix) => prefix !== "/dashboard/admin"),
    dashboardTitle: "Command Center",
    dashboardEyebrow: "Executive summary",
    dashboardDescription: "Login -> scan -> analyze -> reorder -> repeat. Built for daily operator decisions.",
  };
}

export function isRouteAllowedForWorkspace(
  pathname: string,
  workspaceExperience: WorkspaceExperience | undefined,
  role: string | undefined
): boolean {
  const navigation = getNavigationForWorkspace(workspaceExperience, role);
  return navigation.allowedPrefixes.some((prefix) => routeMatchesPrefix(pathname, prefix));
}
