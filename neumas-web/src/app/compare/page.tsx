import { PublicHubPage } from "@/components/public/PublicHubPage";
import { buildHubMetadata, getPublicHub } from "@/lib/public-hubs";

const hub = getPublicHub("/compare")!;
export const metadata = buildHubMetadata(hub);

export default function CompareIndexPage() {
  return <PublicHubPage hub={hub} />;
}