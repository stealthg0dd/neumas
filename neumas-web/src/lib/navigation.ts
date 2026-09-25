import {
  AlertTriangle,
  BarChart3,
  Bell,
  Clock3,
  Cog,
  FileText,
  History,
  Home,
  LineChart,
  Package,
  Receipt,
  Settings,
  Shield,
  ShoppingCart,
  Sparkles,
  Truck,
  Wallet,
  Workflow,
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
  { href: "/dashboard", label: "Overview", icon: Home, match: (p) => p === "/dashboard" || p === "/dashboard/" },
  { href: "/dashboard/margin", label: "Margin", icon: Wallet, match: (p) => startsWith(p, "/dashboard/margin") },
  { href: "/dashboard/demand", label: "Demand", icon: LineChart, match: (p) => startsWith(p, "/dashboard/demand") || startsWith(p, "/dashboard/predictions") },
  { href: "/dashboard/inventory", label: "Inventory", icon: Package, match: (p) => startsWith(p, "/dashboard/inventory") },
  { href: "/dashboard/procurement/recommendations", label: "Procurement", icon: ShoppingCart, match: (p) => startsWith(p, "/dashboard/procurement") || startsWith(p, "/dashboard/shopping") || startsWith(p, "/dashboard/restock") || startsWith(p, "/dashboard/vendors") },
  { href: "/dashboard/invoices", label: "Invoices", icon: Receipt, match: (p) => startsWith(p, "/dashboard/invoices") || startsWith(p, "/dashboard/documents") || startsWith(p, "/dashboard/scans") },
  { href: "/dashboard/recipes", label: "Recipes", icon: FileText, match: (p) => startsWith(p, "/dashboard/recipes") },
  { href: "/dashboard/waste", label: "Waste", icon: AlertTriangle, match: (p) => startsWith(p, "/dashboard/waste") },
  { href: "/dashboard/exceptions", label: "Exceptions", icon: Bell, match: (p) => startsWith(p, "/dashboard/exceptions") || startsWith(p, "/dashboard/alerts") },
  { href: "/dashboard/agent-center", label: "Agent Center", icon: Sparkles, match: (p) => startsWith(p, "/dashboard/agent-center") },
  { href: "/dashboard/decisions", label: "Decisions", icon: Workflow, match: (p) => startsWith(p, "/dashboard/decisions") },
  { href: "/dashboard/integrations", label: "Integrations", icon: Truck, match: (p) => startsWith(p, "/dashboard/integrations") },
  { href: "/dashboard/reports", label: "Reports", icon: BarChart3, match: (p) => startsWith(p, "/dashboard/reports") || startsWith(p, "/dashboard/analytics") },
  { href: "/dashboard/settings", label: "Settings", icon: Settings, match: (p) => startsWith(p, "/dashboard/settings") },
];

const FNB_ADMIN: WorkspaceNavItem[] = [
  { href: "/dashboard/admin", label: "Admin", icon: Shield, match: (p) => startsWith(p, "/dashboard/admin") },
  { href: "/dashboard/procurement/suppliers", label: "Suppliers", icon: Cog, match: (p) => startsWith(p, "/dashboard/procurement/suppliers") || startsWith(p, "/dashboard/vendors") },
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
  "/dashboard/margin",
  "/dashboard/demand",
  "/dashboard/scans",
  "/dashboard/predictions",
  "/dashboard/shopping",
  "/dashboard/procurement",
  "/dashboard/alerts",
  "/dashboard/exceptions",
  "/dashboard/invoices",
  "/dashboard/recipes",
  "/dashboard/waste",
  "/dashboard/agent-center",
  "/dashboard/decisions",
  "/dashboard/integrations",
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
