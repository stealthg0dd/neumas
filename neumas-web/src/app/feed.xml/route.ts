import { buildResourceFeed } from "@/lib/resource-feed";

export const revalidate = 3600;

export async function GET() {
  return new Response(buildResourceFeed(), {
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
      "Cache-Control": "public, max-age=3600, s-maxage=3600",
    },
  });
}