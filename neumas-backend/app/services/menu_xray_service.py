"""
Menu X-Ray Service

Analyses a restaurant menu image/PDF to extract dishes and estimate food cost economics.

Pipeline:
  1. Vision extraction: extract dish names, prices, categories from menu image
  2. Cost inference: for each dish, infer typical ingredients and estimate costs
  3. Aggregation: compute health score, margin signals, category economics, opportunities
  4. Persistence: store in menu_xray_analyses table

Cost estimates use typical Singapore/SEA market prices as the default baseline.
All figures are clearly labelled as estimates.
"""

import json
from datetime import UTC, datetime
from typing import Any
from uuid import uuid4

from app.core.logging import get_logger

logger = get_logger(__name__)

# ─── Margin signal thresholds ─────────────────────────────────────────────────
FOOD_COST_HEALTHY_THRESHOLD = 35.0    # < 35%  → Healthy
FOOD_COST_WATCH_THRESHOLD   = 42.0    # 35-42% → Watch
                                       # > 42%  → Margin Risk

# ─── LLM prompts ─────────────────────────────────────────────────────────────

MENU_EXTRACTION_SYSTEM_PROMPT = """You are a restaurant menu digitisation AI.
Extract every dish from the menu image or PDF.

Return ONLY valid JSON matching this structure:
{
  "menu_name": "<restaurant or menu name if visible, else 'Uploaded Menu'>",
  "currency": "<ISO 4217 code, e.g. SGD, USD, GBP — infer from symbols like $ = SGD if Singapore context>",
  "dishes": [
    {
      "dish_name": "<exact name from menu>",
      "menu_price": <numeric price, no currency symbol>,
      "category": "<section heading from menu, e.g. Starters, Mains, Desserts, Beverages>",
      "description": "<brief description if printed on menu, else null>"
    }
  ],
  "confidence": <0.0–1.0 based on image quality and readability>
}

Rules:
- Include every priced item.
- Use null for description if not on menu.
- If multiple prices exist (sizes), pick the standard/medium.
- Do not include sub-items, modifiers, or add-ons.
- confidence: 1.0 = crystal clear, 0.5 = partly legible, 0.2 = very poor quality."""

COST_INFERENCE_SYSTEM_PROMPT = """You are a restaurant food cost analyst.
For each dish provided, estimate:
1. The typical ingredients required for one serving
2. The cost of each ingredient at typical Singapore restaurant-supply prices (in SGD)

Use these reference price benchmarks (SGD, restaurant bulk purchase, per kg or stated unit):
- Chicken breast: S$6/kg, Chicken whole: S$4.50/kg
- Pork belly: S$9/kg, Pork tenderloin: S$12/kg
- Beef sirloin: S$28/kg, Beef chuck: S$16/kg
- Duck leg: S$14/kg
- Tiger prawns: S$28/kg, White prawns: S$18/kg, Scampi: S$35/kg
- Fish (barramundi): S$12/kg, Salmon: S$22/kg, Cod: S$32/kg
- Mud crab: S$38/kg, Soft-shell crab: S$22/kg
- Eggs: S$0.25 each
- Jasmine rice: S$1.20/kg, Noodles: S$1.80/kg
- Coconut milk (400ml): S$1.50, Palm sugar: S$3/kg
- Onions: S$1.50/kg, Garlic: S$4/kg, Ginger: S$3/kg
- Mixed vegetables: S$3/kg, Bean sprouts: S$2/kg
- Lemongrass: S$4/kg, Kaffir lime leaves: S$8/kg
- Soy sauce: S$0.05/dish use, Fish sauce: S$0.05/dish use
- Cooking oil: S$0.20/dish use
- Truffle oil: S$0.80–S$1.50 per dish use (a few drops)
- Cream/milk: S$3/litre

Return ONLY valid JSON:
{
  "dish_analyses": [
    {
      "dish_name": "<exact dish name from input>",
      "inferred_ingredients": [
        {
          "ingredient": "<name>",
          "quantity": <numeric>,
          "unit": "<g|ml|unit|tbsp|piece>",
          "estimated_cost_low": <SGD>,
          "estimated_cost_high": <SGD>
        }
      ],
      "estimated_total_cost_low": <SGD>,
      "estimated_total_cost_high": <SGD>,
      "confidence": <0.0–1.0>
    }
  ]
}"""


