"use client";

import { CheckCircle2 } from "lucide-react";
import { useState } from "react";

import { track } from "@/lib/analytics";

type FormKind = "demo" | "partner";

type LeadFormState = {
  name: string;
  email: string;
  company: string;
  businessType: string;
  outlets: string;
  country: string;
  challenge: string;
};

const businessTypes = [
  "Restaurant",
  "Cafe / bakery",
  "Cloud kitchen",
  "Quick-service operator",
  "Multi-outlet group",
  "Hospitality / F&B team",
  "Technology / integration partner",
] as const;

const outletOptions = ["1", "2-5", "6-20", "21-50", "50+"] as const;

const initialState: LeadFormState = {
  name: "",
  email: "",
  company: "",
  businessType: "Restaurant",
  outlets: "1",
  country: "Singapore",
  challenge: "",
};

const fieldInputClass =
  "w-full rounded-md border border-[#0b1736]/15 bg-white px-3 py-3 text-sm font-medium text-[#0b1736] outline-none transition placeholder:text-slate-300 focus:border-[#0b4fd8] focus:ring-2 focus:ring-[#0b4fd8]/15";

export function MarketingLeadForm({ kind }: { kind: FormKind }) {
  const [form, setForm] = useState<LeadFormState>(initialState);
  const [started, setStarted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isPartner = kind === "partner";

  function update(key: keyof LeadFormState, value: string) {
    if (!started) {
      track("marketing_demo_form_started", { form: kind });
      setStarted(true);
    }
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (!form.name.trim() || !form.email.trim() || !form.company.trim() || !form.challenge.trim()) {
      setError("Please complete the required fields.");
      return;
    }

    setBusy(true);
    try {
      const params = new URLSearchParams(window.location.search);
      const workflowContext = [
        `Country: ${form.country}`,
        `Main challenge: ${form.challenge}`,
        isPartner ? `Partner type: ${form.businessType}` : `Business type: ${form.businessType}`,
      ].join("\n");

      const response = await fetch("/api/pilot-intake", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          company_name: form.company,
          contact_name: form.name,
          email: form.email,
          phone: null,
          business_type: form.businessType,
          outlet_count: form.outlets,
          current_workflow: workflowContext,
          preferred_start: null,
          source: isPartner ? "marketing_partner_form" : "marketing_demo_form",
          utm_source: params.get("utm_source"),
          utm_medium: params.get("utm_medium"),
          utm_campaign: params.get("utm_campaign"),
          utm_content: params.get("utm_content"),
          utm_term: params.get("utm_term"),
        }),
      });

      if (!response.ok) throw new Error("Lead submission failed");

      if (isPartner) {
        track("marketing_partner_form_submitted", {
          form: "partner",
          partner_type: form.businessType,
          country: form.country,
        });
      } else {
        track("marketing_demo_form_submitted", {
          form: "demo",
          business_type: form.businessType,
          outlet_count: form.outlets,
          country: form.country,
        });
      }

      setSent(true);
      setForm(initialState);
    } catch {
      setError("We could not submit this right now. The direct demo route is still available.");
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <div className="rounded-lg border border-emerald-500/20 bg-emerald-50 p-5 text-[#0b1736]">
        <CheckCircle2 className="h-6 w-6 text-emerald-600" aria-hidden="true" />
        <p className="mt-4 text-lg font-bold tracking-normal">Request received.</p>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          The Neumas team will follow up with the right next step for your operation.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="grid gap-4" noValidate>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name" required>
          <input value={form.name} onChange={(event) => update("name", event.target.value)} autoComplete="name" className={fieldInputClass} />
        </Field>
        <Field label="Work email" required>
          <input type="email" value={form.email} onChange={(event) => update("email", event.target.value)} autoComplete="email" className={fieldInputClass} />
        </Field>
      </div>
      <Field label="Company" required>
        <input value={form.company} onChange={(event) => update("company", event.target.value)} autoComplete="organization" className={fieldInputClass} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={isPartner ? "Partner type" : "Business type"} required>
          <select value={form.businessType} onChange={(event) => update("businessType", event.target.value)} className={fieldInputClass}>
            {businessTypes.map((type) => (
              <option key={type}>{type}</option>
            ))}
          </select>
        </Field>
        <Field label="Number of outlets" required>
          <select value={form.outlets} onChange={(event) => update("outlets", event.target.value)} className={fieldInputClass}>
            {outletOptions.map((option) => (
              <option key={option}>{option}</option>
            ))}
          </select>
        </Field>
      </div>
      <Field label="Country" required>
        <input value={form.country} onChange={(event) => update("country", event.target.value)} autoComplete="country-name" className={fieldInputClass} />
      </Field>
      <Field label="Main challenge" required>
        <textarea value={form.challenge} onChange={(event) => update("challenge", event.target.value)} rows={3} className={`${fieldInputClass} resize-none`} />
      </Field>
      {error ? <p className="text-sm font-medium text-red-600">{error}</p> : null}
      <button
        type="submit"
        disabled={busy}
        className="rounded-md bg-[#0b4fd8] px-5 py-3 text-sm font-bold text-white transition hover:bg-[#073fae] disabled:cursor-not-allowed disabled:opacity-60"
      >
        {busy ? "Submitting..." : isPartner ? "Become a Partner" : "Book a Demo"}
      </button>
    </form>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label className="grid gap-2 text-sm font-bold text-[#0b1736]">
      <span>
        {label}
        {required ? <span className="text-[#0b4fd8]"> *</span> : null}
      </span>
      {children}
    </label>
  );
}
