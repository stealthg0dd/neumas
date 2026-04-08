import Link from "next/link";

export function InsightsMarketingHeader() {
  return (
    <header className="sticky top-0 z-50 border-b border-gray-100/80 bg-white/80 backdrop-blur-md">
      <nav className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
        <Link href="/" className="font-mono text-lg font-bold tracking-tight text-gray-900">
          NEUMAS
        </Link>
        <div className="hidden items-center gap-8 text-sm font-medium text-gray-600 md:flex">
          <Link href="/#how-it-works" className="transition-colors hover:text-gray-900">
            How it works
          </Link>
          <Link href="/#pricing" className="transition-colors hover:text-gray-900">
            Pricing
          </Link>
          <Link href="/insights" className="text-blue-600">
            Insights
          </Link>
        </div>
        <div className="flex items-center gap-2 sm:gap-3">
          <Link
            href="/auth"
            className="rounded-lg px-3 py-2 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-50 hover:text-gray-900 sm:px-4"
          >
            Sign in
          </Link>
          <Link
            href="/auth"
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-700 sm:px-5"
          >
            Start free trial
          </Link>
        </div>
      </nav>
    </header>
  );
}