# ─── Sample dataset ───────────────────────────────────────────────────────────

def _build_sample_analysis(analysis_id: str | None = None) -> dict[str, Any]:
    """
    Deterministic sample analysis for 'Try Sample Menu'.
    Represents a modern Asian restaurant in Singapore.
    Always returns a polished, complete result.
    """
    aid = analysis_id or f"sample-{uuid4().hex[:8]}"

    dishes_raw = [
        # (name, price, category, ingredients, cost_low, cost_high, confidence)
        ("Laksa Lemak", 18.0, "Mains",
         [("Coconut milk", 200, "ml", 1.10, 1.40),
          ("Tiger prawns", 80, "g", 2.20, 2.60),
          ("Rice noodles", 120, "g", 0.35, 0.50),
          ("Laksa paste", 30, "g", 0.70, 0.90),
          ("Fish cake", 50, "g", 0.55, 0.70),
          ("Egg", 1, "unit", 0.20, 0.30)], 5.10, 6.40, 0.88),

        ("Char Kway Teow", 16.0, "Mains",
         [("Flat rice noodles", 200, "g", 0.45, 0.60),
          ("Pork belly slices", 80, "g", 0.70, 0.90),
          ("Chinese sausage", 40, "g", 1.00, 1.30),
          ("Eggs", 2, "unit", 0.40, 0.55),
          ("White prawns", 60, "g", 1.00, 1.30),
          ("Bean sprouts", 60, "g", 0.15, 0.25),
          ("Dark soy sauce", 1, "tbsp", 0.05, 0.10)], 3.75, 5.00, 0.85),

        ("Hainanese Chicken Rice", 14.0, "Mains",
         [("Free-range chicken", 280, "g", 1.60, 2.00),
          ("Jasmine rice", 180, "g", 0.25, 0.35),
          ("Chicken stock", 150, "ml", 0.20, 0.30),
          ("Ginger", 20, "g", 0.06, 0.10),
          ("Sesame oil", 1, "tbsp", 0.12, 0.18),
          ("Pandan leaf", 2, "unit", 0.08, 0.12)], 2.31, 3.05, 0.92),

        ("Chilli Crab (half)", 52.0, "Mains",
         [("Mud crab", 600, "g", 20.00, 24.00),
          ("Egg", 2, "unit", 0.40, 0.55),
          ("Tomato ketchup", 2, "tbsp", 0.25, 0.35),
          ("Chilli paste", 30, "g", 0.40, 0.60),
          ("Cornstarch", 10, "g", 0.05, 0.10),
          ("Spring onion", 20, "g", 0.10, 0.20)], 21.20, 25.80, 0.82),

        ("Nasi Goreng Kampung", 14.0, "Mains",
         [("Jasmine rice", 220, "g", 0.30, 0.40),
          ("Chicken breast", 100, "g", 0.55, 0.75),
          ("Eggs", 2, "unit", 0.40, 0.55),
          ("Mixed vegetables", 80, "g", 0.25, 0.35),
          ("Kecap manis", 2, "tbsp", 0.20, 0.30),
          ("Sambal paste", 20, "g", 0.20, 0.30)], 1.90, 2.65, 0.90),

        ("Duck Confit Claypot", 34.0, "Mains",
         [("Duck leg", 280, "g", 3.80, 4.50),
          ("Five-spice powder", 5, "g", 0.10, 0.18),
          ("Garlic cloves", 4, "unit", 0.15, 0.25),
          ("Dark soy sauce", 2, "tbsp", 0.08, 0.15),
          ("Shiitake mushrooms", 80, "g", 0.90, 1.20),
          ("Shaoxing wine", 30, "ml", 0.25, 0.40)], 5.28, 6.68, 0.80),

        ("Tiger Prawn Satay (6pcs)", 18.0, "Starters",
         [("Tiger prawns", 150, "g", 4.00, 4.80),
          ("Satay marinade", 30, "ml", 0.50, 0.70),
          ("Peanut sauce", 50, "ml", 0.80, 1.10),
          ("Cucumber", 60, "g", 0.15, 0.25),
          ("Red onion", 30, "g", 0.10, 0.18)], 5.55, 7.03, 0.86),

        ("Crispy Spring Rolls (4pcs)", 8.0, "Starters",
         [("Spring roll pastry", 4, "unit", 0.30, 0.45),
          ("Pork mince", 100, "g", 0.70, 0.90),
          ("Carrots", 40, "g", 0.08, 0.15),
          ("Shiitake mushrooms", 40, "g", 0.45, 0.60),
          ("Glass noodles", 30, "g", 0.18, 0.25)], 1.71, 2.35, 0.93),

        ("Truffle Edamame", 12.0, "Starters",
         [("Edamame", 200, "g", 1.60, 2.00),
          ("White truffle oil", 5, "ml", 1.80, 2.40),
          ("Sea salt flakes", 2, "g", 0.05, 0.10),
          ("Chilli flakes", 1, "g", 0.03, 0.06)], 3.48, 4.56, 0.91),

        ("Gula Melaka Panna Cotta", 10.0, "Desserts",
         [("Cooking cream", 120, "ml", 0.50, 0.70),
          ("Palm sugar (gula melaka)", 30, "g", 0.12, 0.18),
          ("Agar agar powder", 3, "g", 0.15, 0.22),
          ("Coconut cream", 50, "ml", 0.40, 0.55)], 1.17, 1.65, 0.95),

        ("Durian Pengat", 14.0, "Desserts",
         [("D24 durian pulp", 120, "g", 4.20, 5.40),
          ("Coconut milk", 100, "ml", 0.55, 0.75),
          ("Palm sugar", 25, "g", 0.10, 0.15),
          ("Pandan leaf", 1, "unit", 0.04, 0.08)], 4.89, 6.38, 0.78),

        ("Homemade Bandung", 6.0, "Beverages",
         [("Rose syrup", 30, "ml", 0.35, 0.50),
          ("Evaporated milk", 60, "ml", 0.25, 0.38),
          ("Soda water", 150, "ml", 0.20, 0.30)], 0.80, 1.18, 0.97),
    ]

    dishes = []
    for row in dishes_raw:
        (name, price, category, ingredients, cost_low, cost_high, conf) = row
        cost_mid = round((cost_low + cost_high) / 2, 2)
        fcp = round(cost_mid / price * 100, 1)

        if fcp < FOOD_COST_HEALTHY_THRESHOLD:
            signal = "Healthy"
        elif fcp < FOOD_COST_WATCH_THRESHOLD:
            signal = "Watch"
        else:
            signal = "Margin Risk"

        ing_objs = []
        for ing in ingredients:
            ing_name, ing_qty, ing_unit, ing_low, ing_high = ing
            ing_objs.append({
                "ingredient": ing_name,
                "quantity": ing_qty,
                "unit": ing_unit,
                "estimated_cost_low": ing_low,
                "estimated_cost_high": ing_high,
                "estimated_cost": round((ing_low + ing_high) / 2, 2),
            })

        dishes.append({
            "dish_name": name,
            "menu_price": price,
            "currency": "SGD",
            "category": category,
            "description": None,
            "inferred_ingredients": ing_objs,
            "estimated_ingredient_cost": cost_low,
            "estimated_ingredient_cost_max": cost_high,
            "estimated_food_cost_pct": fcp,
            "confidence": conf,
            "margin_signal": signal,
        })

    # Aggregate insights
    healthy = [d for d in dishes if d["margin_signal"] == "Healthy"]
    watch   = [d for d in dishes if d["margin_signal"] == "Watch"]
    risky   = [d for d in dishes if d["margin_signal"] == "Margin Risk"]
    avg_fcp = round(sum(d["estimated_food_cost_pct"] for d in dishes) / len(dishes), 1)

    # Menu Health Score: starts at 80, penalties for watch/risk dishes and high avg food cost
    score = 80
    score -= len(watch) * 4
    score -= len(risky) * 14
    if avg_fcp > 35:
        score -= int((avg_fcp - 35) * 1.2)
    score = max(0, min(100, score))

    # Ingredient exposures (by cumulative cost contribution across all dishes)
    ingredient_totals: dict[str, dict[str, Any]] = {}
    for dish in dishes:
        for ing in dish["inferred_ingredients"]:
            key = ing["ingredient"].lower()
            if key not in ingredient_totals:
                ingredient_totals[key] = {"ingredient": ing["ingredient"], "cost": 0.0, "dishes": 0}
            ingredient_totals[key]["cost"] += ing["estimated_cost"]
            ingredient_totals[key]["dishes"] += 1
    total_ingredient_cost = sum(v["cost"] for v in ingredient_totals.values())
    exposures = sorted(ingredient_totals.values(), key=lambda x: x["cost"], reverse=True)[:6]
    exposure_list = [
        {
            "ingredient": e["ingredient"],
            "appears_in_dishes": e["dishes"],
            "estimated_total_cost_contribution": round(e["cost"], 2),
            "exposure_pct": round(e["cost"] / total_ingredient_cost * 100, 1) if total_ingredient_cost else 0,
        }
        for e in exposures
    ]

    # Category economics
    categories: dict[str, list[float]] = {}
    for dish in dishes:
        categories.setdefault(dish["category"], []).append(dish["estimated_food_cost_pct"])
    cat_list = []
    for cat, fcps in categories.items():
        avg = round(sum(fcps) / len(fcps), 1)
        if avg < FOOD_COST_HEALTHY_THRESHOLD:
            sig = "Healthy"
        elif avg < FOOD_COST_WATCH_THRESHOLD:
            sig = "Watch"
        else:
            sig = "Margin Risk"
        cat_list.append({
            "category": cat,
            "dish_count": len(fcps),
            "average_food_cost_pct": avg,
            "margin_signal": sig,
        })

    # Top opportunities
    opportunities = [
        {
            "dish_name": "Chilli Crab (half)",
            "current_food_cost_pct": 44.6,
            "opportunity_description": "Switch to a reliable frozen-crab supplier to reduce crab cost by ~12% without quality impact",
            "estimated_saving_per_dish": 3.20,
            "opportunity_type": "Procurement",
            "effort": "Medium",
            "confidence": 0.82,
        },
        {
            "dish_name": "Durian Pengat",
            "current_food_cost_pct": 40.5,
            "opportunity_description": "Blend D24 with Mao Shan Wang (40/60) to preserve flavour profile at lower cost",
            "estimated_saving_per_dish": 1.60,
            "opportunity_type": "Recipe",
            "effort": "Low",
            "confidence": 0.76,
        },
        {
            "dish_name": "Char Kway Teow",
            "current_food_cost_pct": 38.1,
            "opportunity_description": "Batch-fry wok hei preparation and adjust prawn portion by 10g — reduces cost to ~34%",
            "estimated_saving_per_dish": 0.65,
            "opportunity_type": "Waste",
            "effort": "Low",
            "confidence": 0.70,
        },
        {
            "dish_name": "Tiger Prawn Satay",
            "current_food_cost_pct": 36.1,
            "opportunity_description": "Standardise satay skewer weight with a 140g portion guide; current over-portioning averages 160g",
            "estimated_saving_per_dish": 0.55,
            "opportunity_type": "Waste",
            "effort": "Low",
            "confidence": 0.68,
        },
        {
            "dish_name": "Hainanese Chicken Rice",
            "current_food_cost_pct": 35.6,
            "opportunity_description": "Price increase of S$0.50–1.00 per portion is within comparable market range and reduces food cost % to 32%",
            "estimated_saving_per_dish": 0.75,
            "opportunity_type": "Pricing",
            "effort": "Low",
            "confidence": 0.65,
        },
    ]

    insights = {
        "menu_health_score": score,
        "average_food_cost_pct": avg_fcp,
        "margin_risk_count": len(risky),
        "watch_count": len(watch),
        "healthy_count": len(healthy),
        "largest_ingredient_exposures": exposure_list,
        "category_economics": cat_list,
        "top_margin_opportunities": opportunities,
        "recommended_action": (
            "Renegotiate your mud crab supply contract — it is your single largest cost exposure "
            "and drives the Chilli Crab onto Margin Risk. A 10% price reduction on crab alone "
            "would add ~S$1,400/month to gross margin at current volumes."
        ),
        "estimated_monthly_opportunity": 2840.0,
        "currency": "SGD",
    }

    return {
        "analysis_id": aid,
        "scan_id": None,
        "user_id": None,
        "org_id": None,
        "menu_name": "The Straits Kitchen — Modern Asian Grill",
        "currency": "SGD",
        "dishes_detected": len(dishes),
        "analysis_confidence": 0.91,
        "created_at": datetime.now(UTC).isoformat(),
        "dishes": dishes,
        "insights": insights,
        "is_sample": True,
        "estimates_disclaimer": (
            "All ingredient costs and food cost percentages are AI estimates based on "
            "typical Singapore restaurant-supply prices. Connect real supplier data for precise figures."
        ),
    }


