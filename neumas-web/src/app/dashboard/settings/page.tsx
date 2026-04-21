"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  User, Building2, Shield, Copy, Check, LogOut, KeyRound, Mail,
} from "lucide-react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

import { useAuthStore } from "@/lib/store/auth";
import { getDigestPreferences, logout, updateDigestPreferences } from "@/lib/api/endpoints";
import { Input } from "@/components/ui/input";
import { track, resetAnalytics } from "@/lib/analytics";

// ── Animation variants ────────────────────────────────────────────────────────

const container = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.07 } },
};

const card = {
  hidden:  { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0 },
};

const cardTransition = { duration: 0.45 };

// ── Copyable mono value ───────────────────────────────────────────────────────

function CopyField({ label, value }: { label: string; value: string | null }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    if (!value) return;
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  return (
    <div className="space-y-1">
      <p className="text-xs text-muted-foreground font-medium">{label}</p>
      <div className="flex items-center gap-2">
        <code className="flex-1 text-xs font-mono text-foreground/80 bg-surface-1 border border-border/30 rounded-lg px-3 py-2 truncate">
          {value ?? <span className="text-muted-foreground italic">not set</span>}
        </code>
        {value && (
          <button
            onClick={copy}
            className="shrink-0 p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-surface-2 transition-all"
            title="Copy to clipboard"
          >
            {copied
              ? <Check className="w-3.5 h-3.5 text-mint-500" />
              : <Copy className="w-3.5 h-3.5" />
            }
          </button>
        )}
      </div>
    </div>
  );
}

// ── Section wrapper ───────────────────────────────────────────────────────────

