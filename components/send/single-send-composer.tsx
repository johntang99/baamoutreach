"use client";

import { useMemo, useState } from "react";
import type { ContactLite, TemplateLite } from "@/lib/single-send";

interface SenderOption {
  id: string;
  send_from_name: string | null;
  gmail_preset_email: string | null;
  reply_to_email: string | null;
  is_verified: boolean;
}

interface SingleSendComposerProps {
  workspaceId: string;
  contacts: ContactLite[];
  templates: TemplateLite[];
  senderOptions: SenderOption[];
}

function interpolate(template: string, values: Record<string, string>) {
  return template.replace(/\{([a-zA-Z0-9_]+)\}/g, (_, key: string) => {
    return values[key] ?? "";
  });
}

export function SingleSendComposer({
  workspaceId,
  contacts,
  templates,
  senderOptions,
}: SingleSendComposerProps) {
  const [senderSettingId, setSenderSettingId] = useState(senderOptions[0]?.id ?? "");
  const [contactId, setContactId] = useState(contacts[0]?.id ?? "");
  const [templateId, setTemplateId] = useState(templates[0]?.id ?? "");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [risk, setRisk] = useState<string | null>(null);

  const selectedContact = useMemo(
    () => contacts.find((contact) => contact.id === contactId),
    [contacts, contactId],
  );

  const selectedTemplate = useMemo(
    () => templates.find((template) => template.id === templateId),
    [templates, templateId],
  );
  const selectedSender = useMemo(
    () => senderOptions.find((sender) => sender.id === senderSettingId),
    [senderOptions, senderSettingId],
  );
  const selectedSenderEmail =
    selectedSender?.gmail_preset_email ?? selectedSender?.reply_to_email ?? "";

  const preview = useMemo(() => {
    if (!selectedContact || !selectedTemplate) {
      return { subject: "", body: "" };
    }

    const values = {
      name: selectedContact.full_name ?? "",
      first_name: (selectedContact.full_name ?? "").split(" ")[0] ?? "",
      email: selectedContact.email ?? "",
      business_name: selectedContact.company_name ?? "",
      company_name: selectedContact.company_name ?? "",
    };

    return {
      subject: interpolate(selectedTemplate.subject_template, values),
      body: interpolate(selectedTemplate.body_template, values),
    };
  }, [selectedContact, selectedTemplate]);

  async function handlePrepareSend() {
    if (!senderSettingId || !contactId || !templateId) {
      setError("Please choose sender, contact, and template.");
      return;
    }
    if (!selectedSenderEmail) {
      setError("Selected sender has no Gmail preset or reply-to email.");
      return;
    }

    setIsSubmitting(true);
    setError(null);
    setSuccess(null);
    setRisk(null);

    try {
      const response = await fetch("/api/send/single/prepare", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          workspaceId,
          senderSettingId,
          contactId,
          templateId,
        }),
      });

      const data = (await response.json()) as {
        error?: string;
        gmailUrl?: string;
        requestId?: string;
        senderEmail?: string;
        riskLevel?: string;
        riskNotes?: string[];
      };

      if (!response.ok || !data.gmailUrl || !data.requestId) {
        setError(data.error ?? "Could not prepare Gmail draft.");
        return;
      }

      if (data.riskLevel && data.riskLevel !== "low") {
        setRisk(
          `Risk level: ${data.riskLevel}. ${(data.riskNotes ?? []).join(" ")}`.trim(),
        );
      }

      const effectiveSenderEmail = data.senderEmail ?? selectedSenderEmail;
      setSuccess(
        `Draft ${data.requestId} prepared. Opening Gmail as ${effectiveSenderEmail || "selected sender"}...`,
      );
      window.open(data.gmailUrl, "_blank", "noopener,noreferrer");
    } catch {
      setError("Network error while preparing send.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="grid gap-3 xl:grid-cols-[1.45fr_1fr]">
      <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_10px_30px_rgba(15,23,42,0.06)]">
        <h2 className="text-sm font-semibold text-slate-900">Compose</h2>
        <div className="mt-3 grid gap-3">
          <label className="grid gap-1">
            <span className="text-xs font-medium text-slate-600">Sender</span>
            <select
              value={senderSettingId}
              onChange={(event) => setSenderSettingId(event.target.value)}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
            >
              {senderOptions.map((sender) => (
                <option key={sender.id} value={sender.id}>
                  {sender.send_from_name || "Unnamed sender"} (
                  {sender.gmail_preset_email || sender.reply_to_email || "No sender email"})
                  {sender.is_verified ? " • verified" : ""}
                </option>
              ))}
            </select>
            {selectedSenderEmail ? (
              <p className="text-[11px] text-slate-500">
                Opening Gmail as: <span className="font-medium text-slate-700">{selectedSenderEmail}</span>
              </p>
            ) : (
              <p className="text-[11px] text-rose-700">
                Selected sender has no usable email.
              </p>
            )}
          </label>

          <label className="grid gap-1">
            <span className="text-xs font-medium text-slate-600">Contact</span>
            <select
              value={contactId}
              onChange={(event) => setContactId(event.target.value)}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
            >
              {contacts.map((contact) => (
                <option key={contact.id} value={contact.id}>
                  {contact.full_name} ({contact.email})
                </option>
              ))}
            </select>
          </label>

          <label className="grid gap-1">
            <span className="text-xs font-medium text-slate-600">Template</span>
            <select
              value={templateId}
              onChange={(event) => setTemplateId(event.target.value)}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
            >
              {templates.map((template) => (
                <option key={template.id} value={template.id}>
                  {template.name} ({template.campaign_type})
                </option>
              ))}
            </select>
          </label>

          {error ? (
            <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
              {error}
            </p>
          ) : null}
          {success ? (
            <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
              {success}
            </p>
          ) : null}
          {risk ? (
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
              {risk}
            </p>
          ) : null}

          <button
            type="button"
            onClick={handlePrepareSend}
            disabled={isSubmitting}
            className="inline-flex h-9 items-center justify-center rounded-lg border border-blue-700 bg-blue-600 px-3 text-xs font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSubmitting ? "Preparing..." : "Prepare and open in Gmail"}
          </button>
        </div>
      </article>

      <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_10px_30px_rgba(15,23,42,0.06)]">
        <h2 className="text-sm font-semibold text-slate-900">Preview</h2>
        <div className="mt-3 space-y-3 text-sm">
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">
              Subject
            </p>
            <p className="mt-1 text-slate-700">{preview.subject || "-"}</p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">
              Body
            </p>
            <pre className="mt-1 whitespace-pre-wrap font-sans text-slate-700">
              {preview.body || "-"}
            </pre>
          </div>
        </div>
      </article>
    </section>
  );
}