# ─── Live analysis helpers ────────────────────────────────────────────────────

def _compute_margin_signal(fcp: float) -> str:
    if fcp < FOOD_COST_HEALTHY_THRESHOLD:
        return "Healthy"
    if fcp < FOOD_COST_WATCH_THRESHOLD:
        return "Watch"
    return "Margin Risk"


def _build_insights_from_dishes(dishes: list[dict], currency: str) -> dict[str, Any]:
    """Compute aggregate insights from a list of dish analysis dicts."""
    if not dishes:
        return {
            "menu_health_score": 0,
            "average_food_cost_pct": 0,
            "margin_risk_count": 0,
            "watch_count": 0,
            "healthy_count": 0,
            "largest_ingredient_exposures": [],
            "category_economics": [],
            "top_margin_opportunities": [],
            "recommended_action": "Upload your menu to get personalised insights.",
            "estimated_monthly_opportunity": None,
            "currency": currency,
        }

    healthy = [d for d in dishes if d["margin_signal"] == "Healthy"]
    watch   = [d for d in dishes if d["margin_signal"] == "Watch"]
    risky   = [d for d in dishes if d["margin_signal"] == "Margin Risk"]
    avg_fcp = round(sum(d["estimated_food_cost_pct"] for d in dishes) / len(dishes), 1)

    score = 80
    score -= len(watch) * 4
    score -= len(risky) * 14
    if avg_fcp > 35:
        score -= int((avg_fcp - 35) * 1.2)
    score = max(0, min(100, score))

    # Ingredient exposures
    ingredient_totals: dict[str, dict[str, Any]] = {}
    for dish in dishes:
        for ing in dish.get("inferred_ingredients", []):
            key = ing["ingredient"].lower()
            if key not in ingredient_totals:
                ingredient_totals[key] = {"ingredient": ing["ingredient"], "cost": 0.0, "dishes": 0}
            ingredient_totals[key]["cost"] += ing.get("estimated_cost", 0)
            ingredient_totals[key]["dishes"] += 1
    total_ing_cost = sum(v["cost"] for v in ingredient_totals.values())
    exposures_sorted = sorted(ingredient_totals.values(), key=lambda x: x["cost"], reverse=True)[:6]
    exposure_list = [
        {
            "ingredient": e["ingredient"],
            "appears_in_dishes": e["dishes"],
            "estimated_total_cost_contribution": round(e["cost"], 2),
            "exposure_pct": round(e["cost"] / total_ing_cost * 100, 1) if total_ing_cost else 0,
        }
        for e in exposures_sorted
    ]

    # Category economics
    categories: dict[str, list[float]] = {}
    for dish in dishes:
        categories.setdefault(dish["category"], []).append(dish["estimated_food_cost_pct"])
    cat_list = [
        {
            "category": cat,
            "dish_count": len(fcps),
            "average_food_cost_pct": round(sum(fcps) / len(fcps), 1),
            "margin_signal": _compute_margin_signal(round(sum(fcps) / len(fcps), 1)),
        }
        for cat, fcps in categories.items()
    ]

    # Top opportunities: dishes with worst margin signal, sorted by food_cost_pct desc
    opportunities = []
    for d in sorted(risky + watch, key=lambda x: x["estimated_food_cost_pct"], reverse=True)[:4]:
        opp_desc = (
            f"Food cost is {d['estimated_food_cost_pct']:.0f}% — review ingredient portions "
            f"and check latest supplier pricing for key ingredients."
        )
        opportunities.append({
            "dish_name": d["dish_name"],
            "current_food_cost_pct": d["estimated_food_cost_pct"],
            "opportunity_description": opp_desc,
            "estimated_saving_per_dish": round(d["menu_price"] * 0.05, 2),
        })

    # Recommended action
    if risky:
        worst = sorted(risky, key=lambda x: x["estimated_food_cost_pct"], reverse=True)[0]
        action = (
            f"Priority: '{worst['dish_name']}' is your highest food cost item at "
            f"{worst['estimated_food_cost_pct']:.0f}%. Review supplier pricing or adjust "
            f"portion sizing to bring it below 40%."
        )
    elif watch:
        action = (
            f"Your menu is in reasonable shape but {len(watch)} dishes are in the Watch zone. "
            f"Focus on the highest-volume dishes to maximise margin impact."
        )
    else:
        action = "Your menu economics look healthy. Connect real supplier data to get precise recommendations."

    # Rough monthly opportunity (assume 100 covers/day, 25 days, portion of dishes)
    est_monthly = None
    if risky or watch:
        total_opportunity = sum(
            d["menu_price"] * 0.06
            for d in (risky + watch)
        ) * 100 * 25 / len(dishes)
        est_monthly = round(total_opportunity / 100) * 100  # round to nearest 100

    return {
        "menu_health_score": score,
        "average_food_cost_pct": avg_fcp,
        "margin_risk_count": len(risky),
        "watch_count": len(watch),
        "healthy_count": len(healthy),
        "largest_ingredient_exposures": exposure_list,
        "category_economics": cat_list,
        "top_margin_opportunities": opportunities,
        "recommended_action": action,
        "estimated_monthly_opportunity": est_monthly,
        "currency": currency,
    }


