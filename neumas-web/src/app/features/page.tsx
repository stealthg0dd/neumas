import { PublicHubPage } from "@/components/public/PublicHubPage";
import { buildHubMetadata, getPublicHub } from "@/lib/public-hubs";

const hub = getPublicHub("/features")!;
export const metadata = buildHubMetadata(hub);

export default function FeaturesIndexPage() {
  return <PublicHubPage hub={hub} />;
}