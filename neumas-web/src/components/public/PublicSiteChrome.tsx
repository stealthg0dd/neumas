import Link from "next/link";

const headerLinks = [
  { href: "/about", label: "About" },
  { href: "/how-it-works", label: "How it works" },
  { href: "/features/inventory-intelligence", label: "Features" },
  { href: "/solutions/restaurant-inventory-management", label: "Solutions" },
  { href: "/use-cases/restaurants", label: "Use cases" },
  { href: "/guides", label: "Guides" },
  { href: "/integrations", label: "Integrations" },
  { href: "/contact", label: "Contact" },
];

const footerColumns = [
  {
    title: "Product",
    links: [
      { href: "/", label: "Homepage" },
      { href: "/how-it-works", label: "How it works" },
      { href: "/features/receipt-invoice-processing", label: "Receipt and invoice processing" },
      { href: "/features/inventory-intelligence", label: "Inventory intelligence" },
      { href: "/features/reorder-planning", label: "Reorder planning" },
      { href: "/features/vendor-intelligence", label: "Vendor intelligence" },
      { href: "/features/multi-location-operations", label: "Multi-location operations" },
    ],
  },
  {
    title: "Solutions",
    links: [
      { href: "/solutions/invoice-intelligence", label: "Invoice intelligence" },
      { href: "/solutions/restaurant-inventory-management", label: "Restaurant inventory management" },
      { href: "/solutions/food-cost-control", label: "Food cost control" },
      { href: "/solutions/procurement-intelligence", label: "Procurement intelligence" },
      { href: "/solutions/predictive-reordering", label: "Predictive reordering" },
    ],
  },
  {
    title: "Guides",
    links: [
      { href: "/guides", label: "All guides" },
      { href: "/guides/restaurant-inventory-management", label: "Restaurant inventory management guide" },
      { href: "/guides/restaurant-food-cost-control", label: "Restaurant food cost control guide" },
    ],
  },
  {
    title: "Use cases",
    links: [
      { href: "/use-cases/restaurants", label: "Restaurants" },
      { href: "/use-cases/cafes-bakeries", label: "Cafes and bakeries" },
      { href: "/use-cases/cloud-kitchens", label: "Cloud kitchens" },
      { href: "/use-cases/multi-outlet-groups", label: "Multi-outlet groups" },
      { href: "/integrations", label: "Integrations" },
    ],
  },
  {
    title: "Company",
    links: [
      { href: "/about", label: "About" },
      { href: "/contact", label: "Contact" },
      { href: "/data-processing", label: "Data processing" },
      { href: "/responsible-ai", label: "Responsible AI" },
      { href: "/security", label: "Security" },
      { href: "/privacy", label: "Privacy" },
      { href: "/terms", label: "Terms" },
      { href: "/sitemap.xml", label: "Sitemap" },
      { href: "/llms.txt", label: "llms.txt" },
      { href: "/crawler-readiness", label: "Crawler readiness" },
    ],
  },
];

export function PublicSiteHeader() {
  return (
    <header className="sticky top-0 z-30 border-b border-black/[0.06] bg-white/80 backdrop-blur-xl">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-6 px-5 py-4 sm:px-8">
        <Link href="/" className="font-mono text-[15px] font-semibold tracking-[0.08em] text-[#0071a3]">
          NEUMAS
        </Link>

        <nav aria-label="Primary" className="hidden items-center gap-6 md:flex">
          {headerLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-sm font-medium text-gray-600 transition-colors hover:text-gray-900"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <Link href="/auth" className="rounded-full px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-black/[0.04]">
            Sign in
          </Link>
          <Link
            href="/auth"
            className="rounded-full bg-[#0071a3] px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-[#005f8a]"
          >
            Start free
          </Link>
        </div>
      </div>
    </header>
  );
}

export function PublicSiteFooter() {
  return (
    <footer className="border-t border-black/[0.06] bg-[#f5f5f7] px-5 py-14 sm:px-8">
      <div className="mx-auto max-w-7xl">
        <div className="grid gap-10 lg:grid-cols-[1.3fr_repeat(3,1fr)]">
          <div>
            <p className="font-mono text-[14px] font-semibold tracking-[0.08em] text-[#0071a3]">NEUMAS</p>
            <p className="mt-4 max-w-sm text-sm leading-6 text-gray-600">
              Neumas is AI operations software for F&B teams. We turn receipts, invoices, inventory movements,
              vendors, and consumption history into clearer stock records, forecasts, reorder plans, and alerts.
            </p>
            <p className="mt-4 text-sm text-gray-500">team@neumas.cc</p>
          </div>

          {footerColumns.map((column) => (
            <div key={column.title}>
              <h2 className="text-xs font-semibold uppercase tracking-[0.12em] text-gray-700">{column.title}</h2>
              <ul className="mt-4 space-y-3">
                {column.links.map((link) => (
                  <li key={link.href}>
                    <Link href={link.href} className="text-sm text-gray-600 transition-colors hover:text-gray-900">
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-12 flex flex-col gap-3 border-t border-black/[0.06] pt-6 text-sm text-gray-500 sm:flex-row sm:items-center sm:justify-between">
          <p>Public pages are crawlable. Authenticated dashboards and user data are private.</p>
          <p>{new Date().getFullYear()} Neumas</p>
        </div>
      </div>
    </footer>
  );
}
