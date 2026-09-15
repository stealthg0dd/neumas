import "server-only";

import { createClient } from "@/utils/supabase/server";

import type { MarketingVideo, Metric, TeamMember } from "./content";

export type CmsSection = {
  eyebrow?: string;
  headline?: string;
  body?: string;
  enabled: boolean;
};

export type MarketingCmsContent = {
  sections: Record<string, CmsSection>;
  metrics: Metric[] | null;
  team: TeamMember[] | null;
  integrations: readonly string[] | null;
  videos: MarketingVideo[] | null;
};

type CmsRow = Record<string, unknown>;

function isApproved(row: CmsRow): boolean {
  return row.approved_for_public === true;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function localPath(value: string | null): string | null {
  return value?.startsWith("/") ? value : null;
}

function sortRows(rows: CmsRow[]): CmsRow[] {
  return [...rows].sort((a, b) => Number(a.display_order ?? 0) - Number(b.display_order ?? 0));
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export async function getApprovedMarketingCmsContent(): Promise<MarketingCmsContent | null> {
  try {
    const supabase = await createClient();
    const [sectionsRes, metricsRes, teamRes, integrationsRes, videosRes, assetsRes] = await Promise.all([
      supabase.from("cms_homepage_sections").select("*").order("display_order"),
      supabase.from("cms_metrics").select("*").order("display_order"),
      supabase.from("cms_team").select("*").order("display_order"),
      supabase.from("cms_integrations").select("*").order("display_order"),
      supabase.from("cms_videos").select("*").order("display_order"),
      supabase.from("cms_media_assets").select("*"),
    ]);

    if (sectionsRes.error || metricsRes.error || teamRes.error || integrationsRes.error || videosRes.error || assetsRes.error) {
      return null;
    }

    const assetsById = new Map(
      (assetsRes.data ?? []).filter(isApproved).map((asset) => [String(asset.id), asset])
    );

    const sections = Object.fromEntries(
      sortRows((sectionsRes.data ?? []).filter(isApproved)).flatMap((section) => {
        const key = text(section.section_key);
        if (!key) return [];
        return [
          [
            key,
            {
              eyebrow: text(section.eyebrow) ?? undefined,
              headline: text(section.headline) ?? undefined,
              body: text(section.body) ?? undefined,
              enabled: section.enabled !== false,
            },
          ],
        ];
      })
    );

    const metrics = sortRows((metricsRes.data ?? []).filter(isApproved)).map((metric, index) => ({
      value: text(metric.value) ?? "",
      label: text(metric.label) ?? "",
      note: text(metric.evidence_note) ?? text(metric.qualifier) ?? "",
      tone: index % 3 === 0 ? "blue" : index % 3 === 1 ? "yellow" : "green",
    })) satisfies Metric[];

    const team = sortRows((teamRes.data ?? []).filter(isApproved)).map((member) => {
      const name = text(member.name) ?? "Neumas team";
      const asset = member.headshot_asset_id ? assetsById.get(String(member.headshot_asset_id)) : null;
      const imageUrl = asset ? localPath(text(asset.url) ?? text(asset.storage_path)) : null;
      return {
        name,
        role: text(member.title) ?? "Neumas team",
        initials: initials(name),
        bio: text(member.short_bio) ?? "Building Neumas for F&B operators.",
        image: imageUrl
          ? {
              src: imageUrl,
              alt: text(asset?.alt_text) ?? `${name}, Neumas team`,
            }
          : undefined,
      } satisfies TeamMember;
    });

    const integrations = sortRows((integrationsRes.data ?? []).filter(isApproved))
      .map((integration) => text(integration.name))
      .filter((name): name is string => Boolean(name));

    const videos = sortRows((videosRes.data ?? []).filter(isApproved)).map((video) => {
      const poster = video.poster_asset_id ? assetsById.get(String(video.poster_asset_id)) : null;
      return {
        title: text(video.title) ?? "Neumas video",
        role: text(video.placement) ?? "Marketing video",
        src: text(video.video_url) ?? "",
        poster: localPath(text(poster?.url) ?? text(poster?.storage_path)) ?? "/marketing/neumas/videos/neumas-intro-poster.jpg",
        posterAlt: text(poster?.alt_text) ?? "Neumas marketing video poster",
      } satisfies MarketingVideo;
    });

    return {
      sections,
      metrics: metrics.length > 0 ? metrics : null,
      team: team.length > 0 ? team : null,
      integrations: integrations.length > 0 ? integrations : null,
      videos: videos.length > 0 ? videos : null,
    };
  } catch {
    return null;
  }
}