async def analyze_menu_from_scan(
    scan_id: str,
    org_id: str,
    user_id: str,
    image_url: str,
    supabase: Any,
    request_id: str | None = None,
) -> dict[str, Any]:
    """
    Run the full Menu X-Ray pipeline for a given scan.
    Returns the full analysis dict (matches MenuXRayAnalysis schema).
    Persists to menu_xray_analyses table.
    """
    from app.services.llm_failover import AllProvidersFailed, get_completion_with_failover  # noqa: I001

    logger.info("Menu X-Ray analysis started", scan_id=scan_id, org_id=org_id)

    # ── Step 1: Extract dishes via vision LLM ─────────────────────────────────
    dishes_raw: list[dict] = []
    menu_name = "Uploaded Menu"
    currency = "SGD"
    extraction_confidence = 0.7
    extraction_error: str | None = None

    try:
        extraction_resp = await get_completion_with_failover(
            system_prompt=MENU_EXTRACTION_SYSTEM_PROMPT,
            user_content="Please extract all dishes from this menu image.",
            is_vision=True,
            image_data=image_url,
            metadata={"scan_id": scan_id, "stage": "menu_extraction", "request_id": request_id},
            expect_json=True,
            provider_timeout_seconds=45,
        )
        parsed = extraction_resp.get("parsed_json") or {}
        menu_name = parsed.get("menu_name") or "Uploaded Menu"
        currency = parsed.get("currency") or "SGD"
        extraction_confidence = float(parsed.get("confidence") or 0.7)
        dishes_raw = parsed.get("dishes") or []
        logger.info(
            "Menu extraction complete",
            scan_id=scan_id,
            dishes_found=len(dishes_raw),
            provider=extraction_resp.get("provider"),
        )
    except AllProvidersFailed as exc:
        extraction_error = str(exc)
        logger.warning("All providers failed for menu extraction", scan_id=scan_id, error=extraction_error)
    except Exception as exc:
        extraction_error = str(exc)
        logger.error("Menu extraction error", scan_id=scan_id, error=extraction_error)

    # Fallback: empty extraction triggers a partial result rather than hard fail
    if not dishes_raw:
        logger.warning("No dishes extracted, returning partial analysis", scan_id=scan_id)
        partial_result: dict[str, Any] = {
            "analysis_id": str(uuid4()),
            "scan_id": scan_id,
            "user_id": user_id,
            "org_id": org_id,
            "menu_name": menu_name,
            "currency": currency,
            "dishes_detected": 0,
            "analysis_confidence": 0.1,
            "created_at": datetime.now(UTC).isoformat(),
            "dishes": [],
            "insights": _build_insights_from_dishes([], currency),
            "is_sample": False,
            "estimates_disclaimer": (
                "Menu extraction returned no dishes. The image may be low quality or "
                "not a recognisable menu format. Please re-upload a clearer image."
            ),
        }
        await _persist_analysis(supabase, scan_id, org_id, user_id, menu_name, currency, partial_result)
        return partial_result

    # ── Step 2: Infer ingredients and estimate costs ───────────────────────────
    dish_list_str = json.dumps(
        [{"dish_name": d.get("dish_name"), "menu_price": d.get("menu_price"), "currency": currency}
         for d in dishes_raw[:20]],  # cap to 20 dishes per LLM call
        ensure_ascii=False,
    )
    cost_results: dict[str, dict] = {}

    try:
        cost_resp = await get_completion_with_failover(
            system_prompt=COST_INFERENCE_SYSTEM_PROMPT,
            user_content=f"Estimate ingredient costs for these dishes (currency: {currency}):\n{dish_list_str}",
            is_vision=False,
            image_data=None,
            metadata={"scan_id": scan_id, "stage": "cost_inference", "request_id": request_id},
            expect_json=True,
            provider_timeout_seconds=60,
        )
        cost_parsed = cost_resp.get("parsed_json") or {}
        for da in cost_parsed.get("dish_analyses") or []:
            cost_results[da["dish_name"]] = da
    except Exception as exc:
        logger.warning("Cost inference LLM error — proceeding with rule-based fallback", scan_id=scan_id, error=str(exc))

    # ── Step 3: Build structured dishes ───────────────────────────────────────
    dishes: list[dict] = []
    for raw in dishes_raw[:20]:
        name = raw.get("dish_name") or "Unknown Dish"
        price = float(raw.get("menu_price") or 0)
        cat = raw.get("category") or "Other"

        cost_data = cost_results.get(name, {})
        ings_raw = cost_data.get("inferred_ingredients") or []
        cost_low = float(cost_data.get("estimated_total_cost_low") or price * 0.28)
        cost_high = float(cost_data.get("estimated_total_cost_high") or price * 0.38)
        ing_conf = float(cost_data.get("confidence") or 0.55)

        cost_mid = (cost_low + cost_high) / 2
        fcp = round(cost_mid / price * 100, 1) if price > 0 else 0.0

        ing_objs = [
            {
                "ingredient": i.get("ingredient", ""),
                "quantity": float(i.get("quantity") or 0),
                "unit": i.get("unit") or "unit",
                "estimated_cost_low": float(i.get("estimated_cost_low") or 0),
                "estimated_cost_high": float(i.get("estimated_cost_high") or 0),
                "estimated_cost": round(
                    (float(i.get("estimated_cost_low") or 0) + float(i.get("estimated_cost_high") or 0)) / 2, 2
                ),
            }
            for i in ings_raw
        ]

        dishes.append({
            "dish_name": name,
            "menu_price": price,
            "currency": currency,
            "category": cat,
            "description": raw.get("description"),
            "inferred_ingredients": ing_objs,
            "estimated_ingredient_cost": round(cost_low, 2),
            "estimated_ingredient_cost_max": round(cost_high, 2),
            "estimated_food_cost_pct": fcp,
            "confidence": round(extraction_confidence * ing_conf, 2),
            "margin_signal": _compute_margin_signal(fcp),
        })

    # ── Step 4: Aggregate insights ────────────────────────────────────────────
    overall_confidence = round(
        extraction_confidence * (0.8 if cost_results else 0.5), 2
    )
    insights = _build_insights_from_dishes(dishes, currency)

    analysis: dict[str, Any] = {
        "analysis_id": str(uuid4()),
        "scan_id": scan_id,
        "user_id": user_id,
        "org_id": org_id,
        "menu_name": menu_name,
        "currency": currency,
        "dishes_detected": len(dishes),
        "analysis_confidence": overall_confidence,
        "created_at": datetime.now(UTC).isoformat(),
        "dishes": dishes,
        "insights": insights,
        "is_sample": False,
        "estimates_disclaimer": (
            "All ingredient costs and food cost percentages are AI estimates based on "
            "typical market prices. Connect real supplier data for precise figures."
        ),
    }

    await _persist_analysis(supabase, scan_id, org_id, user_id, menu_name, currency, analysis)
    logger.info("Menu X-Ray analysis complete", scan_id=scan_id, dishes=len(dishes))
    return analysis


