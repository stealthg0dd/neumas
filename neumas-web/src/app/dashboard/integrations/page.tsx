"use client";

import { useEffect, useMemo, useState } from "react";
import { Cable, RefreshCw, ShieldCheck, Unplug } from "lucide-react";

import { listIntegrations, type IntegrationAvailability, type IntegrationConnection } from "@/lib/api/endpoints";
import { captureUIError } from "@/lib/analytics";

const GROUPS: Array<{ key: IntegrationAvailability; label: string; description: string }> = [
  { key: "connected", label: "Connected", description: "Live or configured connections with tenant-scoped credentials." },
  { key: "available", label: "Available", description: "Implemented adapters that can be enabled when credentials are configured." },
  { key: "requires_partner_access", label: "Requires Partner Access", description: "Provider contracts or partner credentials are required before activation." },
  { key: "coming_soon", label: "Coming Soon", description: "Planned placeholders. Not presented as implemented." },
];

function statusLabel(connection: IntegrationConnection) {
  if (connection.availability === "requires_partner_access") return "Requires partner access";
  if (connection.availability === "coming_soon") return "Coming soon";
  if (connection.status === "connected") return "Connected";
  if (connection.implemented) return "Available";
  return "Not connected";
}

function formatDate(value: string | null | undefined) {
  return value ? new Date(value).toLocaleString() : "Never";
}

export default function IntegrationsPage() {
  const [connections, setConnections] = useState<IntegrationConnection[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const rows = await listIntegrations();
        if (!cancelled) setConnections(rows);
      } catch (err) {
        captureUIError("integrations_load", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const grouped = useMemo(() => {
    return GROUPS.map((group) => ({
      ...group,
      rows: connections.filter((connection) => (connection.availability ?? (connection.coming_soon ? "coming_soon" : "available")) === group.key),
    }));
  }, [connections]);

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-sky-700">Connector Gateway</p>
            <h1 className="mt-1 text-2xl font-semibold text-slate-950">Integrations</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
              Provider payloads enter through raw events, canonical mapping, and domain services. Unsupported providers remain clearly disabled.
            </p>
          </div>
          <button type="button" className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white">
            <RefreshCw className="h-4 w-4" />
            Sync now
          </button>
        </header>

        <section className="grid gap-4 md:grid-cols-4">
          {GROUPS.map((group) => {
            const count = grouped.find((item) => item.key === group.key)?.rows.length ?? 0;
            return (
              <div key={group.key} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{group.label}</p>
                <div className="mt-3 text-2xl font-semibold text-slate-950">{count}</div>
                <p className="mt-2 text-xs leading-5 text-slate-500">{group.description}</p>
              </div>
            );
          })}
        </section>

        {loading ? <div className="h-80 animate-pulse rounded-2xl bg-white" /> : null}

        <div className="space-y-6">
          {grouped.map((group) => (
            <section key={group.key} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-lg font-semibold text-slate-950">{group.label}</h2>
                  <p className="mt-1 text-sm text-slate-500">{group.description}</p>
                </div>
                <Cable className="h-5 w-5 text-slate-400" />
              </div>
              {group.rows.length ? (
                <div className="mt-4 grid gap-3 lg:grid-cols-2">
                  {group.rows.map((connection) => (
                    <article key={`${connection.adapter_type}:${connection.provider_slug}`} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <h3 className="font-semibold text-slate-950">{connection.display_name}</h3>
                          <p className="mt-1 text-xs uppercase tracking-wide text-slate-500">{connection.adapter_type.replace("_", " ")}</p>
                        </div>
                        <span className="rounded-full border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-700">
                          {statusLabel(connection)}
                        </span>
                      </div>
                      <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                        <div>
                          <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Health</dt>
                          <dd className="mt-1 text-slate-800">{connection.health_status}</dd>
                        </div>
                        <div>
                          <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Last sync</dt>
                          <dd className="mt-1 text-slate-800">{formatDate(connection.last_successful_sync_at ?? connection.last_synced_at)}</dd>
                        </div>
                        <div>
                          <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Records synced</dt>
                          <dd className="mt-1 text-slate-800">{connection.records_synced ?? 0}</dd>
                        </div>
                        <div>
                          <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Credential</dt>
                          <dd className="mt-1 text-slate-800">{connection.credential_reference ? "Secret reference" : "Not configured"}</dd>
                        </div>
                      </dl>
                      <div className="mt-4 flex flex-wrap gap-2">
                        {(connection.permissions ?? []).slice(0, 5).map((permission) => (
                          <span key={permission} className="rounded-full bg-white px-2 py-1 text-xs text-slate-600">
                            {permission}
                          </span>
                        ))}
                      </div>
                      <div className="mt-4 flex items-center gap-2">
                        <button type="button" className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700">
                          <RefreshCw className="h-3.5 w-3.5" />
                          Sync now
                        </button>
                        <button type="button" className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700">
                          <Unplug className="h-3.5 w-3.5" />
                          Disconnect
                        </button>
                        {connection.implemented ? (
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700">
                            <ShieldCheck className="h-3.5 w-3.5" />
                            Gateway only
                          </span>
                        ) : null}
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <p className="mt-4 rounded-xl border border-dashed border-slate-200 p-5 text-sm text-slate-500">No connections in this group.</p>
              )}
            </section>
          ))}
        </div>
      </div>
    </main>
  );
}
