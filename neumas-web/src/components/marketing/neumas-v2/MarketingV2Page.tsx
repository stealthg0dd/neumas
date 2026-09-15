import Image from "next/image";
import Link from "next/link";
import { ArrowRight, CheckCircle2, Sparkles } from "lucide-react";

import { HeroVideo } from "./HeroVideo";
import { LazyVideo } from "./LazyVideo";
import { MarketingNav } from "./MarketingNav";
import {
  complianceSignals,
  cta,
  hero,
  integrations,
  marketingAssets,
  metrics,
  modules,
  outcomes,
  platformInputs,
  platformOutputs,
  receiptWorkflow,
  team,
  trustNotes,
  useCases,
  videos,
} from "./content";

const sectionShell = "mx-auto w-full max-w-7xl px-5 sm:px-8";

function HeroSection() {
  return (
    <section className="relative overflow-hidden bg-[#f8fbff]">
      <div className={`${sectionShell} grid min-h-[calc(100vh-72px)] items-center gap-10 py-12 lg:grid-cols-[0.9fr_1.1fr] lg:py-16`}>
        <div className="max-w-2xl">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#0b4fd8]">{hero.eyebrow.toUpperCase()}</p>
          <h1 className="mt-5 text-5xl font-bold leading-[1.02] tracking-normal text-[#0b1736] sm:text-6xl xl:text-7xl">
            {hero.headline}
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-8 text-slate-600">{hero.body}</p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link
              href={hero.primaryCta.href}
              className="inline-flex items-center justify-center gap-2 rounded-md bg-[#f5c15c] px-5 py-3 text-sm font-bold text-[#0b1736] shadow-sm transition hover:bg-[#e8ae3f]"
            >
              {hero.primaryCta.label}
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
            <a
              href={hero.secondaryCta.href}
              className="inline-flex items-center justify-center gap-2 rounded-md border border-[#0b1736]/15 bg-white px-5 py-3 text-sm font-bold text-[#0b1736] transition hover:border-[#0b4fd8]/40"
            >
              {hero.secondaryCta.label}
            </a>
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
          <div className="relative overflow-hidden rounded-lg border border-[#0b1736]/10 bg-white shadow-2xl shadow-[#0b1736]/12">
            <Image
              src={marketingAssets.hero.src}
              alt={marketingAssets.hero.alt}
              width={1672}
              height={941}
              priority
              className="aspect-[1672/941] w-full object-cover"
            />
            <div className="absolute inset-x-[4%] bottom-[3%] rounded-md border border-[#0b4fd8]/20 bg-white/95 p-3 shadow-lg backdrop-blur sm:inset-x-[8%] sm:bottom-[5%]">
              <div className="flex flex-wrap items-center gap-3">
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-md bg-[#eef5ff] text-[#0b4fd8]">
                  <Sparkles className="h-5 w-5" aria-hidden="true" />
                </span>
                <div>
                  <p className="text-sm font-bold text-[#0b1736]">Projected waste reduction potential of up to 30%</p>
                  <p className="text-xs font-medium text-slate-500">Qualified public benchmark, not a historical guarantee.</p>
                </div>
              </div>
            </div>
          </div>
          <div className="mt-4 overflow-hidden rounded-lg border border-[#0b1736]/10 bg-[#0b1736]">
            <HeroVideo
              src={videos[0].src}
              poster={videos[0].poster}
              posterAlt={videos[0].posterAlt}
            />
          </div>
        </div>
      </div>
    </section>
  );
}

function MetricBand() {
  const toneClasses = {
    blue: "border-[#0b4fd8]/20 bg-[#eef5ff]",
    yellow: "border-[#f5c15c]/40 bg-[#fff8e8]",
    green: "border-emerald-500/20 bg-emerald-50",
  };

  return (
    <section className="border-y border-[#0b1736]/10 bg-white py-8" aria-label="Traction metrics">
      <div className={`${sectionShell}`}>
        <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#0b4fd8]">Current Traction</p>
            <h2 className="mt-2 text-2xl font-bold tracking-normal text-[#0b1736]">Factual operating footprint, not a logo strip.</h2>
          </div>
          <p className="max-w-sm text-sm leading-6 text-slate-600">
            These metrics describe current Neumas usage and measured operations signals.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {metrics.map((metric) => (
            <div key={metric.label} className={`rounded-lg border p-5 ${toneClasses[metric.tone]}`}>
              <p className="text-3xl font-bold tracking-normal text-[#0b1736]">{metric.value}</p>
              <h2 className="mt-1 text-sm font-bold uppercase tracking-[0.12em] text-[#0b4fd8]">{metric.label}</h2>
              <p className="mt-3 text-sm leading-6 text-slate-600">{metric.note}</p>
            </div>
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

        <div className="mt-12 grid gap-4 md:grid-cols-3">
          {modules.slice(0, 3).map((module) => {
            const Icon = module.icon;
            return (
              <article key={module.title} className="rounded-lg border border-[#0b1736]/10 bg-white p-6 shadow-sm">
                <Icon className="h-6 w-6 text-[#0b4fd8]" aria-hidden="true" />
                <h3 className="mt-5 text-xl font-bold tracking-normal text-[#0b1736]">{module.title}</h3>
                <p className="mt-3 text-sm leading-6 text-slate-600">{module.body}</p>
                <ul className="mt-5 space-y-3">
                  {module.bullets.map((bullet) => (
                    <li key={bullet} className="flex gap-3 text-sm text-slate-600">
                      <CheckCircle2 className="mt-0.5 h-4 w-4 flex-none text-[#f5c15c]" aria-hidden="true" />
                      <span>{bullet}</span>
                    </li>
                  ))}
                </ul>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function VideoSection() {
  return (
    <section id="resources" className="bg-[#0b1736] py-20 text-white">
      <div className={sectionShell}>
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#f5c15c]">Videos</p>
            <h2 className="mt-4 max-w-2xl text-4xl font-bold tracking-normal">See the operating system in motion.</h2>
          </div>
          <p className="max-w-sm text-sm leading-6 text-white/70">
            The intro film can move in the hero while the product demos stay user-controlled.
          </p>
        </div>
        <div className="mt-10 grid gap-5 lg:grid-cols-3">
          {videos.slice(1).map((video) => (
            <article key={video.src} className="overflow-hidden rounded-lg border border-white/15 bg-white/8">
              <LazyVideo title={video.title} src={video.src} poster={video.poster} posterAlt={video.posterAlt} />
              <div className="p-5">
                <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#f5c15c]">{video.role}</p>
                <h3 className="mt-3 text-lg font-bold tracking-normal">{video.title}</h3>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function OutcomesSection() {
  return (
    <section id="solutions" className="bg-[#f8fbff] py-20">
      <div className={`${sectionShell} grid gap-12 lg:grid-cols-[1.1fr_0.9fr]`}>
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#0b4fd8]">Outcomes</p>
          <h2 className="mt-4 text-4xl font-bold tracking-normal text-[#0b1736]">Less guesswork. Better margins.</h2>
          <div className="mt-10 grid gap-4 sm:grid-cols-2">
            {outcomes.map((outcome) => (
              <article key={outcome.title} className="rounded-lg border border-[#0b1736]/10 bg-white p-6">
                <h3 className="text-lg font-bold tracking-normal text-[#0b1736]">{outcome.title}</h3>
                <p className="mt-3 text-sm leading-6 text-slate-600">{outcome.body}</p>
              </article>
            ))}
          </div>
        </div>
        <div className="overflow-hidden rounded-lg border border-[#0b1736]/10 bg-white">
          <Image
            src={marketingAssets.cta.src}
            alt={marketingAssets.cta.alt}
            width={1672}
            height={941}
            className="h-full min-h-[360px] w-full object-cover"
          />
        </div>
      </div>
    </section>
  );
}

function IntegrationsAndUseCases() {
  return (
    <section id="integrations" className="bg-white py-20">
      <div className={`${sectionShell} grid gap-12 lg:grid-cols-2`}>
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#0b4fd8]">Connect Your Operation</p>
          <h2 className="mt-4 text-3xl font-bold tracking-normal text-[#0b1736]">F&B ecosystem integrations.</h2>
          <div className="mt-8 flex flex-wrap gap-3">
            {integrations.map((integration) => (
              <span key={integration} className="rounded-md border border-[#0b1736]/10 bg-[#f8fbff] px-4 py-3 text-sm font-bold text-[#0b1736]">
                {integration}
              </span>
            ))}
          </div>
          <p className="mt-6 text-sm leading-6 text-slate-600">
            StoreHub and Qashier are represented only as existing integrations in this preview, not customers or pilots.
          </p>
        </div>
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#0b4fd8]">Use Cases</p>
          <h2 className="mt-4 text-3xl font-bold tracking-normal text-[#0b1736]">Designed for the way F&B teams actually operate.</h2>
          <div className="mt-8 grid gap-4 sm:grid-cols-2">
            {useCases.map((useCase) => {
              const Icon = useCase.icon;
              return (
                <article key={useCase.title} className="rounded-lg border border-[#0b1736]/10 bg-white p-5">
                  <Icon className="h-5 w-5 text-[#0b4fd8]" aria-hidden="true" />
                  <h3 className="mt-4 text-base font-bold tracking-normal text-[#0b1736]">{useCase.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-slate-600">{useCase.body}</p>
                </article>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}

function TeamSection() {
  return (
    <section id="company" className="bg-[#f8fbff] py-20">
      <div className={sectionShell}>
        <div className="max-w-2xl">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#0b4fd8]">Team</p>
          <h2 className="mt-4 text-4xl font-bold tracking-normal text-[#0b1736]">Built by operators, product builders, and Singapore market specialists.</h2>
        </div>
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {team.map((member) => (
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
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function TrustSection() {
  return (
    <section className="bg-white py-16">
      <div className={`${sectionShell} grid gap-4 md:grid-cols-2 lg:grid-cols-3`}>
        {trustNotes.map((note) => (
          <article key={note.title} className="rounded-lg border border-[#0b1736]/10 p-5">
            <h2 className="text-base font-bold tracking-normal text-[#0b1736]">{note.title}</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">{note.body}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

function FinalCta() {
  return (
    <section className="bg-[#0b4fd8] py-20 text-white">
      <div className={`${sectionShell} flex flex-col gap-8 md:flex-row md:items-center md:justify-between`}>
        <div className="max-w-2xl">
          <h2 className="text-4xl font-bold tracking-normal">{cta.title}</h2>
          <p className="mt-4 text-base leading-7 text-white/80">{cta.body}</p>
        </div>
        <Link
          href={cta.href}
          className="inline-flex items-center justify-center gap-2 rounded-md bg-[#f5c15c] px-5 py-3 text-sm font-bold text-[#0b1736] shadow-sm transition hover:bg-[#e8ae3f]"
        >
          {cta.label}
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
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

export function MarketingV2Page() {
  return (
    <div className="min-h-screen bg-white text-[#0b1736]">
      <MarketingNav />
      <main>
        <HeroSection />
        <MetricBand />
        <WorkflowSection />
        <PlatformSection />
        <VideoSection />
        <OutcomesSection />
        <IntegrationsAndUseCases />
        <TeamSection />
        <TrustSection />
        <FinalCta />
      </main>
      <Footer />
    </div>
  );
}
