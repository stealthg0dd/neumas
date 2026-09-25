import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { ArrowRight } from "lucide-react";

export function OperatorShellPage({
  eyebrow,
  title,
  description,
  icon: Icon,
  primaryAction,
  secondaryAction,
  modules,
}: {
  eyebrow: string;
  title: string;
  description: string;
  icon: LucideIcon;
  primaryAction?: { label: string; href: string };
  secondaryAction?: { label: string; href: string };
  modules: Array<{
    title: string;
    status: "Live" | "Linked" | "Not available";
    body: string;
    href?: string;
  }>;
}) {
  return (
    <main className="min-h-screen bg-slate-50 px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-sky-50 text-sky-700">
                <Icon className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-sky-700">{eyebrow}</p>
                <h1 className="mt-1 text-2xl font-semibold text-slate-950">{title}</h1>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">{description}</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {secondaryAction && (
                <Link href={secondaryAction.href} className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                  {secondaryAction.label}
                </Link>
              )}
              {primaryAction && (
                <Link href={primaryAction.href} className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800">
                  {primaryAction.label}
                  <ArrowRight className="h-4 w-4" />
                </Link>
              )}
            </div>
          </div>
        </header>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {modules.map((module) => (
            <div key={module.title} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <h2 className="text-base font-semibold text-slate-950">{module.title}</h2>
                <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs font-semibold text-slate-600">
                  {module.status}
                </span>
              </div>
              <p className="mt-3 text-sm leading-6 text-slate-600">{module.body}</p>
              {module.href && (
                <Link href={module.href} className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-sky-700 hover:text-sky-800">
                  Open <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              )}
            </div>
          ))}
        </section>
      </div>
    </main>
  );
}