function Section({
  icon: Icon,
  title,
  children,
  accentClass = "bg-cyan-500/20 text-cyan-400",
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  children: React.ReactNode;
  accentClass?: string;
}) {
  return (
    <motion.div variants={card} transition={cardTransition} className="glass-card rounded-2xl p-6 space-y-5">
      <div className="flex items-center gap-3">
        <div className={["w-8 h-8 rounded-lg flex items-center justify-center shrink-0", accentClass].join(" ")}>
          <Icon className="w-4 h-4" />
        </div>
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
      </div>
      {children}
    </motion.div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const router    = useRouter();
  const profile   = useAuthStore((s) => s.profile);
  const propertyId = useAuthStore((s) => s.propertyId);
  const orgId      = useAuthStore((s) => s.orgId);
  const clearAuth  = useAuthStore((s) => s.clearAuth);

  // Editable display name — no update endpoint yet, so save is optimistic only
  const [displayName, setDisplayName] = useState(profile?.full_name ?? "");
  const [saving, setSaving]           = useState(false);
  const [loggingOut, setLoggingOut]   = useState(false);
  const [digestEnabled, setDigestEnabled] = useState(true);
  const [timezone, setTimezone] = useState("UTC");
  const [propertyTimezone, setPropertyTimezone] = useState("UTC");
  const [loadingDigestPrefs, setLoadingDigestPrefs] = useState(true);
  const [savingDigestPrefs, setSavingDigestPrefs] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadDigestPreferences() {
      try {
        const prefs = await getDigestPreferences();
        if (cancelled) return;
        setDigestEnabled(prefs.email_digest_enabled);
        setTimezone(prefs.timezone);
        setPropertyTimezone(prefs.property_timezone);
      } catch {
        if (!cancelled) {
          toast.error("Failed to load weekly digest preferences.");
        }
      } finally {
        if (!cancelled) {
          setLoadingDigestPrefs(false);
        }
      }
    }

    void loadDigestPreferences();

    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSave() {
    setSaving(true);
    // Simulate a save delay; replace with a real PATCH /api/auth/me when available
    await new Promise((r) => setTimeout(r, 600));
    setSaving(false);
    toast.success("Display name saved.");
  }

  async function handleSaveDigestPreferences() {
    setSavingDigestPrefs(true);
    try {
      const prefs = await updateDigestPreferences({
        email_digest_enabled: digestEnabled,
        timezone: timezone.trim() || propertyTimezone || "UTC",
      });
      setDigestEnabled(prefs.email_digest_enabled);
      setTimezone(prefs.timezone);
      setPropertyTimezone(prefs.property_timezone);
      toast.success("Weekly digest preferences saved.");
    } catch {
      toast.error("Failed to save weekly digest preferences.");
    } finally {
      setSavingDigestPrefs(false);
    }
  }

  async function handleLogout() {
    setLoggingOut(true);
    try { await logout(); } catch { /* swallow — clear state regardless */ }
    track("user_signed_out", {});
    resetAnalytics();
    clearAuth();
    router.replace("/auth");
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight gradient-text">Settings</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Manage your profile, organisation, and account security.
        </p>
      </div>

      <motion.div
        variants={container}
        initial="hidden"
        animate="visible"
        className="space-y-4"
      >
        {/* ── Profile ──────────────────────────────────────────────────────── */}
        <Section icon={User} title="Profile" accentClass="bg-purple-500/20 text-purple-400">
          <div className="space-y-4">
            {/* Email — read-only, sourced from Supabase Auth */}
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground font-medium">Email</label>
              <Input
                value={profile?.email ?? ""}
                disabled
                className="h-9 text-sm font-mono"
              />
              <p className="text-[11px] text-muted-foreground/60">
                Email is managed by your identity provider and cannot be changed here.
              </p>
            </div>

            {/* Display name */}
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground font-medium">Display name</label>
              <Input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Your name"
                className="h-9 text-sm"
              />
            </div>

            <button
              onClick={handleSave}
              disabled={saving}
              className="h-9 px-5 rounded-lg gradient-primary text-white text-sm font-semibold hover:opacity-90 active:scale-[0.98] transition-all disabled:opacity-60 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {saving && (
                <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              )}
              {saving ? "Saving…" : "Save changes"}
            </button>
          </div>
        </Section>

        <Section icon={Mail} title="Weekly email digest" accentClass="bg-emerald-500/20 text-emerald-400">
          <div className="space-y-4">
            <div className="flex items-start justify-between gap-4 rounded-xl border border-border/40 bg-surface-1/60 p-4">
              <div className="space-y-1">
                <p className="text-sm font-medium text-foreground">Email me a weekly property digest</p>
                <p className="text-xs text-muted-foreground">
                  Sends a summary every Monday at 8 AM in your selected timezone.
                </p>
              </div>
              <label className="inline-flex items-center gap-2 text-sm text-foreground">
                <input
                  type="checkbox"
                  checked={digestEnabled}
                  disabled={loadingDigestPrefs || savingDigestPrefs}
                  onChange={(e) => setDigestEnabled(e.target.checked)}
                  className="h-4 w-4 rounded border-border/60"
                />
                Enabled
              </label>
            </div>

            <div className="space-y-1">
              <label className="text-xs text-muted-foreground font-medium">Digest timezone</label>
              <Input
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
                disabled={loadingDigestPrefs || savingDigestPrefs}
                placeholder="America/New_York"
                className="h-9 text-sm"
              />
              <p className="text-[11px] text-muted-foreground/60">
                Property default: {propertyTimezone}. Use an IANA timezone like America/New_York or Europe/London.
              </p>
            </div>

            <button
              onClick={handleSaveDigestPreferences}
              disabled={loadingDigestPrefs || savingDigestPrefs}
              className="h-9 px-5 rounded-lg bg-emerald-500 text-white text-sm font-semibold hover:opacity-90 active:scale-[0.98] transition-all disabled:opacity-60 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {(loadingDigestPrefs || savingDigestPrefs) && (
                <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              )}
              {loadingDigestPrefs ? "Loading…" : savingDigestPrefs ? "Saving…" : "Save digest settings"}
            </button>
          </div>
        </Section>

        {/* ── Organisation ─────────────────────────────────────────────────── */}
        <Section icon={Building2} title="Organisation" accentClass="bg-amber-500/20 text-amber-400">
          <div className="space-y-3">
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground font-medium">Organisation name</p>
              <p className="text-sm text-foreground">{profile?.org_name ?? "—"}</p>
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground font-medium">Property</p>
              <p className="text-sm text-foreground">{profile?.property_name ?? "—"}</p>
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground font-medium">Role</p>
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-cyan-500/15 text-cyan-400 border border-cyan-500/25">
                {profile?.role ?? "user"}
              </span>
            </div>
          </div>
        </Section>

        {/* ── Developer / IDs ──────────────────────────────────────────────── */}
        <Section icon={Shield} title="Developer details" accentClass="bg-cyan-500/20 text-cyan-400">
          <div className="space-y-3">
            <CopyField label="Property ID" value={propertyId} />
            <CopyField label="Organisation ID" value={orgId} />
            <CopyField label="User ID" value={profile?.user_id ?? null} />
          </div>
          <p className="text-[11px] text-muted-foreground/60 pt-1">
            These IDs are used when making direct API calls or filing support requests.
          </p>
        </Section>

        {/* ── Security / Danger zone ───────────────────────────────────────── */}
        <Section icon={KeyRound} title="Account" accentClass="bg-red-500/20 text-red-400">
          <div className="space-y-3">
            <div>
              <p className="text-sm font-medium text-foreground">Sign out</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Clears your session from this device. You will be redirected to the login page.
              </p>
            </div>
            <button
              onClick={handleLogout}
              disabled={loggingOut}
              className="h-9 px-5 rounded-lg border border-red-500/40 text-red-400 text-sm font-semibold hover:bg-red-500/10 active:scale-[0.98] transition-all disabled:opacity-60 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {loggingOut
                ? <span className="w-3.5 h-3.5 border-2 border-red-400/30 border-t-red-400 rounded-full animate-spin" />
                : <LogOut className="w-3.5 h-3.5" />
              }
              {loggingOut ? "Signing out…" : "Sign out"}
            </button>
          </div>
        </Section>
      </motion.div>
    </div>
  );
}
