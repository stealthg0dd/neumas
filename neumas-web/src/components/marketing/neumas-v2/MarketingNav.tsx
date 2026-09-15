"use client";

import Image from "next/image";
import Link from "next/link";
import { Menu, X } from "lucide-react";
import { useState } from "react";

import { hero, marketingAssets } from "./content";
import { MarketingEventLink } from "./MarketingEventLink";

const navLinks = [
  { label: "Platform", href: "#platform" },
  { label: "How It Works", href: "#workflow" },
  { label: "Solutions", href: "#solutions" },
  { label: "Integrations", href: "#integrations" },
  { label: "Company", href: "#company" },
] as const;

export function MarketingNav() {
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 border-b border-[#0b1736]/10 bg-white/90 backdrop-blur-xl">
      <nav className="mx-auto flex w-full max-w-7xl items-center justify-between px-5 py-4 sm:px-8" aria-label="Marketing preview">
        <Link href="/marketing-preview" className="flex items-center gap-3" aria-label="Neumas marketing preview">
          <Image src={marketingAssets.logo.src} alt="" width={32} height={32} className="h-8 w-8 rounded-md" />
          <span className="font-mono text-sm font-semibold tracking-[0.12em] text-[#0b1736]">NEUMAS</span>
        </Link>

        <div className="hidden items-center gap-6 lg:flex">
          {navLinks.map((link) => (
            <a key={link.href} href={link.href} className="text-sm font-medium text-slate-600 hover:text-[#0b1736]">
              {link.label}
            </a>
          ))}
        </div>

        <div className="hidden items-center gap-2 md:flex">
          <MarketingEventLink
            href={hero.primaryCta.href}
            event="marketing_demo_click"
            props={{ location: "desktop_nav" }}
            className="inline-flex items-center rounded-md bg-[#0b4fd8] px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-[#073fae]"
          >
            {hero.primaryCta.label}
          </MarketingEventLink>
          <MarketingEventLink
            href="/auth"
            event="marketing_login_clicked"
            props={{ location: "desktop_nav" }}
            className="px-3 py-2 text-sm font-semibold text-slate-600 hover:text-[#0b1736]"
          >
            Login
          </MarketingEventLink>
        </div>

        <button
          type="button"
          className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-[#0b1736]/10 text-[#0b1736] md:hidden"
          onClick={() => setOpen((value) => !value)}
          aria-label={open ? "Close menu" : "Open menu"}
          aria-expanded={open}
        >
          {open ? <X className="h-5 w-5" aria-hidden="true" /> : <Menu className="h-5 w-5" aria-hidden="true" />}
        </button>
      </nav>

      {open ? (
        <div className="border-t border-[#0b1736]/10 bg-white px-5 pb-5 md:hidden">
          <div className="mx-auto grid max-w-7xl gap-1 pt-3">
            {navLinks.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className="rounded-md px-3 py-3 text-sm font-semibold text-slate-700 hover:bg-[#f8fbff]"
                onClick={() => setOpen(false)}
              >
                {link.label}
              </a>
            ))}
            <div className="mt-3 grid grid-cols-2 gap-2 border-t border-[#0b1736]/10 pt-4">
              <MarketingEventLink
                href={hero.primaryCta.href}
                event="marketing_demo_click"
                props={{ location: "mobile_nav" }}
                className="rounded-md bg-[#0b4fd8] px-3 py-3 text-center text-sm font-semibold text-white"
                afterClick={() => setOpen(false)}
              >
                Book a Demo
              </MarketingEventLink>
              <MarketingEventLink
                href="/auth"
                event="marketing_login_clicked"
                props={{ location: "mobile_nav" }}
                className="rounded-md border border-[#0b1736]/10 px-3 py-3 text-center text-sm font-semibold text-[#0b1736]"
                afterClick={() => setOpen(false)}
              >
                Login
              </MarketingEventLink>
            </div>
          </div>
        </div>
      ) : null}
    </header>
  );
}
