"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";

import { getRecipeDetail } from "@/lib/api/endpoints";
import type { RecipeDetail } from "@/lib/api/types";
import { captureUIError } from "@/lib/analytics";
import { formatCurrency } from "@/lib/currency";

function money(value: number | null | undefined, currency = "USD") {
  return value == null ? "N/A" : formatCurrency(value, currency);
}

export default function RecipeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const [detail, setDetail] = useState<RecipeDetail | null>(null);
  const [recipeId, setRecipeId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const resolved = await params;
      setRecipeId(resolved.id);
      try {
        const payload = await getRecipeDetail(resolved.id);
        if (!cancelled) setDetail(payload);
      } catch (err) {
        captureUIError("recipe_detail_load", err);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [params]);

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <Link href="/dashboard/recipes" className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600">
          <ArrowLeft className="h-4 w-4" />
          Recipes
        </Link>
        {!detail ? (
          <div className="h-96 animate-pulse rounded-2xl bg-white" />
        ) : (
          <>
            <header className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-sky-700">Recipe Detail</p>
              <h1 className="mt-1 text-2xl font-semibold text-slate-950">{detail.recipe.name}</h1>
              <p className="mt-2 text-sm text-slate-500">Recipe ID: {recipeId}</p>
            </header>

            <section className="grid gap-4 md:grid-cols-4">
              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Theoretical Cost</p>
                <p className="mt-2 text-xl font-semibold text-slate-950">{money(detail.active_cost?.latest_theoretical_cost, detail.recipe.currency)}</p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Cost / Serving</p>
                <p className="mt-2 text-xl font-semibold text-slate-950">{money(detail.active_cost?.cost_per_serving, detail.recipe.currency)}</p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Food Cost %</p>
                <p className="mt-2 text-xl font-semibold text-slate-950">{detail.active_cost?.target_food_cost_pct ?? "N/A"}</p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Gross Margin</p>
                <p className="mt-2 text-xl font-semibold text-slate-950">{money(detail.active_cost?.theoretical_gross_margin, detail.recipe.currency)}</p>
              </div>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-lg font-semibold text-slate-950">Supplier Price Contribution</h2>
              <div className="mt-4 overflow-x-auto">
                <table className="w-full min-w-[760px] text-left text-sm">
                  <thead className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="py-2">Ingredient</th>
                      <th className="py-2">Base Qty</th>
                      <th className="py-2">Unit Cost</th>
                      <th className="py-2">Total</th>
                      <th className="py-2">Change</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {(detail.active_cost?.ingredient_contributions ?? []).map((item) => (
                      <tr key={item.canonical_ingredient_id}>
                        <td className="py-3 font-medium text-slate-900">{item.name}</td>
                        <td className="py-3">{item.base_quantity}</td>
                        <td className="py-3">{money(item.unit_cost, detail.recipe.currency)}</td>
                        <td className="py-3">{money(item.total_cost, detail.recipe.currency)}</td>
                        <td className="py-3">{money(item.change_vs_previous_price, detail.recipe.currency)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-lg font-semibold text-slate-950">Version History</h2>
              <div className="mt-3 space-y-2">
                {detail.versions.map((version) => (
                  <div key={String(version.id)} className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
                    Version {String(version.version_number)} · Active: {String(version.is_active)}
                  </div>
                ))}
              </div>
            </section>
          </>
        )}
      </div>
    </main>
  );
}
