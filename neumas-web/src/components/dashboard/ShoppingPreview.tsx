"use client";

import { motion } from "framer-motion";
import { ShoppingCart, CheckCircle2, Circle, ArrowRight, Sparkles } from "lucide-react";
import Link from "next/link";
import type { ShoppingListItem } from "@/lib/api/types";
import { normalizeShoppingItem } from "@/lib/api/types";

// ── Priority badge ─────────────────────────────────────────────────────────────

function PriorityDot({ priority }: { priority: string }) {
  const cls =
    priority === "high"
      ? "bg-red-500"
      : priority === "medium"
      ? "bg-amber-500"
      : "bg-neutral-500";
  return <span className={["w-1.5 h-1.5 rounded-full shrink-0 mt-1.5", cls].join(" ")} />;
}

// ── Item row ──────────────────────────────────────────────────────────────────

function ShoppingRow({
  item,
  index,
}: {
  item: ShoppingListItem;
  index: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.05, duration: 0.35, ease: [0.23, 1, 0.32, 1] }}
      className={[
        "flex items-start gap-2.5 py-2.5 border-b border-border/30 last:border-0",
        item.is_purchased ? "opacity-50" : "",
      ].join(" ")}
    >
      <PriorityDot priority={item.priority ?? "low"} />

      <div className="flex-1 min-w-0">
        <p
          className={[
            "text-sm font-medium truncate",
            item.is_purchased ? "line-through text-muted-foreground" : "text-foreground",
          ].join(" ")}
        >
          {item.name}
        </p>
        <p className="text-xs text-muted-foreground">
          {item.quantity} {item.unit}
          {item.estimated_price ? ` · ~$${item.estimated_price.toFixed(2)}` : ""}
        </p>
        {item.reason && (
          <p className="text-xs text-muted-foreground/60 mt-0.5 truncate">{item.reason}</p>
        )}
      </div>

      {item.is_purchased ? (
        <CheckCircle2 className="w-4 h-4 text-mint-500 shrink-0 mt-0.5" />
      ) : (
        <Circle className="w-4 h-4 text-muted-foreground/30 shrink-0 mt-0.5" />
      )}
    </motion.div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

interface ShoppingPreviewProps {
  items:   ShoppingListItem[];
  loading: boolean;
}

export function ShoppingPreview({ items, loading }: ShoppingPreviewProps) {
  const safeItems = Array.isArray(items) ? items.map(normalizeShoppingItem) : [];
  const preview   = safeItems.slice(0, 6);
  const purchased = safeItems.filter((i) => i.is_purchased).length;

  return (
    <div className="glass-card rounded-2xl p-5 h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-4 shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-amber-500/20 flex items-center justify-center">
            <ShoppingCart className="w-4 h-4 text-amber-400" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-foreground">Shopping List</h3>
            <p className="text-xs text-muted-foreground">
              {purchased}/{safeItems.length} purchased
            </p>
          </div>
        </div>
        <Link
          href="/dashboard/shopping"
          className="flex items-center gap-1 text-xs text-cyan-500 hover:text-cyan-400 transition-colors font-medium"
        >
          View all
          <ArrowRight className="w-3 h-3" />
        </Link>
      </div>

      {/* Progress bar */}
      {safeItems.length > 0 && (
        <div className="h-1 rounded-full bg-surface-2 mb-4 overflow-hidden shrink-0">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${Math.round((purchased / safeItems.length) * 100)}%` }}
            transition={{ duration: 0.8, ease: [0.23, 1, 0.32, 1] }}
            className="h-full rounded-full bg-mint-500"
          />
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {loading ? (
          <div className="space-y-3">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-10 rounded shimmer" />
            ))}
          </div>
        ) : preview.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full py-6 text-center">
            <div className="w-10 h-10 rounded-full bg-amber-500/15 flex items-center justify-center mb-2">
              <Sparkles className="w-5 h-5 text-amber-400" />
            </div>
            <p className="text-sm text-muted-foreground">No shopping list yet.</p>
            <Link
              href="/dashboard/shopping"
              className="mt-2 text-xs text-cyan-500 hover:text-cyan-400 transition-colors"
            >
              Generate a list →
            </Link>
          </div>
        ) : (
          <div>
            {preview.map((item, i) => (
              <ShoppingRow key={item.id} item={item} index={i} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
