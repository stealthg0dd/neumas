/**
 * tailwind.config.ts
 *
 * Tailwind CSS 4 uses CSS-first configuration (@theme in globals.css).
 * This file exists as a reference for design tokens and for tooling
 * (IDE intellisense, shadcn CLI) that still reads it.
 *
 * Authoritative tokens live in: src/app/globals.css → @theme block
 */

import type { Config } from "tailwindcss";

const config: Config = {
  // Tailwind 4: darkMode is handled via @custom-variant in CSS.
  // This key is kept for tooling compatibility only; Tailwind 4 ignores it.
  darkMode: "class" as const,
  content: ["./src/**/*.{ts,tsx,mdx}"],
  theme: {
    extend: {
      // ── Neumas Brand Colors ──────────────────────────────────────
      // These mirror the @theme CSS vars in globals.css so IDE sees them.
      colors: {
        // Cyan / Teal — primary brand
        cyan: {
          50:  "#ecfeff",
          100: "#cffafe",
          200: "#a5f3fc",
          300: "#67e8f9",
          400: "#22d3ee",
          500: "#06b6d4",
          600: "#0891b2",
          700: "#0e7490",
          800: "#155e75",
          900: "#164e63",
          950: "#083344",
        },
        // Electric Purple — accent
        purple: {
          50:  "#fdf4ff",
          100: "#fae8ff",
          200: "#f5d0fe",
          300: "#f0abfc",
          400: "#e879f9",
          500: "#d946ef",
          600: "#c026d3",
          700: "#a21caf",
          800: "#86198f",
          900: "#701a75",
          950: "#4a044e",
        },
        // Mint / Success
        mint: {
          50:  "#f0fdf4",
          100: "#dcfce7",
          200: "#bbf7d0",
          300: "#86efac",
          400: "#4ade80",
          500: "#22c55e",
          600: "#16a34a",
        },
        // Neumas semantic aliases (mirror CSS vars)
        primary:     "var(--primary)",
        "primary-fg": "var(--primary-foreground)",
        accent:      "var(--accent)",
        "accent-fg":  "var(--accent-foreground)",
      },
      // ── Typography ───────────────────────────────────────────────
      fontFamily: {
        sans:  ["var(--font-geist-sans)", "system-ui", "sans-serif"],
        mono:  ["var(--font-geist-mono)", "monospace"],
        inter: ["var(--font-inter)", "system-ui", "sans-serif"],
      },
      fontSize: {
        // Fluid responsive headings via clamp()
        "display-2xl": ["clamp(2.5rem,5vw,4rem)",   { lineHeight: "1.1" }],
        "display-xl":  ["clamp(2rem,4vw,3rem)",      { lineHeight: "1.15" }],
        "display-lg":  ["clamp(1.75rem,3vw,2.5rem)", { lineHeight: "1.2" }],
        "display-md":  ["clamp(1.5rem,2.5vw,2rem)",  { lineHeight: "1.25" }],
      },
      // ── Animations ───────────────────────────────────────────────
      keyframes: {
        "fade-in": {
          from: { opacity: "0" },
          to:   { opacity: "1" },
        },
        "slide-up": {
          from: { opacity: "0", transform: "translateY(16px)" },
          to:   { opacity: "1", transform: "translateY(0)" },
        },
        "slide-down": {
          from: { opacity: "0", transform: "translateY(-16px)" },
          to:   { opacity: "1", transform: "translateY(0)" },
        },
        shimmer: {
          from: { backgroundPosition: "200% 0" },
          to:   { backgroundPosition: "-200% 0" },
        },
        pulse: {
          "0%,100%": { opacity: "1" },
          "50%":     { opacity: "0.4" },
        },
        float: {
          "0%,100%": { transform: "translateY(0)" },
          "50%":     { transform: "translateY(-8px)" },
        },
      },
      animation: {
        "fade-in":   "fade-in 0.4s ease-out",
        "slide-up":  "slide-up 0.5s ease-out",
        "slide-down":"slide-down 0.5s ease-out",
        shimmer:     "shimmer 2.5s linear infinite",
        float:       "float 3s ease-in-out infinite",
      },
      // ── Border radius ────────────────────────────────────────────
      borderRadius: {
        "4xl": "2rem",
        "5xl": "2.5rem",
      },
      // ── Box shadows ──────────────────────────────────────────────
      boxShadow: {
        "glow-cyan":   "0 0 20px rgba(6,182,212,0.4)",
        "glow-purple": "0 0 20px rgba(217,70,239,0.4)",
        glass:         "0 8px 32px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.1)",
      },
      // ── Backdrop blur ────────────────────────────────────────────
      backdropBlur: {
        xs: "2px",
      },
    },
  },
  plugins: [],
};

export default config;
