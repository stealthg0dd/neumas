"use client";

import { motion } from "framer-motion";
import { Package, ArrowRight } from "lucide-react";
import Link from "next/link";
import type { InventoryItem } from "@/lib/api/types";

// ── Status badge ──────────────────────────────────────────────────────────────

function StockBadge({ status }: { status: string }) {
  switch (status) {
    case "critical":
      return <span className="badge-red shrink-0">Critical</span>;
    case "low":
      return <span className="badge-amber shrink-0">Low</span>;
    case "in_stock":
      return <span className="badge-mint shrink-0">In Stock</span>;
    default:
      return <span className="badge-cyan shrink-0 capitalize">{status}</span>;
  }
}

// ── Item row ──────────────────────────────────────────────────────────────────

function ItemRow({ item, index }: { item: InventoryItem; index: number }) {
  const pct =
    item.par_level && item.par_level > 0
      ? Math.min(100, Math.round((item.quantity / item.par_level) * 100))
      : null;

  const barColor =
    item.stock_status === "critical"
      ? "bg-red-500"
      : item.stock_status === "low"
      ? "bg-amber-500"
      : "bg-mint-500";

  return (
    <motion.div
      initial={{ opacity: 0, x: -12 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.05, duration: 0.35, ease: [0.23, 1, 0.32, 1] }}
      className="flex items-center gap-3 py-2.5 border-b border-border/30 last:border-0 group"
    >
      {/* Name */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground truncate group-hover:text-cyan-400 transition-colors">
          {item.name}
        </p>
        <p className="text-xs text-muted-foreground">
          {item.quantity} {item.unit}
          {item.par_level ? ` / ${item.par_level} par` : ""}
        </p>
      </div>

      {/* Progress bar (if par level known) */}
      {pct !== null && (
        <div className="w-16 shrink-0">
          <div className="h-1.5 rounded-full bg-surface-2 overflow-hidden">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${pct}%` }}
              transition={{ delay: index * 0.05 + 0.2, duration: 0.6, ease: [0.23, 1, 0.32, 1] }}
              className={["h-full rounded-full", barColor].join(" ")}
            />
          </div>
          <p className="text-[10px] text-muted-foreground text-right mt-0.5">{pct}%</p>
        </div>
      )}

      {/* Badge */}
      <StockBadge status={item.stock_status ?? "unknown"} />
    </motion.div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

interface InventoryPreviewProps {
  items:   InventoryItem[];
  total:   number;
  loading: boolean;
}

export function InventoryPreview({ items, total, loading }: InventoryPreviewProps) {
  const safeItems = Array.isArray(items) ? items : [];
  const preview   = safeItems.slice(0, 8);

  return (
    <div className="glass-card rounded-2xl p-5 h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-4 shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-purple-500/20 flex items-center justify-center">
            <Package className="w-4 h-4 text-purple-400" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-foreground">Inventory</h3>
            <p className="text-xs text-muted-foreground">{total} items tracked</p>
          </div>
        </div>
        <Link
          href="/dashboard/inventory"
          className="flex items-center gap-1 text-xs text-cyan-500 hover:text-cyan-400 transition-colors font-medium"
        >
          View all
          <ArrowRight className="w-3 h-3" />
        </Link>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {loading ? (
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-10 rounded shimmer" />
            ))}
          </div>
        ) : preview.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full py-8 text-center">
            <Package className="w-8 h-8 text-muted-foreground/40 mb-2" />
            <p className="text-sm text-muted-foreground">No inventory items yet.</p>
            <Link
              href="/dashboard/inventory"
              className="mt-2 text-xs text-cyan-500 hover:text-cyan-400 transition-colors"
            >
              Add your first item →
            </Link>
          </div>
        ) : (
          <div className="divide-y-0">
            {preview.map((item, i) => (
              <ItemRow key={item.id} item={item} index={i} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
