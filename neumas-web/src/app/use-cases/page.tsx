import { PublicHubPage } from "@/components/public/PublicHubPage";
import { buildHubMetadata, getPublicHub } from "@/lib/public-hubs";

const hub = getPublicHub("/use-cases")!;
export const metadata = buildHubMetadata(hub);

export default function UseCasesIndexPage() {
  return <PublicHubPage hub={hub} />;
}