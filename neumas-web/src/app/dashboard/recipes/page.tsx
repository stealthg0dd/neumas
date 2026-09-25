"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, Upload } from "lucide-react";

import { EmptyState } from "@/components/control-center/EmptyState";
import { getFoodCostDrivers, listRecipes } from "@/lib/api/endpoints";
import type { FoodCostDriversResponse, RecipeSummary } from "@/lib/api/types";
import { captureUIError } from "@/lib/analytics";
import { formatCurrency } from "@/lib/currency";

function money(value: number | null | undefined, currency = "USD") {
  return value == null ? "N/A" : formatCurrency(value, currency);
}

function pct(value: number | null | undefined) {
  return value == null ? "N/A" : `${Number(value).toFixed(1)}%`;
}

export default function RecipesPage() {
  const [recipes, setRecipes] = useState<RecipeSummary[]>([]);
  const [drivers, setDrivers] = useState<FoodCostDriversResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const [recipeRows, driverRows] = await Promise.all([
          listRecipes(),
          getFoodCostDrivers().catch(() => null),
        ]);
        if (!cancelled) {
          setRecipes(recipeRows);
          setDrivers(driverRows);
        }
      } catch (err) {
        captureUIError("recipes_load", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-sky-700">Food Graph</p>
            <h1 className="mt-1 text-2xl font-semibold text-slate-950">Recipes & Food Cost</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
              Recipe versions, ingredient costs, and supplier price contribution from verified Food Graph records.
            </p>
          </div>
          <button className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700">
            <Upload className="h-4 w-4" />
            CSV import via API
          </button>
        </header>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-950">Food Cost Drivers</h2>
          <p className="mt-1 text-sm text-slate-500">Top ingredient contributions across costed recipes.</p>
          {drivers?.top_ingredients.length ? (
            <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {drivers.top_ingredients.slice(0, 6).map((item) => (
                <div key={`${item.canonical_ingredient_id}-${item.name}`} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <p className="font-semibold text-slate-950">{item.name}</p>
                  <p className="mt-2 text-sm text-slate-600">{money(item.total_cost)} contribution · {pct(item.contribution_pct)}</p>
                  <p className="mt-1 text-xs text-slate-500">Price delta {money(item.change_vs_previous_price)}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-4 rounded-xl border border-dashed border-slate-200 p-5 text-sm text-slate-500">No food-cost drivers are available until recipes, ingredients, and supplier prices are imported.</p>
          )}
        </section>

        {loading ? (
          <div className="h-72 animate-pulse rounded-2xl bg-white" />
        ) : recipes.length ? (
          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <table className="w-full min-w-[880px] text-left text-sm">
              <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">Recipe</th>
                  <th className="px-4 py-3">Theoretical Cost</th>
                  <th className="px-4 py-3">Cost / Serving</th>
                  <th className="px-4 py-3">Food Cost %</th>
                  <th className="px-4 py-3">Gross Margin</th>
                  <th className="px-4 py-3">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {recipes.map((recipe) => (
                  <tr key={recipe.id}>
                    <td className="px-4 py-4">
                      <p className="font-semibold text-slate-950">{recipe.name}</p>
                      <p className="text-xs text-slate-500">{recipe.category ?? "Uncategorised"}</p>
                    </td>
                    <td className="px-4 py-4">{money(recipe.latest_theoretical_cost, recipe.currency)}</td>
                    <td className="px-4 py-4">{money(recipe.cost_per_serving, recipe.currency)}</td>
                    <td className="px-4 py-4">{pct(recipe.target_food_cost_pct)}</td>
                    <td className="px-4 py-4">{money(recipe.theoretical_gross_margin, recipe.currency)}</td>
                    <td className="px-4 py-4">
                      <Link href={`/dashboard/recipes/${recipe.id}`} className="inline-flex items-center gap-1 text-sm font-semibold text-sky-700">
                        Open <ArrowRight className="h-3.5 w-3.5" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        ) : (
          <EmptyState
            headline="No recipes yet"
            body="Import canonical ingredients, recipes, recipe ingredients, supplier items, and supplier prices to activate deterministic food costing."
          />
        )}
      </div>
    </main>
  );
}
