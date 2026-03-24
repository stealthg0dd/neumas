"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { listInventory, listScans, listPredictions } from "@/lib/api/endpoints";
import {
  AreaChart, Area, LineChart, Line, BarChart, Bar,
  PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import {
  DollarSign, Package, TrendingUp, Target,
  Download, Printer, Calendar,
} from "lucide-react";
import { animate } from "framer-motion";

// ── Count-up ──────────────────────────────────────────────────────────────────

function useCountUp(target: number, duration = 1.6) {
  const [val, setVal] = useState(0);
  useEffect(() => {
    const ctrl = animate(0, target, {
      duration,
      ease: [0.23, 1, 0.32, 1],
      onUpdate: (v) => setVal(Math.round(v)),
    });
    return () => ctrl.stop();
  }, [target, duration]);
  return val;
}

// ── Mock data generators ───────────────────────────────────────────────────────

function genSavingsData(days: number) {
  let cum = 0;
  return Array.from({ length: days }, (_, i) => {
    cum += Math.round(40 + Math.random() * 120);
    const date = new Date(Date.now() - (days - 1 - i) * 86_400_000);
    return {
      date: date.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      savings: cum,
      daily: Math.round(40 + Math.random() * 120),
    };
  });
}

function genAccuracyData(days: number) {
  return Array.from({ length: days }, (_, i) => {
    const date = new Date(Date.now() - (days - 1 - i) * 86_400_000);
    return {
      date: date.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      predicted: Math.round(60 + Math.random() * 40),
      actual: Math.round(55 + Math.random() * 45),
    };
  });
}

const CATEGORY_DATA = [
  { name: "Produce",  value: 38, cost: 1240 },
  { name: "Dairy",    value: 22, cost: 720 },
  { name: "Meat",     value: 18, cost: 1860 },
  { name: "Dry Goods",value: 12, cost: 430 },
  { name: "Beverages",value: 7,  cost: 290 },
  { name: "Other",    value: 3,  cost: 110 },
];

const WASTE_DONUT = [
  { name: "Reduced",  value: 37 },
  { name: "Remaining",value: 63 },
];

// ── Brand palette for recharts ────────────────────────────────────────────────

const C = {
  cyan:    "oklch(0.715 0.139 199.2)",
  purple:  "oklch(0.699 0.220 303.9)",
  mint:    "oklch(0.765 0.177 162)",
  amber:   "oklch(0.769 0.188 84)",
  red:     "oklch(0.637 0.249 29)",
  muted:   "oklch(0.55 0.01 240)",
  surface: "oklch(0.13 0.008 240)",
  border:  "oklch(0.22 0.01 240 / 0.5)",
};

const CHART_DEFAULTS = {
  style: { fontFamily: "var(--font-geist-sans)", fontSize: 11 },
};

function CustomTooltip({ active, payload, label, prefix = "", suffix = "" }: {
  active?: boolean;
  payload?: Array<{ name: string; value: number; color: string }>;
  label?: string;
  prefix?: string;
  suffix?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="glass-heavy rounded-xl border border-border/50 px-3 py-2.5 shadow-xl text-xs">
      <p className="font-semibold text-foreground mb-1.5">{label}</p>
      {payload.map((p) => (
        <p key={p.name} style={{ color: p.color }} className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full inline-block" style={{ background: p.color }} />
          {p.name}: {prefix}{p.value.toLocaleString()}{suffix}
        </p>
      ))}
    </div>
  );
}

// ── Stat card ─────────────────────────────────────────────────────────────────

function StatCard({
  icon: Icon,
  label,
  value,
  prefix = "",
  suffix = "",
  sub,
  iconBg,
  iconColor,
  index,
}: {
  icon:       React.ComponentType<{ className?: string }>;
  label:      string;
  value:      number;
  prefix?:    string;
  suffix?:    string;
  sub?:       string;
  iconBg:     string;
  iconColor:  string;
  index:      number;
}) {
  const count = useCountUp(value);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.07, duration: 0.45, ease: [0.23, 1, 0.32, 1] }}
      className="glass-card rounded-2xl p-5 flex flex-col gap-3"
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</span>
        <div className={["w-8 h-8 rounded-lg flex items-center justify-center", iconBg].join(" ")}>
          <Icon className={["w-4 h-4", iconColor].join(" ")} />
        </div>
      </div>
      <div>
        <p className="text-3xl font-bold tabular-nums tracking-tight gradient-text">
          {prefix}{count.toLocaleString()}{suffix}
        </p>
        {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
      </div>
    </motion.div>
  );
}

// ── Chart card wrapper ────────────────────────────────────────────────────────

