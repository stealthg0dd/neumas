"use client";

import Link from "next/link";
import { AlertTriangle, Brain, Check } from "lucide-react";

function scrollToId(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
}

export function LandingPage() {
  return (
    <div className="min-h-screen bg-white text-gray-900">
      {/* NAVBAR */}
      <header className="sticky top-0 z-50 border-b border-gray-100/80 bg-white/80 backdrop-blur-md">
        <nav className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <span className="font-mono text-lg font-bold tracking-tight">NEUMAS</span>
          <div className="hidden items-center gap-8 text-sm font-medium text-gray-600 md:flex">
            <button
              type="button"
              onClick={() => scrollToId("how-it-works")}
              className="transition-colors hover:text-gray-900"
            >
              How it works
            </button>
            <button
              type="button"
              onClick={() => scrollToId("pricing")}
              className="transition-colors hover:text-gray-900"
            >
              Pricing
            </button>
            <Link href="/insights" className="transition-colors hover:text-gray-900">
              Insights
            </Link>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            <Link
              href="/auth"
              className="rounded-lg px-3 py-2 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-50 hover:text-gray-900 sm:px-4"
            >
              Sign in
            </Link>
            <Link
              href="/auth"
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-700 sm:px-5"
            >
              Start free trial
            </Link>
          </div>
        </nav>
      </header>

      {/* HERO */}
      <section className="flex min-h-screen flex-col justify-center px-4 pb-24 pt-16 sm:px-6">
        <div className="mx-auto flex w-full max-w-4xl flex-col items-center">
          <span className="mb-6 rounded-full bg-blue-50 px-3 py-1 font-mono text-xs text-blue-600">
            Grocery autopilot — powered by AI
          </span>
          <h1 className="max-w-3xl text-center text-5xl font-bold tracking-tight sm:text-6xl">
            Your grocery autopilot.
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-center text-xl text-gray-500">
            Neumas scans your pantry, predicts what you&apos;ll run out of, and builds your shopping list before you
            do.
          </p>
          <p className="mt-3 font-mono text-sm font-medium tracking-wide text-blue-600">Scan → Predict → Order</p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/auth"
              className="rounded-xl bg-blue-600 px-8 py-4 text-base font-semibold text-white transition-all hover:scale-105 hover:bg-blue-700"
            >
              Start your 14-day free trial
            </Link>
            <button
              type="button"
              onClick={() => scrollToId("how-it-works")}
              className="rounded-xl px-6 py-4 text-base text-gray-500 transition-colors hover:text-gray-900"
            >
              See how it works ↓
            </button>
          </div>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-4 sm:gap-6">
            {["14 days free", "No credit card", "Cancel anytime"].map((t) => (
              <span key={t} className="flex items-center gap-1 text-xs text-gray-400">
                <Check className="h-3.5 w-3.5 text-emerald-500" aria-hidden />
                {t}
              </span>
            ))}
          </div>

          {/* DEMO CARD */}
          <div className="mt-16 w-full max-w-2xl overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-gray-100">
            <div className="flex items-center gap-2 border-b border-gray-100 bg-gray-50 px-6 py-3">
              <span className="h-3 w-3 rounded-full bg-red-400" />
              <span className="h-3 w-3 rounded-full bg-yellow-400" />
              <span className="h-3 w-3 rounded-full bg-green-400" />
              <span className="font-mono text-xs text-gray-400">neumas.ai/dashboard</span>
            </div>
            <div className="p-6">
              <div className="mb-4 rounded-xl border border-blue-100 bg-blue-50 p-4">
                <div className="flex items-center gap-2">
                  <Brain className="h-5 w-5 shrink-0 text-blue-600" aria-hidden />
                  <span className="text-sm font-medium text-gray-900">AI is learning your household</span>
                </div>
                <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-blue-100">
                  <div className="h-full w-2/3 rounded-full bg-blue-500" />
                </div>
                <p className="mt-2 text-xs text-blue-400">68% confidence — improves with more data</p>
              </div>
              <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-4">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 shrink-0 text-amber-600" aria-hidden />
                  <span className="text-sm font-semibold text-amber-800">Predicted stockout</span>
                </div>
                <p className="mt-1 text-base font-bold text-gray-900">Milk runs out in 2 days</p>
                <p className="mt-1 text-xs text-amber-600">
                  85% confidence · Based on your 7-day consumption pattern
                </p>
                <button
                  type="button"
                  className="mt-2 rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-medium text-white"
                >
                  Add to shopping list →
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {[
                  { name: "Milk", status: "LOW", dot: "bg-amber-400" },
                  { name: "Bread", status: "OK", dot: "bg-emerald-400" },
                  { name: "Eggs", status: "LOW", dot: "bg-amber-400" },
                  { name: "Coffee", status: "OK", dot: "bg-emerald-400" },
                ].map((row) => (
                  <div
                    key={row.name}
                    className="rounded-lg border border-gray-100 bg-gray-50/80 px-2 py-3 text-center"
                  >
                    <div className="flex items-center justify-center gap-1.5">
                      <span className={`h-2 w-2 rounded-full ${row.dot}`} />
                      <span className="text-xs font-medium text-gray-800">{row.name}</span>
                    </div>
                    <span className="mt-1 block text-[10px] font-mono text-gray-500">{row.status}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section id="how-it-works" className="scroll-mt-24 px-4 py-24 sm:px-6">
        <div className="mx-auto max-w-5xl">
          <h2 className="text-center text-4xl font-bold">Grocery intelligence in 3 steps</h2>
          <p className="mx-auto mt-4 max-w-xl text-center text-gray-500">
            Neumas does the thinking so you can focus on everything else.
          </p>
          <div className="mt-16 grid gap-8 md:grid-cols-3">
            {[
              {
                num: "01",
                title: "Scan",
                body: "Upload a receipt or scan your pantry in seconds. Neumas reads every item and quantity automatically using AI vision.",
              },
              {
                num: "02",
                title: "Predict",
                body: "Our AI learns your household's consumption patterns and forecasts what you'll run out of — before you run out.",
              },
              {
                num: "03",
                title: "Order",
                body: "Approve your AI-generated shopping list with one tap and reorder through your preferred retailers.",
              },
            ].map((block) => (
              <div key={block.num}>
                <p className="font-mono text-4xl font-bold text-blue-600">{block.num}</p>
                <h3 className="mt-2 text-lg font-bold text-gray-900">{block.title}</h3>
                <p className="mt-3 text-sm leading-relaxed text-gray-600">{block.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* AGENTIC / INSIGHTS */}
      <section id="insights" className="scroll-mt-24 bg-gray-50 px-4 py-20 sm:px-6">
        <div className="mx-auto max-w-5xl">
          <h2 className="text-center text-3xl font-bold text-gray-900 md:text-4xl">AI that actually thinks ahead</h2>
          <div className="mx-auto mt-10 max-w-2xl rounded-2xl bg-white p-8 shadow-lg">
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <p className="text-3xl font-bold text-blue-600">85%</p>
                <p className="mt-1 text-xs text-gray-500">Prediction accuracy</p>
              </div>
              <div>
                <p className="text-3xl font-bold text-blue-600">47</p>
                <p className="mt-1 text-xs text-gray-500">Consumption patterns tracked</p>
              </div>
              <div>
                <p className="text-3xl font-bold text-blue-600">3 days</p>
                <p className="mt-1 text-xs text-gray-500">Average stockout warning</p>
              </div>
            </div>
            <div className="mt-8 rounded-xl border border-gray-100 bg-gray-50 p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Pattern detected</p>
              <p className="mt-2 text-sm font-medium text-gray-900">
                You buy milk every 7 days. Last purchase: 6 days ago.
              </p>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-gray-200">
                <div className="h-full w-4/5 rounded-full bg-blue-500" />
              </div>
              <p className="mt-2 text-xs text-gray-600">High confidence</p>
            </div>
          </div>
        </div>
      </section>

      {/* PRICING */}
      <section id="pricing" className="scroll-mt-24 px-4 py-20 sm:px-6">
        <div className="mx-auto max-w-5xl">
          <h2 className="text-center text-4xl font-bold">Simple pricing</h2>
          <p className="mt-4 text-center text-gray-500">14 days free. Then $3.99/month.</p>
          <div className="relative mx-auto mt-12 max-w-md rounded-2xl border-2 border-blue-600 bg-white p-8">
            <span className="absolute right-4 top-4 rounded-full bg-blue-600 px-3 py-1 text-xs font-semibold text-white">
              PREMIUM
            </span>
            <div className="flex items-baseline gap-1 pt-2">
              <span className="text-5xl font-bold text-gray-900">$3.99</span>
              <span className="text-gray-400">/month</span>
            </div>
            <p className="mt-2 text-sm text-gray-600">Or $39.99/year (save 16%)</p>
            <ul className="mt-6 space-y-3 text-sm text-gray-700">
              {[
                "Unlimited receipt scanning",
                "AI stockout predictions",
                "Smart shopping lists",
                "One-tap reorder via partners",
                "Family sync (5 members)",
                "Multi-property support",
              ].map((f) => (
                <li key={f} className="flex items-start gap-2">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" aria-hidden />
                  {f}
                </li>
              ))}
            </ul>
            <Link
              href="/auth"
              className="mt-8 flex w-full justify-center rounded-xl bg-blue-600 py-4 text-center font-semibold text-white transition-colors hover:bg-blue-700"
            >
              Start your 14-day free trial
            </Link>
            <p className="mt-3 text-center text-xs text-gray-500">No credit card required during trial</p>
          </div>
        </div>
      </section>

      {/* TRUST */}
      <section className="border-t border-gray-100 px-4 py-16 sm:px-6">
        <div className="mx-auto max-w-4xl text-center">
          <p className="flex flex-wrap items-center justify-center gap-3 text-sm text-gray-600">
            <span>🔒 PDPA (SG/MY)</span>
            <span className="text-gray-300">|</span>
            <span>GDPR (EU)</span>
            <span className="text-gray-300">|</span>
            <span>SSL Encrypted</span>
            <span className="text-gray-300">|</span>
            <span>Privacy First</span>
          </p>
          <p className="mt-6 text-sm text-gray-500">
            Launching in Singapore · Malaysia · Thailand · Vietnam · Indonesia · UAE · EU
          </p>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="border-t border-gray-100 bg-gray-50/80 px-4 py-12 sm:px-6">
        <div className="mx-auto flex max-w-6xl flex-col gap-8 md:flex-row md:items-start md:justify-between">
          <div>
            <span className="font-mono text-lg font-bold">NEUMAS</span>
            <p className="mt-2 text-sm text-gray-500">
              Contact:{" "}
              <a href="mailto:info@neumas.ai" className="text-blue-600 hover:underline">
                info@neumas.ai
              </a>
            </p>
          </div>
          <div className="flex flex-wrap gap-8 text-sm">
            <div className="space-y-2">
              <p className="font-semibold text-gray-900">Product</p>
              <button type="button" onClick={() => scrollToId("how-it-works")} className="block text-gray-600 hover:text-gray-900">
                How it works
              </button>
              <button type="button" onClick={() => scrollToId("pricing")} className="block text-gray-600 hover:text-gray-900">
                Pricing
              </button>
              <Link href="/insights" className="block text-gray-600 hover:text-gray-900">
                Insights
              </Link>
            </div>
            <div className="space-y-2">
              <p className="font-semibold text-gray-900">Legal</p>
              <span className="block text-gray-600">Privacy</span>
              <span className="block text-gray-600">Terms</span>
            </div>
          </div>
        </div>
        <p className="mx-auto mt-10 max-w-6xl text-center text-xs text-gray-400">
          © 2025 Neumas. All rights reserved.
        </p>
      </footer>
    </div>
  );
}
