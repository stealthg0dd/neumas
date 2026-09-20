import { PublicHubPage } from "@/components/public/PublicHubPage";
import { buildHubMetadata, getPublicHub } from "@/lib/public-hubs";

const hub = getPublicHub("/research")!;
export const metadata = buildHubMetadata(hub);

export default function ResearchIndexPage() {
  return <PublicHubPage hub={hub} />;
}