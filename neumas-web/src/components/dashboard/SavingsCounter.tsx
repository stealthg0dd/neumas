"use client";

import { useEffect, useRef, useState } from "react";
import { motion, useSpring, useMotionValue, animate } from "framer-motion";
import { TrendingUp, TrendingDown, DollarSign } from "lucide-react";

// ── Animated number hook ───────────────────────────────────────────────────────

function useCountUp(target: number, duration = 1.8) {
  const [display, setDisplay] = useState(0);
  const hasRun = useRef(false);

  useEffect(() => {
    if (hasRun.current) return;
    hasRun.current = true;

    const controls = animate(0, target, {
      duration,
      ease: [0.23, 1, 0.32, 1],
      onUpdate: (v) => setDisplay(Math.round(v)),
    });

    return () => controls.stop();
  }, [target, duration]);

  return display;
}

// ── Stat card ─────────────────────────────────────────────────────────────────

interface StatCardProps {
  label:       string;
  value:       number;
  unit?:       string;
  prefix?:     string;
  trend?:      number;   // percent change vs last period (positive = good)
  trendLabel?: string;
  index?:      number;
  format?:     "number" | "currency" | "percent";
  accentClass?: string;  // gradient class for the value text
}

export function StatCard({
  label,
  value,
  unit,
  prefix,
  trend,
  trendLabel = "vs last month",
  index = 0,
  format = "currency",
  accentClass = "gradient-text",
}: StatCardProps) {
  const count = useCountUp(value);

  const formatted =
    format === "currency"
      ? count.toLocaleString("en-US")
      : format === "percent"
      ? count.toFixed(1)
      : count.toLocaleString();

  const trendPositive = (trend ?? 0) >= 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.07, duration: 0.5, ease: [0.23, 1, 0.32, 1] }}
      className="glass-card rounded-2xl p-5 flex flex-col gap-3 h-full"
    >
      {/* Icon row */}
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          {label}
        </span>
        <div className="w-8 h-8 rounded-lg bg-cyan-500/15 flex items-center justify-center">
          <DollarSign className="w-4 h-4 text-cyan-400" />
        </div>
      </div>

      {/* Value */}
      <div className="flex items-baseline gap-1">
        {prefix && (
          <span className={["text-xl font-bold", accentClass].join(" ")}>
            {prefix}
          </span>
        )}
        <span className={["text-3xl font-bold tabular-nums tracking-tight", accentClass].join(" ")}>
          {formatted}
        </span>
        {unit && (
          <span className="text-sm font-medium text-muted-foreground ml-0.5">
            {unit}
          </span>
        )}
      </div>

      {/* Trend */}
      {trend !== undefined && (
        <div className="flex items-center gap-1.5 mt-auto">
          {trendPositive ? (
            <TrendingUp className="w-3.5 h-3.5 text-mint-500 shrink-0" />
          ) : (
            <TrendingDown className="w-3.5 h-3.5 text-red-400 shrink-0" />
          )}
          <span
            className={[
              "text-xs font-semibold",
              trendPositive ? "text-mint-500" : "text-red-400",
            ].join(" ")}
          >
            {trendPositive ? "+" : ""}
            {trend.toFixed(1)}%
          </span>
          <span className="text-xs text-muted-foreground">{trendLabel}</span>
        </div>
      )}
    </motion.div>
  );
}

// ── Savings counter (primary hero stat) ───────────────────────────────────────

interface SavingsCounterProps {
  totalSaved:      number;   // dollars
  wasteReduction:  number;   // percent
  activePredictions: number;
  loading?:        boolean;
}

export function SavingsCounter({
  totalSaved,
  wasteReduction,
  activePredictions,
  loading = false,
}: SavingsCounterProps) {
  const savedCount      = useCountUp(totalSaved, 2);
  const wasteCount      = useCountUp(wasteReduction, 1.5);
  const predCount       = useCountUp(activePredictions, 1.2);

  if (loading) {
    return (
      <div className="glass-card rounded-2xl p-5 h-full space-y-4">
        <div className="h-4 w-24 rounded shimmer" />
        <div className="h-10 w-36 rounded shimmer" />
        <div className="h-3 w-32 rounded shimmer" />
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.5, ease: [0.23, 1, 0.32, 1] }}
      className="glass-card rounded-2xl p-5 h-full flex flex-col gap-4"
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          Total savings this month
        </span>
        <span className="badge-mint">Live</span>
      </div>

      {/* Big number */}
      <div className="flex items-baseline gap-1">
        <span className="text-xl font-bold gradient-text">$</span>
        <span className="text-4xl font-bold tabular-nums tracking-tight gradient-text">
          {savedCount.toLocaleString("en-US")}
        </span>
      </div>

      <div className="flex items-center gap-1.5">
        <TrendingUp className="w-3.5 h-3.5 text-mint-500" />
        <span className="text-xs font-semibold text-mint-500">+12.4%</span>
        <span className="text-xs text-muted-foreground">vs last month</span>
      </div>

      {/* Mini stats */}
      <div className="grid grid-cols-2 gap-3 mt-auto pt-3 border-t border-border/40">
        <div>
          <p className="text-xs text-muted-foreground mb-0.5">Waste reduced</p>
          <p className="text-lg font-bold text-mint-500 tabular-nums">
            {wasteCount.toFixed(0)}%
          </p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground mb-0.5">Active predictions</p>
          <p className="text-lg font-bold text-cyan-400 tabular-nums">
            {predCount}
          </p>
        </div>
      </div>
    </motion.div>
  );
}
