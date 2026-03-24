/**
 * Neumas Design System
 *
 * Single source of truth for:
 *  - Color palette (mirrors CSS vars in globals.css)
 *  - Typography scale
 *  - Framer Motion animation variants
 *  - Glassmorphism class presets
 *  - Z-index scale
 *
 * Import tokens from here instead of hard-coding values in components.
 */

import type { Variants, Transition } from "framer-motion";

// ============================================================================
// Color Palette
// ============================================================================

export const colors = {
  /** Cyan / Teal — primary brand color */
  cyan: {
    50:  "#ecfeff",
    100: "#cffafe",
    200: "#a5f3fc",
    300: "#67e8f9",
    400: "#22d3ee",
    500: "#06b6d4",   // PRIMARY
    600: "#0891b2",
    700: "#0e7490",
    800: "#155e75",
    900: "#164e63",
    950: "#083344",
  },
  /** Electric Purple — accent / highlight */
  purple: {
    50:  "#fdf4ff",
    100: "#fae8ff",
    200: "#f5d0fe",
    300: "#f0abfc",
    400: "#e879f9",
    500: "#d946ef",   // ACCENT
    600: "#c026d3",
    700: "#a21caf",
    800: "#86198f",
    900: "#701a75",
    950: "#4a044e",
  },
  /** Mint Green — success state */
  mint: {
    50:  "#f0fdf4",
    100: "#dcfce7",
    200: "#bbf7d0",
    300: "#86efac",
    400: "#4ade80",
    500: "#22c55e",   // SUCCESS
    600: "#16a34a",
  },
  /** Amber — warning state */
  amber: {
    50:  "#fffbeb",
    100: "#fef3c7",
    200: "#fde68a",
    300: "#fcd34d",
    400: "#fbbf24",
    500: "#f59e0b",   // WARNING
    600: "#d97706",
  },
  /** Red — danger / error state */
  red: {
    50:  "#fef2f2",
    100: "#fee2e2",
    200: "#fecaca",
    300: "#fca5a5",
    400: "#f87171",
    500: "#ef4444",   // DANGER
    600: "#dc2626",
  },
  /** Dark mode optimized neutrals */
  neutral: {
    950: "#030712",
    900: "#111827",
    800: "#1f2937",
    700: "#374151",
    600: "#4b5563",
    500: "#6b7280",
    400: "#9ca3af",
    300: "#d1d5db",
    200: "#e5e7eb",
    100: "#f3f4f6",
    50:  "#f9fafb",
  },
} as const;

// Semantic aliases used by the app
export const semantic = {
  primary:   colors.cyan[500],
  accent:    colors.purple[500],
  success:   colors.mint[500],
  warning:   colors.amber[500],
  danger:    colors.red[500],
  bg:        colors.neutral[950],
  surface:   colors.neutral[900],
  border:    colors.neutral[800],
  muted:     colors.neutral[500],
  text:      "#f9fafb",
} as const;

// ============================================================================
// Typography
// ============================================================================

export const typography = {
  /** Fluid heading sizes using clamp() */
  heading: {
    "2xl": "clamp(2.5rem, 5vw, 4rem)",
    xl:    "clamp(2rem, 4vw, 3rem)",
    lg:    "clamp(1.75rem, 3vw, 2.5rem)",
    md:    "clamp(1.5rem, 2.5vw, 2rem)",
    sm:    "clamp(1.25rem, 2vw, 1.5rem)",
  },
  /** Font stacks — matched to CSS @font-face vars */
  fonts: {
    sans:  "var(--font-geist-sans), system-ui, sans-serif",
    mono:  "var(--font-geist-mono), monospace",
  },
  /** Line heights */
  leading: {
    tight:  1.1,
    snug:   1.25,
    normal: 1.5,
    relaxed: 1.75,
  },
  /** Letter spacings */
  tracking: {
    tightest: "-0.05em",
    tight:    "-0.025em",
    normal:   "0em",
    wide:     "0.05em",
    wider:    "0.1em",
    widest:   "0.2em",
  },
} as const;

// ============================================================================
// Framer Motion — Animation Variants
// ============================================================================

const defaultTransition: Transition = {
  duration: 0.45,
  ease: [0.23, 1, 0.32, 1], // custom cubic-bezier (expo out feel)
};

const fastTransition: Transition = {
  duration: 0.25,
  ease: [0.23, 1, 0.32, 1],
};

/**
 * Simple opacity fade.
 * Usage: `<motion.div variants={animations.fadeIn} initial="hidden" animate="visible">`
 */
export const fadeIn: Variants = {
  hidden:  { opacity: 0 },
  visible: { opacity: 1, transition: defaultTransition },
  exit:    { opacity: 0, transition: fastTransition },
};

