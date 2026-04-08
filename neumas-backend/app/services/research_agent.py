"""
Neumas Research Agent — generates grocery intelligence blog posts
by combining public trend data with anonymized platform insights.
"""

from __future__ import annotations

import json
import re
from datetime import UTC, datetime
from typing import Any

from anthropic import AsyncAnthropic

from app.core.config import settings
from app.core.logging import get_logger

logger = get_logger(__name__)

RESEARCH_TOPICS = [
    "grocery inflation trends in Southeast Asia {month} {year}",
    "food waste reduction strategies for households",
    "AI-powered pantry management benefits",
    "grocery shopping habits in Singapore",
    "household food budgeting strategies APAC",
    "stockout prediction and smart home pantry",
]


async def generate_research_post(topic_template: str | None = None) -> dict[str, Any]:
    """Generate a research blog post using Claude."""
    now = datetime.now(UTC)
    raw_topic = topic_template or RESEARCH_TOPICS[now.month % len(RESEARCH_TOPICS)]
    topic = raw_topic.format(month=now.strftime("%B"), year=now.year)

    if settings.DEV_MODE or not settings.ANTHROPIC_API_KEY:
        logger.warning("DEV_MODE or missing ANTHROPIC_API_KEY — returning stub research post")
        slug = f"stub-research-{now.strftime('%Y-%m')}"
        return {
            "slug": slug,
            "title": f"Research: {topic[:60]}",
            "summary": "Stub article generated in dev mode without calling Claude.",
            "content": f"# {topic}\n\nThis is a **stub** article. Enable `ANTHROPIC_API_KEY` and disable `DEV_MODE` for full content.\n",
            "category": "ai-intelligence",
            "tags": ["stub", "dev"],
        }

    client = AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY)

    prompt = f"""You are a food economics researcher writing for Neumas,
an AI-powered grocery intelligence platform.

Write a research article about: {topic}

The article should be:
- 600-800 words
- Data-driven with specific statistics (use realistic estimates if exact data unavailable, cite as "estimated")
- Focused on actionable insights for households in SEA/APAC markets
- Connected to how AI and smart pantry management can help
- Written in clear, accessible English (not academic jargon)

Return ONLY valid JSON with these fields:
{{
  "title": "compelling headline under 70 chars",
  "summary": "2-sentence summary under 160 chars",
  "content": "full article in markdown",
  "category": "one of: grocery-trends|food-waste|ai-intelligence|budgeting|sustainability",
  "tags": ["tag1", "tag2", "tag3"]
}}"""

    response = await client.messages.create(
        model="claude-sonnet-4-20250514",
        max_tokens=2000,
        messages=[{"role": "user", "content": prompt}],
    )

    text_parts: list[str] = []
    for block in response.content:
        if hasattr(block, "text"):
            text_parts.append(block.text)
    text = "".join(text_parts).strip()
    text = re.sub(r"^```json\s*", "", text)
    text = re.sub(r"\s*```$", "", text)

    try:
        data = json.loads(text)
    except json.JSONDecodeError as exc:
        logger.error("research_agent: invalid JSON from Claude", error=str(exc), preview=text[:400])
        raise

    slug = re.sub(r"[^a-z0-9]+", "-", str(data["title"]).lower()).strip("-")[:80]
    slug = f"{slug}-{now.strftime('%Y-%m')}"

    return {
        "slug": slug,
        "title": data["title"],
        "summary": data["summary"],
        "content": data["content"],
        "category": data.get("category", "general"),
        "tags": data.get("tags", []),
    }