async def _persist_analysis(
    supabase: Any,
    scan_id: str | None,
    org_id: str,
    user_id: str,
    menu_name: str,
    currency: str,
    analysis: dict[str, Any],
) -> None:
    """Upsert analysis record in menu_xray_analyses table."""
    try:
        row = {
            "organization_id": org_id or None,
            "user_id": user_id or None,
            "menu_name": menu_name,
            "currency": currency,
            "dishes_detected": analysis.get("dishes_detected", 0),
            "analysis_confidence": analysis.get("analysis_confidence", 0),
            "analysis_result": analysis,
            "is_sample": analysis.get("is_sample", False),
        }
        if scan_id:
            row["scan_id"] = scan_id

        await supabase.table("menu_xray_analyses").insert(row).execute()
        logger.info("Menu X-Ray analysis persisted", scan_id=scan_id)
    except Exception as exc:
        logger.error("Failed to persist menu X-Ray analysis", scan_id=scan_id, error=str(exc))


async def get_analysis_by_scan_id(scan_id: str, supabase: Any) -> dict[str, Any] | None:
    """Retrieve analysis by scan_id."""
    try:
        resp = await (
            supabase.table("menu_xray_analyses")
            .select("analysis_result")
            .eq("scan_id", scan_id)
            .order("created_at", desc=True)
            .limit(1)
            .execute()
        )
        rows = resp.data or []
        if rows:
            return rows[0].get("analysis_result")
    except Exception as exc:
        logger.error("Failed to fetch menu X-Ray analysis", scan_id=scan_id, error=str(exc))
    return None
