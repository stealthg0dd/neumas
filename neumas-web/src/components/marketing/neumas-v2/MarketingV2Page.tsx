import Image from "next/image";
import { ArrowRight, CheckCircle2, Sparkles } from "lucide-react";

import { LazyVideo } from "./LazyVideo";
import { MarketingEventLink } from "./MarketingEventLink";
import { MarketingLeadForm } from "./MarketingLeadForm";
import { MarketingNav } from "./MarketingNav";
import {
  complianceSignals,
  conversion,
  ecosystemContexts,
  hero,
  integrations,
  marketingAssets,
  metrics,
  outcomes,
  platformInputs,
  platformOutputs,
  productStories,
  partnerTypes,
  receiptWorkflow,
  team,
  useCases,
  videos,
} from "./content";
import type { ProductStory } from "./content";
import type { MarketingCmsContent } from "./marketing-cms";

const sectionShell = "mx-auto w-full max-w-7xl px-5 sm:px-8";

function HeroSection({ section }: { section?: MarketingCmsContent["sections"][string] }) {
  const heroCopy = {
    eyebrow: section?.eyebrow ?? hero.eyebrow,
    headline: section?.headline ?? hero.headline,
    body: section?.body ?? hero.body,
  };

  return (
    <section className="relative overflow-hidden bg-[#f8fbff]">
      <div className={`${sectionShell} grid min-h-[calc(100vh-72px)] items-center gap-10 py-12 lg:grid-cols-[0.9fr_1.1fr] lg:py-14`}>
        <div className="max-w-2xl">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#0b4fd8]">{heroCopy.eyebrow.toUpperCase()}</p>
          <h1 className="mt-5 text-5xl font-bold leading-[1.02] tracking-normal text-[#0b1736] sm:text-6xl xl:text-7xl">
            {heroCopy.headline}
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-8 text-slate-600">{heroCopy.body}</p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <MarketingEventLink
              href={hero.primaryCta.href}
              event="marketing_demo_click"
              props={{ location: "hero_primary" }}
              className="inline-flex items-center justify-center gap-2 rounded-md bg-[#f5c15c] px-5 py-3 text-sm font-bold text-[#0b1736] shadow-sm transition hover:bg-[#e8ae3f]"
            >
              {hero.primaryCta.label}
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </MarketingEventLink>
            <MarketingEventLink
              href={hero.secondaryCta.href}
              event="marketing_demo_click"
              props={{ location: "hero_secondary" }}
              className="inline-flex items-center justify-center gap-2 rounded-md border border-[#0b1736]/15 bg-white px-5 py-3 text-sm font-bold text-[#0b1736] transition hover:border-[#0b4fd8]/40"
            >
              {hero.secondaryCta.label}
            </MarketingEventLink>
          </div>
          <div className="mt-10 grid gap-3 sm:grid-cols-3">
            {complianceSignals.map((signal) => {
              const Icon = signal.icon;
              return (
                <div key={signal.label} className="flex items-center gap-2 text-sm font-medium text-slate-600">
                  <Icon className="h-4 w-4 text-[#0b4fd8]" aria-hidden="true" />
                  <span>{signal.label}</span>
                </div>
              );
            })}
          </div>
        </div>
        <div className="relative">
          <div className="relative overflow-hidden rounded-lg border border-[#0b1736]/10 bg-white shadow-xl shadow-[#0b1736]/10">
            <Image
              src={marketingAssets.hero.src}
              alt={marketingAssets.hero.alt}
              width={1672}
              height={941}
              priority
              className="aspect-[1672/941] w-full object-cover"
            />
            <div className="absolute inset-x-[4%] bottom-[3%] rounded-md border border-[#0b4fd8]/20 bg-white p-3 shadow-lg sm:inset-x-[8%] sm:bottom-[5%]">
              <div className="flex flex-wrap items-center gap-3">
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-md bg-[#eef5ff] text-[#0b4fd8]">
                  <Sparkles className="h-5 w-5" aria-hidden="true" />
                </span>
                <div>
                  <p className="text-sm font-bold text-[#0b1736]">Projected waste-reduction potential up to 30%</p>
                  <p className="text-xs font-medium text-slate-500">Qualified public benchmark, not a historical guarantee.</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function MetricBand({ metricItems }: { metricItems: typeof metrics }) {
  const toneClasses = {
    blue: "border-[#0b4fd8]/20 bg-[#eef5ff]",
    yellow: "border-[#f5c15c]/40 bg-[#fff8e8]",
    green: "border-emerald-500/20 bg-emerald-50",
  };

  return (
    <section className="border-y border-[#0b1736]/10 bg-white py-6" aria-label="Traction metrics">
      <div className={`${sectionShell}`}>
        <div className="grid gap-3 sm:grid-cols-3">
          {metricItems.map((metric) => (
            <div key={metric.label} className={`rounded-lg border px-5 py-4 ${toneClasses[metric.tone]}`}>
              <p className="text-3xl font-bold tracking-normal text-[#0b1736]">{metric.value}</p>
              <h2 className="mt-1 text-sm font-bold uppercase tracking-[0.12em] text-[#0b4fd8]">{metric.label}</h2>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function OutcomesSection() {
  return (
    <section className="bg-white py-20" aria-labelledby="outcomes-heading">
      <div className={`${sectionShell} grid gap-10 lg:grid-cols-[0.82fr_1.18fr] lg:items-start`}>
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#0b4fd8]">Outcomes</p>
          <h2 id="outcomes-heading" className="mt-4 text-4xl font-bold tracking-normal text-[#0b1736]">Clear numbers, clear boundaries.</h2>
          <p className="mt-5 text-base leading-7 text-slate-600">
            Neumas separates measured platform metrics from benchmark opportunities and projected potential, so operators can evaluate the product without inflated claims.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          {outcomes.map((outcome) => (
            <article key={outcome.title} className="rounded-lg border border-[#0b1736]/10 bg-[#f8fbff] p-5">
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#0b4fd8]">{outcome.title}</p>
              <p className="mt-4 text-3xl font-bold tracking-normal text-[#0b1736]">{outcome.value}</p>
              <p className="mt-3 text-sm leading-6 text-slate-600">{outcome.body}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function WorkflowSection() {
  const stepTone = (index: number) =>
    index === 0 || index === 1 || index === 6
      ? "border-[#f5c15c]/40 bg-[#fff8e8]"
      : "border-[#0b4fd8]/20 bg-[#eef5ff]";

  return (
    <section id="workflow" className="bg-[#f8fbff] py-20">
      <div className={sectionShell}>
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#0b4fd8]">Receipt To Reorder</p>
            <h2 className="mt-4 max-w-2xl text-4xl font-bold tracking-normal text-[#0b1736]">From receipt to reorder.</h2>
          </div>
          <p className="max-w-md text-base leading-7 text-slate-600">
            A controlled workflow that keeps people in the approval loop while the system cleans records, detects risk, and recommends action.
          </p>
        </div>

        <div className="mt-12 overflow-x-auto pb-3 lg:overflow-visible">
          <div className="grid min-w-[980px] grid-cols-8 gap-3 lg:min-w-0">
            {receiptWorkflow.map((step, index) => {
              const Icon = step.icon;
              return (
                <article key={step.title} className={`relative rounded-lg border p-4 ${stepTone(index)}`}>
                  {index < receiptWorkflow.length - 1 ? (
                    <div className="absolute -right-3 top-8 hidden h-px w-3 bg-[#0b1736]/20 lg:block" aria-hidden="true" />
                  ) : null}
                  <div className="flex h-10 w-10 items-center justify-center rounded-md bg-white text-[#0b4fd8] shadow-sm">
                    <Icon className="h-5 w-5" aria-hidden="true" />
                  </div>
                  <p className="mt-5 text-xs font-bold uppercase tracking-[0.12em] text-slate-500">Step {index + 1}</p>
                  <h3 className="mt-2 min-h-12 text-sm font-bold leading-5 tracking-normal text-[#0b1736]">{step.title}</h3>
                  <p className="mt-4 rounded-md bg-white/80 px-3 py-2 text-xs font-semibold text-[#0b1736]">{step.microcopy}</p>
                </article>
              );
            })}
          </div>
        </div>

        <div className="mt-10 grid gap-8 lg:grid-cols-[0.95fr_1.05fr]">
          <div className="grid gap-4 sm:grid-cols-2">
            {receiptWorkflow.map((step, index) => {
              const Icon = step.icon;
              return (
                <article key={step.title} className="rounded-lg border border-[#0b1736]/10 bg-white p-5">
                  <div className="flex items-start gap-4">
                    <div className="flex h-10 w-10 flex-none items-center justify-center rounded-md bg-[#eef5ff] text-[#0b4fd8]">
                      <Icon className="h-5 w-5" aria-hidden="true" />
                    </div>
                    <div>
                      <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-400">0{index + 1}</p>
                      <h3 className="mt-1 text-base font-bold tracking-normal text-[#0b1736]">{step.title}</h3>
                      <p className="mt-2 text-sm leading-6 text-slate-600">{step.body}</p>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
          <div className="overflow-hidden rounded-lg border border-[#0b1736]/10 bg-white shadow-xl shadow-[#0b1736]/8">
            <div className="border-b border-[#0b1736]/10 bg-white px-5 py-4">
              <p className="text-sm font-bold text-[#0b1736]">Operator journey reference</p>
              <p className="mt-1 text-xs text-slate-500">Cropped to avoid foregrounding old currency illustrations.</p>
            </div>
          <Image
            src={marketingAssets.workflow.src}
            alt={marketingAssets.workflow.alt}
            width={1672}
            height={941}
              className="h-[420px] w-full object-cover object-[left_18%] sm:h-[520px]"
          />
          </div>
        </div>
      </div>
    </section>
  );
}

function PlatformSection() {
  const itemClasses = (tone: "action" | "data") =>
    tone === "action"
      ? "border-[#f5c15c]/45 bg-[#fff8e8] text-[#7a4b00]"
      : "border-[#0b4fd8]/25 bg-[#eef5ff] text-[#0b4fd8]";

  return (
    <section id="platform" className="bg-white py-20">
      <div className={sectionShell}>
        <div className="max-w-3xl">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#0b4fd8]">Platform</p>
          <h2 className="mt-4 text-4xl font-bold tracking-normal text-[#0b1736]">One platform. Every operational decision.</h2>
          <p className="mt-5 text-base leading-7 text-slate-600">
            Neumas connects daily operational inputs to decision-ready intelligence, using yellow for action states and blue for data intelligence.
          </p>
        </div>

        <div className="mt-12 grid gap-6 lg:grid-cols-[1fr_auto_1.2fr] lg:items-center">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
            {platformInputs.map((item) => {
              const Icon = item.icon;
              return (
                <article key={item.label} className={`rounded-lg border p-4 ${itemClasses(item.tone)}`}>
                  <div className="flex items-start gap-3">
                    <Icon className="mt-1 h-5 w-5 flex-none" aria-hidden="true" />
                    <div>
                      <h3 className="font-bold tracking-normal text-[#0b1736]">{item.label}</h3>
                      <p className="mt-1 text-sm leading-6 text-slate-600">{item.detail}</p>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>

          <div className="flex items-center justify-center">
            <div className="relative flex h-40 w-40 items-center justify-center rounded-lg border border-[#0b1736]/10 bg-[#0b1736] text-white shadow-xl shadow-[#0b1736]/15">
              <svg className="absolute inset-0 h-full w-full" viewBox="0 0 160 160" aria-hidden="true">
                <path d="M16 80H54" stroke="#f5c15c" strokeWidth="4" strokeLinecap="round" />
                <path d="M106 80H144" stroke="#0b7cff" strokeWidth="4" strokeLinecap="round" />
                <path d="M80 16V54" stroke="#0b7cff" strokeWidth="4" strokeLinecap="round" />
                <path d="M80 106V144" stroke="#f5c15c" strokeWidth="4" strokeLinecap="round" />
                <circle cx="80" cy="80" r="36" fill="#ffffff" opacity="0.08" />
              </svg>
              <div className="relative text-center">
                <p className="font-mono text-sm font-bold tracking-[0.14em]">NEUMAS</p>
                <p className="mt-2 text-xs text-white/65">AI ops layer</p>
              </div>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {platformOutputs.map((item) => {
              const Icon = item.icon;
              return (
                <article key={item.label} className={`rounded-lg border p-4 ${itemClasses(item.tone)}`}>
                  <div className="flex items-start gap-3">
                    <Icon className="mt-1 h-5 w-5 flex-none" aria-hidden="true" />
                    <div>
                      <h3 className="font-bold tracking-normal text-[#0b1736]">{item.label}</h3>
                      <p className="mt-1 text-sm leading-6 text-slate-600">{item.detail}</p>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </div>

      </div>
    </section>
  );
}

function VideoSection({ videoItems }: { videoItems: typeof videos }) {
  return (
    <section id="product-demo" className="bg-white py-20">
      <div className={`${sectionShell} grid gap-10 lg:grid-cols-[0.85fr_1.15fr] lg:items-center`}>
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#0b4fd8]">See How Neumas Works</p>
          <h2 className="mt-4 text-4xl font-bold tracking-normal text-[#0b1736]">Watch receipt capture become operating data.</h2>
          <p className="mt-5 text-base leading-7 text-slate-600">
            Demo V1 sits with the workflow narrative, stays user-initiated, and loads the video file only after the poster is clicked.
          </p>
        </div>
        <article className="overflow-hidden rounded-lg border border-[#0b1736]/10 bg-white shadow-xl shadow-[#0b1736]/8">
          <LazyVideo title={videoItems[1].title} src={videoItems[1].src} poster={videoItems[1].poster} posterAlt={videoItems[1].posterAlt} />
          <div className="border-t border-[#0b1736]/10 p-5">
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#0b4fd8]">{videoItems[1].role}</p>
            <h3 className="mt-3 text-lg font-bold tracking-normal text-[#0b1736]">{videoItems[1].title}</h3>
          </div>
        </article>
      </div>
    </section>
  );
}

function DeepDemoSection({ videoItems }: { videoItems: typeof videos }) {
  return (
    <section className="bg-[#0b1736] py-20 text-white">
      <div className={`${sectionShell} grid gap-10 lg:grid-cols-[1.15fr_0.85fr] lg:items-center`}>
        <article className="overflow-hidden rounded-lg border border-white/15 bg-white/8">
          <LazyVideo title={videoItems[2].title} src={videoItems[2].src} poster={videoItems[2].poster} posterAlt={videoItems[2].posterAlt} />
          <div className="p-5">
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#f5c15c]">{videoItems[2].role}</p>
            <h3 className="mt-3 text-lg font-bold tracking-normal">{videoItems[2].title}</h3>
          </div>
        </article>
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#f5c15c]">Deeper Product Demo</p>
          <h2 className="mt-4 text-4xl font-bold tracking-normal">Go deeper into recommendations, dashboards, and follow-up.</h2>
          <p className="mt-5 text-base leading-7 text-white/70">
            Demo V2 appears lower on the page so visitors can explore detail after the product story, without loading all media on the initial viewport.
          </p>
        </div>
      </div>
    </section>
  );
}

function MobileOperationsSection() {
  return (
    <section className="bg-white py-20">
      <div className={`${sectionShell} grid gap-12 lg:grid-cols-[0.9fr_1.1fr] lg:items-center`}>
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#0b4fd8]">Responsive Operations</p>
          <h2 className="mt-4 text-4xl font-bold tracking-normal text-[#0b1736]">Operations intelligence wherever the work happens.</h2>
          <p className="mt-5 text-base leading-7 text-slate-600">
            Neumas is presented as responsive, PWA-style web usage for operators moving between office, storeroom, receiving area, and kitchen.
          </p>
          <div className="mt-8 grid gap-3 sm:grid-cols-2">
            {["Scan supplier paperwork", "Review alerts during prep", "Approve reorder plans", "Check outlet health"].map((item) => (
              <p key={item} className="flex gap-3 text-sm font-medium text-slate-700">
                <CheckCircle2 className="mt-0.5 h-4 w-4 flex-none text-[#f5c15c]" aria-hidden="true" />
                <span>{item}</span>
              </p>
            ))}
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-[0.72fr_1fr] sm:items-center">
          <div className="mx-auto w-full max-w-[260px] rounded-[2rem] border-8 border-[#0b1736] bg-[#0b1736] shadow-2xl shadow-[#0b1736]/20">
            <div className="overflow-hidden rounded-[1.35rem] bg-white">
              <div className="bg-[#f8fbff] px-4 py-5">
                <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#0b4fd8]">Outlet A</p>
                <h3 className="mt-2 text-lg font-bold tracking-normal text-[#0b1736]">Daily check</h3>
              </div>
              <div className="space-y-3 p-4">
                <div className="rounded-md border border-[#f5c15c]/45 bg-[#fff8e8] p-3">
                  <p className="text-sm font-bold text-[#0b1736]">Low stock</p>
                  <p className="mt-1 text-xs text-slate-600">Tomatoes below par</p>
                </div>
                <div className="rounded-md border border-[#0b4fd8]/20 bg-[#eef5ff] p-3">
                  <p className="text-sm font-bold text-[#0b1736]">Suggested reorder</p>
                  <p className="mt-1 text-xs text-slate-600">SGD 420 estimated plan</p>
                </div>
                <p className="rounded-md bg-[#0b4fd8] px-4 py-3 text-center text-sm font-bold text-white">Approve plan</p>
              </div>
            </div>
          </div>
          <div className="rounded-lg border border-[#0b1736]/10 bg-[#f8fbff] p-5">
            <p className="text-sm font-bold text-[#0b1736]">Responsive web workspace</p>
            <div className="mt-5 space-y-4">
              <MiniBar label="Inventory health" value="86%" />
              <MiniBar label="Open alerts reviewed" value="64%" tone="yellow" />
              <MiniBar label="Ordering accuracy" value="92%" tone="green" />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function UseCaseSection() {
  return (
    <section id="use-cases" className="bg-[#f8fbff] py-20">
      <div className={sectionShell}>
        <div className="max-w-3xl">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#0b4fd8]">Operator Use Cases</p>
          <h2 className="mt-4 text-4xl font-bold tracking-normal text-[#0b1736]">Built for teams that buy, prep, serve, and reconcile every day.</h2>
        </div>
        <div className="mt-10 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {useCases.map((useCase) => {
            const Icon = useCase.icon;
            return (
              <article key={useCase.title} className="rounded-lg border border-[#0b1736]/10 bg-white p-6">
                <Icon className="h-6 w-6 text-[#0b4fd8]" aria-hidden="true" />
                <h3 className="mt-5 text-lg font-bold tracking-normal text-[#0b1736]">{useCase.title}</h3>
                <p className="mt-3 text-sm leading-6 text-slate-600">{useCase.body}</p>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function MiniBar({ label, value, tone = "blue" }: { label: string; value: string; tone?: "blue" | "yellow" | "green" }) {
  const width = Number.parseInt(value, 10);
  const color = tone === "yellow" ? "bg-[#f5c15c]" : tone === "green" ? "bg-emerald-500" : "bg-[#0b4fd8]";

  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-4 text-xs font-semibold text-slate-500">
        <span>{label}</span>
        <span>{value}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-slate-100">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.min(width, 100)}%` }} />
      </div>
    </div>
  );
}

function ProductScene({ scene }: { scene: ProductStory["scene"] }) {
  if (scene === "inventory") {
    return (
      <div className="rounded-lg border border-[#0b1736]/10 bg-white p-5 shadow-xl shadow-[#0b1736]/8">
        <div className="flex items-center justify-between border-b border-[#0b1736]/10 pb-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#0b4fd8]">Outlet A</p>
            <h3 className="mt-1 text-xl font-bold tracking-normal text-[#0b1736]">Live Inventory</h3>
          </div>
          <p className="rounded-md bg-[#eef5ff] px-3 py-2 text-sm font-bold text-[#0b4fd8]">SGD 34,680</p>
        </div>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <div className="rounded-md bg-[#f8fbff] p-4">
            <p className="text-sm font-bold text-[#0b1736]">Stock levels</p>
            <div className="mt-4 space-y-4">
              <MiniBar label="Chicken breast" value="74%" />
              <MiniBar label="Tomatoes" value="42%" tone="yellow" />
              <MiniBar label="Olive oil" value="86%" tone="green" />
              <MiniBar label="Mozzarella" value="29%" tone="yellow" />
            </div>
          </div>
          <div className="rounded-md bg-[#fff8e8] p-4">
            <p className="text-sm font-bold text-[#0b1736]">Movement signals</p>
            <div className="mt-4 space-y-3 text-sm text-slate-600">
              <p className="flex justify-between gap-4"><span>Low-stock risk</span><strong className="text-[#7a4b00]">4 items</strong></p>
              <p className="flex justify-between gap-4"><span>Inventory movement</span><strong className="text-[#0b1736]">+12.5%</strong></p>
              <p className="flex justify-between gap-4"><span>Expiry watch</span><strong className="text-[#7a4b00]">2 days</strong></p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (scene === "prediction") {
    return (
      <div className="rounded-lg border border-[#0b1736]/10 bg-white p-5 shadow-xl shadow-[#0b1736]/8">
        <div className="grid gap-4 lg:grid-cols-[1fr_0.82fr]">
          <div className="rounded-md bg-[#eef5ff] p-5">
            <p className="text-sm font-bold text-[#0b1736]">Forecast</p>
            <div className="mt-6 flex h-40 items-end gap-3">
              {[42, 56, 61, 68, 74, 81, 76].map((height, index) => (
                <div key={height} className="flex flex-1 flex-col items-center gap-2">
                  <div className="w-full rounded-t-md bg-[#0b4fd8]" style={{ height: `${height}%` }} />
                  <span className="text-[10px] font-semibold text-slate-500">D{index + 1}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-md bg-[#fff8e8] p-5">
            <p className="text-sm font-bold text-[#0b1736]">Recommended reorder</p>
            <div className="mt-4 space-y-3 text-sm text-slate-700">
              <p className="flex justify-between gap-4"><span>Chicken breast</span><strong>8 kg</strong></p>
              <p className="flex justify-between gap-4"><span>Tomatoes</span><strong>10 kg</strong></p>
              <p className="flex justify-between gap-4"><span>Onions</span><strong>8 kg</strong></p>
              <p className="flex justify-between gap-4 border-t border-[#0b1736]/10 pt-3"><span>Estimated plan</span><strong>SGD 420</strong></p>
            </div>
            <p className="mt-5 rounded-md bg-[#0b4fd8] px-4 py-3 text-center text-sm font-bold text-white">Manager approval required</p>
          </div>
        </div>
      </div>
    );
  }

  if (scene === "vendors") {
    return (
      <div className="rounded-lg border border-[#0b1736]/10 bg-white p-5 shadow-xl shadow-[#0b1736]/8">
        <div className="grid gap-4 sm:grid-cols-[0.85fr_1fr]">
          <div className="space-y-3">
            {["FreshMart Foods", "Daily Produce Co.", "Harbour Dry Goods"].map((vendor, index) => (
              <div key={vendor} className={`rounded-md border p-4 ${index === 0 ? "border-[#0b4fd8]/30 bg-[#eef5ff]" : "border-[#0b1736]/10 bg-white"}`}>
                <p className="font-bold tracking-normal text-[#0b1736]">{vendor}</p>
                <p className="mt-1 text-xs text-slate-500">Active vendor record</p>
              </div>
            ))}
          </div>
          <div className="rounded-md bg-[#f8fbff] p-5">
            <p className="text-sm font-bold text-[#0b1736]">Vendor analytics</p>
            <div className="mt-5 space-y-4">
              <MiniBar label="Monthly spend" value="68%" />
              <MiniBar label="Price movement" value="18%" tone="yellow" />
              <MiniBar label="Reorder history match" value="82%" tone="green" />
            </div>
            <div className="mt-5 rounded-md border border-[#f5c15c]/45 bg-[#fff8e8] p-4 text-sm text-slate-700">
              Alert: invoice price variance detected on produce category.
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (scene === "cost") {
    return (
      <div className="rounded-lg border border-[#0b1736]/10 bg-white p-5 shadow-xl shadow-[#0b1736]/8">
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-md bg-[#fff8e8] p-5">
            <p className="text-3xl font-bold tracking-normal text-[#0b1736]">Up to 30%</p>
            <p className="mt-2 text-sm font-semibold text-slate-600">Projected waste reduction potential</p>
          </div>
          <div className="rounded-md bg-[#eef5ff] p-5">
            <p className="text-3xl font-bold tracking-normal text-[#0b1736]">6-10%</p>
            <p className="mt-2 text-sm font-semibold text-slate-600">Food-cost benchmark opportunity</p>
          </div>
          <div className="rounded-md bg-emerald-50 p-5">
            <p className="text-3xl font-bold tracking-normal text-[#0b1736]">92%</p>
            <p className="mt-2 text-sm font-semibold text-slate-600">Measured Neumas ordering accuracy</p>
          </div>
        </div>
        <div className="mt-5 rounded-md border border-[#0b1736]/10 p-4">
          <p className="text-sm font-bold text-[#0b1736]">Risk queue</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            {["Low stock", "Over-order risk", "Expiry risk"].map((risk) => (
              <p key={risk} className="rounded-md bg-[#f8fbff] px-3 py-3 text-sm font-semibold text-slate-700">{risk}</p>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-[#0b1736]/10 bg-white p-5 shadow-xl shadow-[#0b1736]/8">
      <div className="grid gap-4 lg:grid-cols-[0.8fr_1fr]">
        <div className="rounded-md bg-[#0b1736] p-5 text-white">
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#f5c15c]">Organization</p>
          <h3 className="mt-2 text-xl font-bold tracking-normal">Group roll-up</h3>
          <div className="mt-6 space-y-3">
            <p className="flex justify-between gap-4"><span>Properties</span><strong>4</strong></p>
            <p className="flex justify-between gap-4"><span>Items tracked</span><strong>1,510+</strong></p>
            <p className="flex justify-between gap-4"><span>Open alerts</span><strong>12</strong></p>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {[
            ["Outlet A", "Healthy", "86%"],
            ["Outlet B", "Review", "72%"],
            ["Outlet C", "Action", "64%"],
            ["Outlet D", "Healthy", "91%"],
          ].map(([outlet, status, health]) => (
            <div key={outlet} className="rounded-md border border-[#0b1736]/10 bg-[#f8fbff] p-4">
              <div className="flex items-center justify-between gap-4">
                <p className="font-bold text-[#0b1736]">{outlet}</p>
                <span className="rounded-md bg-white px-2 py-1 text-xs font-bold text-[#0b4fd8]">{status}</span>
              </div>
              <div className="mt-4">
                <MiniBar label="Outlet health" value={health} tone={status === "Action" ? "yellow" : "blue"} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ProductStorytellingSection() {
  return (
    <section id="solutions" className="bg-[#f8fbff] py-20">
      <div className={sectionShell}>
        <div className="max-w-3xl">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#0b4fd8]">Product Story</p>
          <h2 className="mt-4 text-4xl font-bold tracking-normal text-[#0b1736]">The operating layer between stock, suppliers, and decisions.</h2>
          <p className="mt-5 text-base leading-7 text-slate-600">
            Large product scenes show how Neumas turns existing inventory, prediction, vendor, reporting, and property concepts into a commercial F&B workflow.
          </p>
        </div>
        <div className="mt-14 space-y-14">
          {productStories.map((story, index) => (
            <article
              key={story.headline}
              className={`grid gap-8 lg:grid-cols-2 lg:items-center ${index % 2 === 1 ? "lg:[&>div:first-child]:order-2" : ""}`}
            >
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#0b4fd8]">{story.eyebrow}</p>
                <h3 className="mt-4 text-3xl font-bold tracking-normal text-[#0b1736] sm:text-4xl">{story.headline}</h3>
                <p className="mt-5 text-base leading-7 text-slate-600">{story.body}</p>
                <ul className="mt-7 grid gap-3 sm:grid-cols-2">
                  {story.bullets.map((bullet) => (
                    <li key={bullet} className="flex gap-3 text-sm font-medium text-slate-700">
                      <CheckCircle2 className="mt-0.5 h-4 w-4 flex-none text-[#f5c15c]" aria-hidden="true" />
                      <span>{bullet}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <ProductScene scene={story.scene} />
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function IntegrationsAndUseCases({ integrationItems }: { integrationItems: readonly string[] }) {
  return (
    <section id="integrations" className="bg-white py-20">
      <div className={`${sectionShell} grid gap-10 lg:grid-cols-[0.78fr_1.22fr] lg:items-start`}>
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#0b4fd8]">Connect Your Operation</p>
          <h2 className="mt-4 text-3xl font-bold tracking-normal text-[#0b1736]">F&B ecosystem integrations.</h2>
          <p className="mt-6 text-sm leading-6 text-slate-600">
            StoreHub and Qashier are represented only as integration context in this preview, not customers, partners, pilots, or proof logos.
          </p>
        </div>
        <div className="grid gap-6">
          <div className="grid gap-3 sm:grid-cols-2">
            {integrationItems.map((integration) => (
              <div
                key={integration}
                className="rounded-lg border border-[#0b4fd8]/25 bg-[#eef5ff] p-5"
              >
                <p className="text-sm font-bold text-[#0b1736]">{integration}</p>
                <p className="mt-2 text-xs font-medium text-slate-500">
                  Integration context
                </p>
              </div>
            ))}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {ecosystemContexts.map((context) => (
              <article key={context.title} className="rounded-lg border border-[#0b1736]/10 bg-[#f8fbff] p-5">
                <h3 className="text-sm font-bold tracking-normal text-[#0b1736]">{context.title}</h3>
                <p className="mt-2 text-sm leading-6 text-slate-600">{context.body}</p>
              </article>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function PartnerSection() {
  return (
    <section className="bg-[#f8fbff] py-20">
      <div className={`${sectionShell} grid gap-10 lg:grid-cols-[0.95fr_1.05fr] lg:items-start`}>
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#0b4fd8]">Partner With Neumas</p>
          <h2 className="mt-4 text-4xl font-bold tracking-normal text-[#0b1736]">{conversion.partnerHeadline}</h2>
          <p className="mt-5 text-base leading-7 text-slate-600">{conversion.partnerBody}</p>
          <div className="mt-8 grid gap-3 sm:grid-cols-2">
            {partnerTypes.map((partnerType) => (
              <p key={partnerType} className="rounded-lg border border-[#0b1736]/10 bg-white p-4 text-sm font-semibold text-slate-700">
                {partnerType}
              </p>
            ))}
          </div>
          <MarketingEventLink
            href="#partner-form"
            event="marketing_partner_click"
            props={{ location: "partner_section" }}
            className="mt-8 inline-flex items-center justify-center gap-2 rounded-md bg-[#0b4fd8] px-5 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-[#073fae]"
          >
            Become a Partner
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </MarketingEventLink>
        </div>
        <div id="partner-form" className="rounded-lg border border-[#0b1736]/10 bg-white p-5 shadow-xl shadow-[#0b1736]/8">
          <MarketingLeadForm kind="partner" />
        </div>
      </div>
    </section>
  );
}

function FounderSection({ videoItems }: { videoItems: typeof videos }) {
  const founderVideo = videoItems[0];

  return (
    <section className="bg-[#f8fbff] py-20">
      <div className={`${sectionShell} grid gap-10 lg:grid-cols-[0.88fr_1.12fr] lg:items-center`}>
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#0b4fd8]">Why Neumas</p>
          <h2 className="mt-4 text-4xl font-bold tracking-normal text-[#0b1736]">
            Built around the decisions F&B teams make every day.
          </h2>
          <p className="mt-5 text-base leading-7 text-slate-600">
            F&B teams generate operational data constantly, but invoices, inventory, supplier information and purchasing decisions often remain fragmented. Neumas brings those signals together so operators can see what is changing, understand what is likely to happen next, and act earlier.
          </p>
          <div className="mt-8 border-l-2 border-[#f5c15c] pl-5">
            <p className="text-base font-bold text-[#0b1736]">Varun Srivastava</p>
            <p className="mt-1 text-sm font-medium text-slate-600">Founder & CEO, Neumas</p>
            <p className="mt-4 text-sm leading-6 text-slate-500">
              Why we are building an operational intelligence layer for F&B.
            </p>
          </div>
        </div>
        <article className="overflow-hidden rounded-lg border border-[#0b1736]/10 bg-white shadow-xl shadow-[#0b1736]/8">
          <LazyVideo
            title={founderVideo.title}
            src={founderVideo.src}
            poster={founderVideo.poster}
            posterAlt={founderVideo.posterAlt}
          />
          <div className="border-t border-[#0b1736]/10 p-5">
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#0b4fd8]">{founderVideo.role}</p>
            <h3 className="mt-3 text-lg font-bold tracking-normal text-[#0b1736]">{founderVideo.title}</h3>
          </div>
        </article>
      </div>
    </section>
  );
}

function ConversionSection() {
  return (
    <section className="bg-white py-20">
      <div className={`${sectionShell} grid gap-10 lg:grid-cols-[0.92fr_1.08fr] lg:items-center`}>
        <div className="overflow-hidden rounded-lg border border-[#0b1736]/10 bg-[#f8fbff] shadow-xl shadow-[#0b1736]/8">
          <Image
            src={marketingAssets.cta.src}
            alt={marketingAssets.cta.alt}
            width={1672}
            height={941}
            className="aspect-[1672/941] w-full object-cover"
          />
        </div>
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#0b4fd8]">Book A Demo</p>
          <h2 className="mt-4 text-4xl font-bold tracking-normal text-[#0b1736]">{conversion.headline}</h2>
          <p className="mt-5 text-base leading-7 text-slate-600">{conversion.body}</p>
          <div className="mt-8 rounded-lg border border-[#0b1736]/10 bg-[#f8fbff] p-5">
            <MarketingLeadForm kind="demo" />
          </div>
        </div>
      </div>
    </section>
  );
}

function TeamSection({ teamMembers }: { teamMembers: typeof team }) {
  return (
    <section id="company" className="bg-[#f8fbff] py-20">
      <div className={sectionShell}>
        <div className="max-w-3xl">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#0b4fd8]">Team</p>
          <h2 className="mt-4 text-4xl font-bold tracking-normal text-[#0b1736]">The team building Neumas for F&B operations.</h2>
          <p className="mt-5 text-base leading-7 text-slate-600">
            Public team information is limited to confirmed Neumas roles and approved presentation. Unconfirmed headshots stay out of the page.
          </p>
        </div>
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {teamMembers.map((member) => (
            <article key={member.name} className="rounded-lg border border-[#0b1736]/10 bg-white p-5">
              {member.image ? (
                <Image
                  src={member.image.src}
                  alt={member.image.alt}
                  width={160}
                  height={160}
                  className="h-24 w-24 rounded-lg object-cover"
                />
              ) : (
                <div className="flex h-24 w-24 items-center justify-center rounded-lg bg-[#0b1736] text-xl font-bold text-[#f5c15c]">
                  {member.initials}
                </div>
              )}
              <h3 className="mt-5 text-lg font-bold tracking-normal text-[#0b1736]">{member.name}</h3>
              <p className="mt-1 text-sm font-medium text-slate-600">{member.role}</p>
              <p className="mt-4 text-sm leading-6 text-slate-600">{member.bio}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t border-[#0b1736]/10 bg-white py-8">
      <div className={`${sectionShell} flex flex-col gap-3 text-sm text-slate-500 sm:flex-row sm:items-center sm:justify-between`}>
        <p>Neumas marketing v2 preview. Existing production homepage remains unchanged.</p>
        <p>{new Date().getFullYear()} Neumas</p>
      </div>
    </footer>
  );
}

export function MarketingV2Page({ cmsContent }: { cmsContent?: MarketingCmsContent | null }) {
  const section = (key: string) => cmsContent?.sections[key];
  const sectionEnabled = (key: string) => section(key)?.enabled !== false;
  const metricItems = (cmsContent?.metrics ?? metrics).slice(0, 3);
  const teamMembers = cmsContent?.team ?? team;
  const integrationItems = cmsContent?.integrations ?? integrations;
  const videoItems = cmsContent?.videos && cmsContent.videos.length >= 3 ? cmsContent.videos : videos;

  return (
    <div className="min-h-screen bg-white text-[#0b1736]">
      <MarketingNav />
      <main>
        {sectionEnabled("hero") ? <HeroSection section={section("hero")} /> : null}
        {sectionEnabled("metrics") ? <MetricBand metricItems={metricItems} /> : null}
        <PlatformSection />
        <WorkflowSection />
        <VideoSection videoItems={videoItems} />
        <ProductStorytellingSection />
        <MobileOperationsSection />
        <DeepDemoSection videoItems={videoItems} />
        {sectionEnabled("integrations") ? <IntegrationsAndUseCases integrationItems={integrationItems} /> : null}
        <UseCaseSection />
        <PartnerSection />
        <OutcomesSection />
        <FounderSection videoItems={videoItems} />
        {sectionEnabled("team") ? <TeamSection teamMembers={teamMembers} /> : null}
        <ConversionSection />
      </main>
      <Footer />
    </div>
  );
}
