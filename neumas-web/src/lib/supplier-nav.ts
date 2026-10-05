import {
  Boxes,
  CalendarClock,
  CircleDollarSign,
  FileText,
  Handshake,
  KeyRound,
  LayoutDashboard,
  Package,
  Settings,
  Truck,
} from "lucide-react";

import type { WorkspaceNavItem } from "@/lib/navigation";

export const SUPPLIER_NAV: WorkspaceNavItem[] = [
  { href: "/supplier", label: "Overview", icon: LayoutDashboard, match: (p) => p === "/supplier" || p === "/supplier/" },
  { href: "/supplier/catalog", label: "Catalog", icon: Package, match: (p) => p.startsWith("/supplier/catalog") },
  { href: "/supplier/availability", label: "Availability", icon: Boxes, match: (p) => p.startsWith("/supplier/availability") },
  { href: "/supplier/rfqs", label: "RFQs", icon: FileText, match: (p) => p.startsWith("/supplier/rfqs") },
  { href: "/supplier/offers", label: "Offers", icon: Handshake, match: (p) => p.startsWith("/supplier/offers") },
  { href: "/supplier/orders", label: "Orders", icon: Truck, match: (p) => p.startsWith("/supplier/orders") },
  { href: "/supplier/agent-api", label: "Agent API", icon: KeyRound, match: (p) => p.startsWith("/supplier/agent-api") },
  { href: "/supplier/settings", label: "Settings", icon: Settings, match: (p) => p.startsWith("/supplier/settings") },
];

export const SUPPLIER_ONBOARDING_STEPS = [
  { key: "profile", label: "Profile" },
  { key: "service_areas", label: "Service areas" },
  { key: "catalog", label: "Catalog" },
  { key: "pricing", label: "Pricing" },
  { key: "availability", label: "Availability" },
  { key: "moq_pack", label: "MOQ / pack" },
  { key: "delivery", label: "Delivery" },
  { key: "commercial_terms", label: "Commercial terms" },
  { key: "activate", label: "Activate agent" },
] as const;

export { CalendarClock, CircleDollarSign };