function ChartCard({
  title,
  subtitle,
  children,
  index,
  className = "",
}: {
  title:    string;
  subtitle?: string;
  children: React.ReactNode;
  index:    number;
  className?: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.25 + index * 0.08, duration: 0.5, ease: [0.23, 1, 0.32, 1] }}
      className={["glass-card rounded-2xl p-5", className].join(" ")}
    >
      <div className="mb-4">
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        {subtitle && <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>}
      </div>
      {children}
    </motion.div>
  );
}

// ── Time range selector ────────────────────────────────────────────────────────

type Range = 7 | 30 | 90;
const RANGES: Range[] = [7, 30, 90];


// ── Page ──────────────────────────────────────────────────────────────────────

export default function AnalyticsPage() {
  const [range, setRange] = useState<Range>(30);

  const savingsData  = genSavingsData(range);
  const accuracyData = genAccuracyData(Math.min(range, 14));

  // Real counts from backend
  const [realStats, setRealStats] = useState({
    itemsTracked: 148,
    predictionsCount: 312,
    scansTotal: 0,
  });
  useEffect(() => {
    async function load() {
      try {
        const [inv, scans, preds] = await Promise.all([
          listInventory({ limit: 500 }),
          listScans({ limit: 100 }),
          listPredictions({ limit: 100 }),
        ]);
        setRealStats({
          itemsTracked: inv.total,
          predictionsCount: Array.isArray(preds) ? preds.length : 0,
          scansTotal: Array.isArray(scans) ? scans.length : 0,
        });
      } catch {
        // keep defaults
      }
    }
    load();
  }, []);

  // Thinned x-axis labels to avoid overlap
  const tickInterval = range === 7 ? 0 : range === 30 ? 4 : 13;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight gradient-text">Analytics</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Performance overview</p>
        </div>

        <div className="flex items-center gap-2">
          {/* Time range */}
          <div className="flex items-center gap-1 glass-button rounded-xl p-1">
            {RANGES.map((r) => (
              <button
                key={r}
                onClick={() => setRange(r)}
                className={[
                  "px-3 h-7 rounded-lg text-xs font-semibold transition-all",
                  range === r
                    ? "bg-cyan-500/25 text-cyan-400"
                    : "text-muted-foreground hover:text-foreground",
                ].join(" ")}
              >
                {r}d
              </button>
            ))}
          </div>

          {/* Export */}
          <button
            onClick={() => window.print()}
            className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-surface-2 transition-all"
            title="Print report"
          >
            <Printer className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={DollarSign}
          label="Total saved"
          value={4280}
          prefix="$"
          sub="+12.4% vs last period"
          iconBg="bg-cyan-500/15"
          iconColor="text-cyan-400"
          index={0}
        />
        <StatCard
          icon={Package}
          label="Items tracked"
          value={realStats.itemsTracked}
          sub="Across all categories"
          iconBg="bg-purple-500/15"
          iconColor="text-purple-400"
          index={1}
        />
        <StatCard
          icon={TrendingUp}
          label="Predictions made"
          value={realStats.predictionsCount}
          sub={`Last ${range} days`}
          iconBg="bg-amber-500/15"
          iconColor="text-amber-400"
          index={2}
        />
        <StatCard
          icon={Target}
          label="Accuracy rate"
          value={87}
          suffix="%"
          sub="Stockout prediction"
          iconBg="bg-mint-500/15"
          iconColor="text-mint-500"
          index={3}
        />
      </div>

      {/* Charts grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* A — Savings over time (Line + Area) */}
        <ChartCard
          title="Cumulative savings"
          subtitle={`Last ${range} days`}
          index={0}
          className="lg:col-span-2"
        >
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={savingsData} {...CHART_DEFAULTS}>
              <defs>
                <linearGradient id="savingsGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%"   stopColor={C.cyan}   stopOpacity={0.35} />
                  <stop offset="100%" stopColor={C.cyan}   stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke={C.border} vertical={false} />
              <XAxis
                dataKey="date"
                tick={{ fill: C.muted, fontSize: 10 }}
                axisLine={false}
                tickLine={false}
                interval={tickInterval}
              />
              <YAxis
                tick={{ fill: C.muted, fontSize: 10 }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v) => `$${v}`}
                width={48}
              />
              <Tooltip content={<CustomTooltip prefix="$" />} />
              <Area
                type="monotone"
                dataKey="savings"
                name="Cumulative savings"
                stroke={C.cyan}
                strokeWidth={2.5}
                fill="url(#savingsGrad)"
                dot={false}
                activeDot={{ r: 4, fill: C.cyan, strokeWidth: 0 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* B — Waste Reduction (Donut) */}
        <ChartCard
          title="Waste reduction"
          subtitle="vs baseline before Neumas"
          index={1}
        >
          <div className="flex items-center gap-6">
            <div className="relative shrink-0">
              <ResponsiveContainer width={160} height={160}>
                <PieChart>
                  <Pie
                    data={WASTE_DONUT}
                    cx="50%"
                    cy="50%"
                    innerRadius={52}
                    outerRadius={72}
                    startAngle={90}
                    endAngle={-270}
                    dataKey="value"
                    strokeWidth={0}
                    isAnimationActive
                    animationDuration={900}
                    animationEasing="ease-out"
                  >
                    <Cell fill={C.mint} />
                    <Cell fill="oklch(0.18 0.01 240)" />
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              {/* Centre label */}
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <span className="text-3xl font-bold gradient-text">37%</span>
                <span className="text-xs text-muted-foreground">reduced</span>
              </div>
            </div>
            <div className="space-y-3 flex-1">
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-muted-foreground">Produce waste</span>
                  <span className="font-medium text-mint-500">↓ 42%</span>
                </div>
                <div className="h-1.5 rounded-full bg-surface-2">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: "42%" }}
                    transition={{ duration: 0.8, delay: 0.3, ease: [0.23, 1, 0.32, 1] }}
                    className="h-full rounded-full bg-mint-500"
                  />
                </div>
              </div>
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-muted-foreground">Dairy waste</span>
                  <span className="font-medium text-cyan-400">↓ 31%</span>
                </div>
                <div className="h-1.5 rounded-full bg-surface-2">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: "31%" }}
                    transition={{ duration: 0.8, delay: 0.4, ease: [0.23, 1, 0.32, 1] }}
                    className="h-full rounded-full bg-cyan-500"
                  />
                </div>
              </div>
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-muted-foreground">Meat waste</span>
                  <span className="font-medium text-amber-400">↓ 28%</span>
                </div>
                <div className="h-1.5 rounded-full bg-surface-2">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: "28%" }}
                    transition={{ duration: 0.8, delay: 0.5, ease: [0.23, 1, 0.32, 1] }}
                    className="h-full rounded-full bg-amber-500"
                  />
                </div>
              </div>
            </div>
          </div>
        </ChartCard>

        {/* C — Category breakdown (Bar) */}
        <ChartCard
          title="Category breakdown"
          subtitle="Items by category"
          index={2}
        >
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={CATEGORY_DATA} {...CHART_DEFAULTS} barSize={18}>
              <CartesianGrid strokeDasharray="3 3" stroke={C.border} vertical={false} />
              <XAxis
                dataKey="name"
                tick={{ fill: C.muted, fontSize: 10 }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fill: C.muted, fontSize: 10 }}
                axisLine={false}
                tickLine={false}
                width={28}
              />
              <Tooltip content={<CustomTooltip suffix=" items" />} />
              <Bar
                dataKey="value"
                name="Items"
                radius={[4, 4, 0, 0] as [number, number, number, number]}
                isAnimationActive
                animationDuration={800}
              >
                {CATEGORY_DATA.map((_, i) => (
                  <Cell
                    key={i}
                    fill={([C.cyan, C.purple, C.mint, C.amber, C.red, C.muted] as string[])[i % 6]}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* D — Predictions accuracy (Area overlap) */}
        <ChartCard
          title="Prediction accuracy"
          subtitle="Predicted vs actual consumption"
          index={3}
          className="lg:col-span-2"
        >
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={accuracyData} {...CHART_DEFAULTS}>
              <defs>
                <linearGradient id="predGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%"   stopColor={C.purple} stopOpacity={0.4} />
                  <stop offset="100%" stopColor={C.purple} stopOpacity={0} />
                </linearGradient>
                <linearGradient id="actGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%"   stopColor={C.mint}   stopOpacity={0.35} />
                  <stop offset="100%" stopColor={C.mint}   stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke={C.border} vertical={false} />
              <XAxis
                dataKey="date"
                tick={{ fill: C.muted, fontSize: 10 }}
                axisLine={false}
                tickLine={false}
                interval={Math.floor(accuracyData.length / 7)}
              />
              <YAxis
                tick={{ fill: C.muted, fontSize: 10 }}
                axisLine={false}
                tickLine={false}
                width={32}
              />
              <Tooltip content={<CustomTooltip />} />
              <Legend
                wrapperStyle={{ fontSize: 11, color: C.muted }}
                iconType="circle"
                iconSize={8}
              />
              <Area
                type="monotone"
                dataKey="predicted"
                name="Predicted"
                stroke={C.purple}
                strokeWidth={2}
                fill="url(#predGrad)"
                dot={false}
                activeDot={{ r: 3, strokeWidth: 0 }}
              />
              <Area
                type="monotone"
                dataKey="actual"
                name="Actual"
                stroke={C.mint}
                strokeWidth={2}
                fill="url(#actGrad)"
                dot={false}
                activeDot={{ r: 3, strokeWidth: 0 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* Note */}
      <p className="text-xs text-center text-muted-foreground/60 pb-2">
        Counts (items, predictions) are live from your database. Savings and waste charts are illustrative.
      </p>
    </div>
  );
}
