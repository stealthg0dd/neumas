import { CircleDashed } from "lucide-react";

import { EmptyState as BaseEmptyState } from "@/components/ui/EmptyState";

export function EmptyState({
  headline,
  body,
  cta,
}: {
  headline: string;
  body: string;
  cta?: { label: string; href: string };
}) {
  return <BaseEmptyState icon={CircleDashed} headline={headline} body={body} cta={cta} />;
}
