"use client";

import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

import { track } from "@/lib/analytics";

type MarketingEventLinkProps = Omit<ComponentProps<typeof Link>, "onClick"> & {
  children: ReactNode;
  afterClick?: () => void;
} & (
    | { event: "marketing_demo_click"; props: { location: string } }
    | { event: "marketing_partner_click"; props: { location: string } }
    | { event: "marketing_login_clicked"; props: { location: string } }
  );

export function MarketingEventLink({ children, event, props, afterClick, ...linkProps }: MarketingEventLinkProps) {
  return (
    <Link
      {...linkProps}
      onClick={() => {
        if (event === "marketing_demo_click") track(event, props);
        if (event === "marketing_partner_click") track(event, props);
        if (event === "marketing_login_clicked") track(event, props);
        afterClick?.();
      }}
    >
      {children}
    </Link>
  );
}