/**
 * Fade in + slide up from below. Most common entrance.
 * Usage: wrap with `<FadeIn>` component or apply directly.
 */
export const slideUp: Variants = {
  hidden:  { opacity: 0, y: 24 },
  visible: { opacity: 1, y: 0, transition: defaultTransition },
  exit:    { opacity: 0, y: 12, transition: fastTransition },
};

/**
 * Fade in + slide down from above. Good for dropdowns, toasts.
 */
export const slideDown: Variants = {
  hidden:  { opacity: 0, y: -24 },
  visible: { opacity: 1, y: 0, transition: defaultTransition },
  exit:    { opacity: 0, y: -12, transition: fastTransition },
};

/**
 * Slide in from the left. Good for sidebars, drawers.
 */
export const slideRight: Variants = {
  hidden:  { opacity: 0, x: -32 },
  visible: { opacity: 1, x: 0, transition: defaultTransition },
  exit:    { opacity: 0, x: -16, transition: fastTransition },
};

/**
 * Scale from 95% → 100%. Subtle "pop" for modals, cards.
 */
export const scaleIn: Variants = {
  hidden:  { opacity: 0, scale: 0.95 },
  visible: { opacity: 1, scale: 1, transition: defaultTransition },
  exit:    { opacity: 0, scale: 0.97, transition: fastTransition },
};

/**
 * Stagger container — wraps a list of children that each have their own variant.
 * Automatically staggers child animations at 0.07s intervals.
 *
 * Usage:
 * ```tsx
 * <motion.ul variants={staggerContainer} initial="hidden" animate="visible">
 *   {items.map(i => <motion.li key={i.id} variants={slideUp} />)}
 * </motion.ul>
 * ```
 */
export const staggerContainer: Variants = {
  hidden:  {},
  visible: {
    transition: {
      staggerChildren:  0.07,
      delayChildren:    0.1,
    },
  },
  exit: {
    transition: {
      staggerChildren:  0.04,
      staggerDirection: -1,
    },
  },
};

/**
 * Hover / tap scale for interactive elements.
 * Apply via `whileHover="hover"` and `whileTap="tap"`.
 */
export const scaleOnHover: Variants = {
  rest:  { scale: 1 },
  hover: { scale: 1.03, transition: { duration: 0.2, ease: "easeOut" } },
  tap:   { scale: 0.97, transition: { duration: 0.1 } },
};

/**
 * Subtle glow pulse for call-to-action elements.
 */
export const glowPulse: Variants = {
  rest: {
    boxShadow: "0 0 0px rgba(6,182,212,0)",
  },
  hover: {
    boxShadow: "0 0 24px rgba(6,182,212,0.5), 0 0 48px rgba(6,182,212,0.2)",
    transition: { duration: 0.3 },
  },
};

/** Convenience export: all animation variants in one object */
export const animations = {
  fadeIn,
  slideUp,
  slideDown,
  slideRight,
  scaleIn,
  staggerContainer,
  scaleOnHover,
  glowPulse,
} as const;

// ============================================================================
// Glassmorphism — Tailwind class presets
// ============================================================================

/**
 * Ready-made Tailwind class strings for glassmorphism effects.
 * These map to the utility classes defined in globals.css.
 *
 * Usage: `<div className={glass.card}>`
 */
export const glass = {
  /** Standard glass card — panel, card, widget */
  card: "glass-card",
  /** Lighter glass — inline elements, chips */
  light: "glass-light",
  /** Heavy blur — modal backdrops, sidebars */
  heavy: "glass-heavy",
  /** Interactive glass button */
  button: "glass-button",
} as const;

// ============================================================================
// Gradient presets
// ============================================================================

export const gradients = {
  /** Cyan → Purple text gradient  */
  text:    "gradient-text",
  /** Cyan → Purple background gradient */
  primary: "bg-gradient-to-r from-cyan-500 to-purple-500",
  /** Dark background with subtle cyan tint */
  surface: "bg-gradient-to-br from-neutral-950 via-neutral-900 to-neutral-950",
  /** Hero background — deep dark with glow nodes */
  hero:    "bg-gradient-to-b from-neutral-950 via-neutral-900 to-neutral-950",
} as const;

// ============================================================================
// Z-index scale
// ============================================================================

export const zIndex = {
  base:    0,
  raised:  10,
  dropdown: 100,
  sticky:  200,
  overlay: 300,
  modal:   400,
  toast:   500,
  tooltip: 600,
} as const;

// ============================================================================
// Spacing / sizing helpers
// ============================================================================

export const spacing = {
  /** Page horizontal padding (responsive) */
  pagePx:  "px-4 sm:px-6 lg:px-8",
  /** Max content width */
  maxW:    "max-w-7xl mx-auto",
  /** Section vertical gap */
  section: "py-16 sm:py-24 lg:py-32",
} as const;
