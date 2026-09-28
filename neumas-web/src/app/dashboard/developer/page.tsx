"use client";

import { useEffect, useState } from "react";
import { KeyRound, Plus, ShieldCheck, XCircle } from "lucide-react";

import {
  createServiceClient,
  generateApiCredential,
  listApiCredentials,
  listServiceClients,
  revokeApiCredential,
} from "@/lib/api/endpoints";
import type { ApiCredential, GeneratedApiCredential, ServiceClient } from "@/lib/api/types";

const SCOPES = [
  "catalog:read",
  "supplier:read",
  "availability:read",
  "rfq:create",
  "rfq:read",
  "offer:read",
  "order:create",
  "order:read",
  "webhook:manage",
];

export default function DeveloperPage() {
  const [clients, setClients] = useState<ServiceClient[]>([]);
  const [credentials, setCredentials] = useState<ApiCredential[]>([]);
  const [name, setName] = useState("");
  const [selectedClient, setSelectedClient] = useState("");
  const [generated, setGenerated] = useState<GeneratedApiCredential | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    const [clientRows, credentialRows] = await Promise.all([listServiceClients(), listApiCredentials()]);
    setClients(clientRows);
    setCredentials(credentialRows);
    setSelectedClient((current) => current || clientRows[0]?.id || "");
  }

  useEffect(() => {
    void load();
  }, []);

  async function createApplication() {
    if (!name.trim()) return;
    setBusy(true);
    try {
      const client = await createServiceClient({ name: name.trim(), allowed_scopes: SCOPES });
      setName("");
      setSelectedClient(client.id);
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function generateCredential() {
    if (!selectedClient) return;
    const scopes = clients.find((client) => client.id === selectedClient)?.allowed_scopes ?? [];
    if (!scopes.length) return;
    setBusy(true);
    try {
      const credential = await generateApiCredential(selectedClient, { name: "Primary credential", scopes });
      setGenerated(credential);
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function revokeCredential(id: string) {
    setBusy(true);
    try {
      await revokeApiCredential(id);
      await load();
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="flex flex-col gap-4 rounded-lg border border-slate-200 bg-white p-5 shadow-sm md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-sky-700">Agent Commerce API</p>
            <h1 className="mt-1 text-2xl font-semibold text-slate-950">Developer access</h1>
            <p className="mt-2 text-sm text-slate-600">Manage tenant-scoped applications, credentials, and server-enforced permissions.</p>
          </div>
          <div className="flex w-full gap-2 md:w-auto">
            <input aria-label="Application name" value={name} onChange={(event) => setName(event.target.value)} placeholder="Application name" className="min-w-0 rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            <button type="button" disabled={busy || !name.trim()} onClick={() => void createApplication()} className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-slate-950 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"><Plus className="h-4 w-4" />Create application</button>
          </div>
        </header>

        {generated ? (
          <section className="rounded-lg border border-amber-300 bg-amber-50 p-5">
            <div className="flex items-center gap-2 font-semibold text-amber-950"><KeyRound className="h-4 w-4" />Credential generated</div>
            <p className="mt-2 text-sm text-amber-900">This key is shown once. Store it in your secret manager.</p>
            <code className="mt-3 block overflow-x-auto rounded bg-white p-3 text-sm text-slate-900">{generated.api_key}</code>
            <button type="button" onClick={() => setGenerated(null)} className="mt-3 text-sm font-semibold text-amber-900">Dismiss</button>
          </section>
        ) : null}

        <section className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(20rem,0.7fr)]">
          <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between gap-4">
              <div><h2 className="font-semibold text-slate-950">Applications</h2><p className="mt-1 text-sm text-slate-500">External service identities belonging to this organization.</p></div>
              <ShieldCheck className="h-5 w-5 text-emerald-600" />
            </div>
            <div className="mt-4 space-y-3">
              {clients.map((client) => (
                <button key={client.id} type="button" onClick={() => setSelectedClient(client.id)} className={`w-full rounded-lg border p-4 text-left ${selectedClient === client.id ? "border-sky-500 bg-sky-50" : "border-slate-200"}`}>
                  <div className="flex items-center justify-between gap-3"><span className="font-semibold text-slate-950">{client.name}</span><span className="text-xs font-semibold uppercase text-emerald-700">{client.status}</span></div>
                  <div className="mt-3 flex flex-wrap gap-2">{client.allowed_scopes.map((scope) => <span key={scope} className="rounded bg-slate-100 px-2 py-1 text-xs text-slate-700">{scope}</span>)}</div>
                </button>
              ))}
              {!clients.length ? <p className="rounded-lg border border-dashed border-slate-300 p-5 text-sm text-slate-500">No applications yet.</p> : null}
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between gap-3"><h2 className="font-semibold text-slate-950">Credentials</h2><button type="button" disabled={busy || !selectedClient} onClick={() => void generateCredential()} className="inline-flex items-center gap-2 rounded-lg bg-sky-700 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"><KeyRound className="h-4 w-4" />Generate</button></div>
            <div className="mt-4 space-y-3">
              {credentials.filter((credential) => !selectedClient || credential.service_client_id === selectedClient).map((credential) => (
                <article key={credential.id} className="rounded-lg border border-slate-200 p-4">
                  <div className="flex items-start justify-between gap-3"><div><p className="font-medium text-slate-950">{credential.name || "API credential"}</p><p className="mt-1 font-mono text-xs text-slate-500">nac_{credential.credential_prefix}_...</p></div>{credential.revoked_at ? <span className="text-xs font-semibold text-rose-700">Revoked</span> : <button aria-label="Revoke credential" type="button" disabled={busy} onClick={() => void revokeCredential(credential.id)} className="rounded p-1 text-slate-500 hover:bg-rose-50 hover:text-rose-700"><XCircle className="h-5 w-5" /></button>}</div>
                  <p className="mt-3 text-xs text-slate-500">Last used: {credential.last_used_at ? new Date(credential.last_used_at).toLocaleString() : "Never"}</p>
                  <div className="mt-3 flex flex-wrap gap-1">{credential.scopes.map((scope) => <span key={scope} className="rounded bg-slate-100 px-2 py-1 text-xs text-slate-600">{scope}</span>)}</div>
                </article>
              ))}
              {!credentials.length ? <p className="rounded-lg border border-dashed border-slate-300 p-5 text-sm text-slate-500">No credentials generated.</p> : null}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
