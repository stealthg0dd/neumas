import { PublicHubPage } from "@/components/public/PublicHubPage";
import { buildHubMetadata, getPublicHub } from "@/lib/public-hubs";

const hub = getPublicHub("/solutions")!;
export const metadata = buildHubMetadata(hub);

export default function SolutionsIndexPage() {
  return <PublicHubPage hub={hub} />;
}