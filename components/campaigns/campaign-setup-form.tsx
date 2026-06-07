"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkBreaks from "remark-breaks";
import { type TemplateVariantSetRow } from "@/components/templates/template-variant-sets-panel";

type TemplateOption = {
  id: string;
  name: string;
  campaign_type: string;
  subject_template: string;
  body_template: string;
};

type ReadyListOption = {
  id: string;
  name: string;
  ready_row_count: number;
};

type SenderOption = {
  id: string;
  send_from_name: string | null;
  gmail_preset_email: string | null;
  reply_to_email: string | null;
  is_verified: boolean;
};

interface CampaignSetupFormProps {
  senderOptions: SenderOption[];
  templates: TemplateOption[];
  readyLists: ReadyListOption[];
  templateVariantSets: TemplateVariantSetRow[];
  preselectedSenderId?: string;
  preselectedListId: string;
  preselectedTemplateId?: string;
  preselectedVariantSetId?: string;
  initialCampaignName?: string;
  initialDailyCap: number;
  initialHardCap: number;
  initialMinIntervalSeconds: number;
  initialMaxIntervalSeconds: number;
  initialAllowRoleBasedRecipients: boolean;
  maxDailyCap: number;
  maxHardCap: number;
  createCampaignAction: (formData: FormData) => void | Promise<void>;
}

function decodeTemplateText(value: string) {
  return value
    .replace(/\\r\\n/g, "\n")
    .replace(/\\n/g, "\n")
    .replace(/\\t/g, "\t");
}

function toPreviewMarkdown(value: string) {
  const decoded = decodeTemplateText(value);
  const bulletNormalized = decoded
    .replace(/\s*[•●▪◦]\s*/g, "\n- ");

  if (!bulletNormalized.includes("\n")) {
    return bulletNormalized;
  }

  if (bulletNormalized.includes("\n\n")) {
    return bulletNormalized;
  }

  const lines = bulletNormalized.split("\n").map((line) => line.trimEnd());
  const output: string[] = [];
  let previousWasList = false;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      if (output.at(-1) !== "") {
        output.push("");
      }
      previousWasList = false;
      continue;
    }

    const isBullet = /^([*-]\s+|\d+\.\s+)/.test(line);
    if (output.length > 0 && output.at(-1) !== "") {
      if (isBullet && !previousWasList) {
        output.push("");
      } else if (!isBullet) {
        output.push("");
      }
    }

    output.push(line);
    previousWasList = isBullet;
  }

  return output.join("\n");
}

function formatTimestamp(value: string | null | undefined) {
  if (!value) return "N/A";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "N/A";
  return date.toLocaleString();
}

export function CampaignSetupForm({
  senderOptions,
  templates,
  readyLists,
  templateVariantSets,
  preselectedSenderId = "",
  preselectedListId,
  preselectedTemplateId = "",
  preselectedVariantSetId = "",
  initialCampaignName = "",
  initialDailyCap,
  initialHardCap,
  initialMinIntervalSeconds,
  initialMaxIntervalSeconds,
  initialAllowRoleBasedRecipients,
  maxDailyCap,
  maxHardCap,
  createCampaignAction,
}: CampaignSetupFormProps) {
  const [notesOpen, setNotesOpen] = useState(false);
  const [templatePreviewOpen, setTemplatePreviewOpen] = useState(false);
  const [advancedControlsOpen, setAdvancedControlsOpen] = useState(false);
  const [variantError, setVariantError] = useState<string | null>(null);
  const [variantMessage, setVariantMessage] = useState<string | null>(null);
  const [modalIndex, setModalIndex] = useState<number | null>(null);
  const [modalSubject, setModalSubject] = useState("");
  const [modalBody, setModalBody] = useState("");
  const [isSavingVariant, startVariantTransition] = useTransition();
  const [localVariantSets, setLocalVariantSets] = useState(templateVariantSets);

  const initialTemplateId =
    preselectedTemplateId && templates.some((template) => template.id === preselectedTemplateId)
      ? preselectedTemplateId
      : templates[0]?.id ?? "";
  const [selectedTemplateId, setSelectedTemplateId] = useState(initialTemplateId);

  const initialListId =
    preselectedListId && readyLists.some((list) => list.id === preselectedListId)
      ? preselectedListId
      : readyLists[0]?.id ?? "";
  const [selectedListId, setSelectedListId] = useState(initialListId);
  const initialSenderId =
    preselectedSenderId && senderOptions.some((sender) => sender.id === preselectedSenderId)
      ? preselectedSenderId
      : senderOptions[0]?.id ?? "";
  const [selectedSenderId, setSelectedSenderId] = useState(initialSenderId);
  const initialVariantSetId =
    preselectedVariantSetId &&
    localVariantSets.some(
      (set) =>
        set.id === preselectedVariantSetId && set.template_id === initialTemplateId,
    )
      ? preselectedVariantSetId
      : "";
  const [selectedVariantSetId, setSelectedVariantSetId] = useState(initialVariantSetId);

  const selectedTemplate = useMemo(
    () => templates.find((template) => template.id === selectedTemplateId) ?? null,
    [selectedTemplateId, templates],
  );
  const variantSetsForTemplate = useMemo(
    () => localVariantSets.filter((set) => set.template_id === selectedTemplateId),
    [localVariantSets, selectedTemplateId],
  );
  const selectedVariantSet = useMemo(
    () =>
      variantSetsForTemplate.find((set) => set.id === selectedVariantSetId) ?? null,
    [selectedVariantSetId, variantSetsForTemplate],
  );
  const displayVariants = useMemo(
    () =>
      selectedVariantSet
        ? Array.from({ length: 5 }, (_, index) => selectedVariantSet.variants[index] ?? null)
        : [],
    [selectedVariantSet],
  );

  const hasReadyLists = readyLists.length > 0;
  const hasTemplates = templates.length > 0;
  const hasSenders = senderOptions.length > 0;

  function openVariantModal(index: number) {
    const variant = displayVariants[index];
    if (!variant || !selectedVariantSet) return;
    setModalIndex(index);
    setModalSubject(variant.subject);
    setModalBody(variant.body);
    setVariantError(null);
    setVariantMessage(null);
  }

  function saveVariantEdit(index: number) {
    if (!selectedVariantSet || !selectedTemplateId) {
      return;
    }

    const subject = modalSubject.trim();
    const body = modalBody.trim();
    if (!subject || !body) {
      setVariantError("Subject and body are required.");
      return;
    }

    startVariantTransition(async () => {
      setVariantError(null);
      setVariantMessage(null);

      const response = await fetch(`/api/templates/${selectedTemplateId}/variant-sets`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          setId: selectedVariantSet.id,
          index,
          subject,
          body,
        }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
        item?: TemplateVariantSetRow;
      };

      if (!response.ok || !data.item) {
        setVariantError(data.error ?? "Could not save variant.");
        return;
      }

      setLocalVariantSets((current) =>
        current.map((set) => (set.id === data.item!.id ? data.item! : set)),
      );
      setVariantMessage(`Variant ${index + 1} updated.`);
      setModalIndex(null);
    });
  }

  return (
    <>
      <div className="grid gap-4 xl:grid-cols-[1.05fr_1fr]">
        <form
          action={createCampaignAction}
          className="grid gap-4 rounded-2xl border border-slate-200 bg-gradient-to-b from-white to-slate-50/40 p-4 shadow-[0_10px_24px_rgba(15,23,42,0.04)]"
        >
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">
                Campaign Builder
              </p>
              <p className="text-sm text-slate-600">
                Configure sender, template, and audience in one clean flow.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setNotesOpen(true)}
                className="inline-flex h-8 items-center justify-center rounded-md border border-slate-300 bg-white px-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Quick guide
              </button>
              <Link
                href="/app/docs"
                className="inline-flex h-8 items-center justify-center rounded-md border border-slate-300 bg-white px-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Docs
              </Link>
            </div>
          </div>

          <section className="grid gap-3 rounded-xl border border-slate-200 bg-white p-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">
              Core setup
            </p>
            <label className="grid gap-1">
              <span className="text-xs font-medium text-slate-600">Campaign name</span>
              <input
                name="name"
                type="text"
                required
                placeholder="TCM NYC Batch A"
                defaultValue={initialCampaignName}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </label>

            <label className="grid gap-1">
              <span className="text-xs font-medium text-slate-600">Sender (required)</span>
              <select
                name="sender_setting_id"
                required
                value={selectedSenderId}
                onChange={(event) => setSelectedSenderId(event.target.value)}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
              >
                <option value="" disabled>
                  Select sender
                </option>
                {senderOptions.map((sender) => (
                  <option key={sender.id} value={sender.id}>
                    {(sender.send_from_name || "Unnamed sender") +
                      " · " +
                      (sender.gmail_preset_email || sender.reply_to_email || "No sender email") +
                      (sender.is_verified ? " (Verified)" : "")}
                  </option>
                ))}
              </select>
              {!hasSenders ? (
                <p className="text-xs text-amber-700">
                  No sender found. Create sender profiles first in Sender Settings.
                </p>
              ) : null}
            </label>

            <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
              <label className="grid gap-1">
                <span className="text-xs font-medium text-slate-600">Template</span>
                <select
                  name="template_id"
                  required
                  value={selectedTemplateId}
                  onChange={(event) => {
                    setSelectedTemplateId(event.target.value);
                    setSelectedVariantSetId("");
                  }}
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                >
                  {templates.map((template) => (
                    <option key={template.id} value={template.id}>
                      {template.name} ({template.campaign_type})
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                onClick={() => setTemplatePreviewOpen(true)}
                disabled={!selectedTemplate}
                className="inline-flex h-9 items-center justify-center rounded-lg border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 sm:mt-auto"
              >
                Preview
              </button>
            </div>

            <label className="grid gap-1">
              <span className="text-xs font-medium text-slate-600">Variant set (optional)</span>
              <input
                type="hidden"
                name="template_variant_set_id"
                value={selectedVariantSetId}
                readOnly
              />
              <select
                value={selectedVariantSetId}
                onChange={(event) => setSelectedVariantSetId(event.target.value)}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
              >
                <option value="">No variant set</option>
                {variantSetsForTemplate.map((set) => (
                  <option key={set.id} value={set.id}>
                    {set.name} ({set.language.toUpperCase()})
                  </option>
                ))}
              </select>
            </label>

            {selectedVariantSet ? (
              <p className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-700">
                Round-robin active for{" "}
                <span className="font-semibold text-blue-900">{selectedVariantSet.name}</span>:
                recipients get Variant #1 - #5 in order.
              </p>
            ) : (
              <p className="text-xs text-slate-500">
                No variant set selected. Campaign uses the base template.
              </p>
            )}

            <label className="grid gap-1">
              <span className="text-xs font-medium text-slate-600">
                Recipient list (single list only)
              </span>
              <select
                name="source_list_id"
                required
                value={selectedListId}
                onChange={(event) => setSelectedListId(event.target.value)}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
              >
                {readyLists.map((list) => (
                  <option key={list.id} value={list.id}>
                    {list.name} ({list.ready_row_count} ready)
                  </option>
                ))}
              </select>
              {!hasReadyLists ? (
                <p className="text-xs text-amber-700">
                  No ready list found. Prepare a list in Lists before creating campaign.
                </p>
              ) : null}
            </label>
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-3">
            <button
              type="button"
              onClick={() => setAdvancedControlsOpen((current) => !current)}
              className="flex w-full items-center justify-between rounded-md text-left"
            >
              <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">
                Advanced delivery controls
              </span>
              <span className="text-xs font-medium text-slate-600">
                {advancedControlsOpen ? "Hide" : "Show"}
              </span>
            </button>
            <p className="mt-1 text-xs text-slate-500">
              Daily {initialDailyCap}, hard {initialHardCap}, interval {initialMinIntervalSeconds}s-{initialMaxIntervalSeconds}s.
            </p>

            <div className={advancedControlsOpen ? "mt-3 grid gap-3" : "mt-3 hidden"}>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="grid gap-1">
                  <span className="text-xs font-medium text-slate-600">Daily cap</span>
                  <input
                    name="daily_cap"
                    type="number"
                    min={1}
                    max={maxDailyCap}
                    defaultValue={initialDailyCap}
                    className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                </label>
                <label className="grid gap-1">
                  <span className="text-xs font-medium text-slate-600">Hard cap</span>
                  <input
                    name="hard_cap"
                    type="number"
                    min={1}
                    max={maxHardCap}
                    defaultValue={initialHardCap}
                    className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                </label>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="grid gap-1">
                  <span className="text-xs font-medium text-slate-600">Min interval (sec)</span>
                  <input
                    name="min_interval_seconds"
                    type="number"
                    min={30}
                    defaultValue={initialMinIntervalSeconds}
                    className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                </label>
                <label className="grid gap-1">
                  <span className="text-xs font-medium text-slate-600">Max interval (sec)</span>
                  <input
                    name="max_interval_seconds"
                    type="number"
                    min={30}
                    defaultValue={initialMaxIntervalSeconds}
                    className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                </label>
              </div>

              <label className="flex items-center gap-2 text-sm text-slate-600">
                <input
                  name="include_role_emails"
                  type="checkbox"
                  defaultChecked={initialAllowRoleBasedRecipients}
                />
                Include role-based mailboxes (info@, contact@, admin@)
              </label>
            </div>
          </section>

          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-200 pt-3">
            <button
              type="submit"
              disabled={
                !hasTemplates || !hasReadyLists || !hasSenders || !selectedListId || !selectedSenderId
              }
              className="inline-flex h-9 items-center justify-center rounded-lg border border-blue-700 bg-blue-600 px-4 text-xs font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Save + Prepare recipients
            </button>
          </div>
        </form>

        <section className="grid gap-3 rounded-2xl border border-slate-200 bg-gradient-to-b from-slate-50/70 to-white p-4 shadow-[0_10px_24px_rgba(15,23,42,0.04)]">
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">
                Variant cards
              </p>
              <p className="text-xs text-slate-500">
                5 cards layout (3 on row one, 2 on row two)
              </p>
            </div>
            {selectedVariantSet ? (
              <span className="text-[11px] text-slate-500">
                Updated {formatTimestamp(selectedVariantSet.updated_at)}
              </span>
            ) : null}
          </div>
          {variantError ? (
            <p className="rounded-md border border-rose-200 bg-rose-50 px-2 py-1 text-xs text-rose-700">
              {variantError}
            </p>
          ) : null}
          {variantMessage ? (
            <p className="rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs text-emerald-700">
              {variantMessage}
            </p>
          ) : null}
          {selectedVariantSet ? (
            <div className="grid gap-3 md:grid-cols-3">
              {displayVariants.map((variant, index) => (
                <button
                  key={`${selectedVariantSet.id}-${index}`}
                  type="button"
                  onClick={() => openVariantModal(index)}
                  disabled={!variant}
                  className="rounded-xl border border-slate-200 bg-white p-3 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-blue-300 hover:shadow disabled:cursor-not-allowed"
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-medium text-slate-600">Variant {index + 1}</p>
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-700">
                      {variant?.tone ?? "N/A"}
                    </span>
                  </div>
                  {!variant ? (
                    <p className="mt-2 text-xs text-slate-500">
                      Missing variant. Regenerate this set in Templates.
                    </p>
                  ) : (
                    <div className="mt-2 space-y-2">
                      <p className="line-clamp-2 text-xs font-medium text-slate-900">
                        {variant.subject}
                      </p>
                      <pre className="max-h-24 overflow-auto whitespace-pre-wrap text-xs leading-5 text-slate-700">
                        {variant.body}
                      </pre>
                    </div>
                  )}
                </button>
              ))}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-slate-300 bg-white px-3 py-5 text-center">
              <p className="text-xs text-slate-500">
                Select a variant set on the left to preview the 5 cards here.
              </p>
            </div>
          )}
        </section>
      </div>

      {notesOpen ? (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/30 px-4 py-6">
          <div className="mx-auto w-full max-w-2xl rounded-xl border border-slate-200 bg-white p-4 shadow-xl">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-900">Preparation notes</h3>
              <button
                type="button"
                onClick={() => setNotesOpen(false)}
                className="inline-flex h-8 items-center rounded-md border border-slate-300 bg-white px-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Close
              </button>
            </div>
            <ul className="space-y-2 text-sm text-slate-600">
              <li className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                Single list only: this campaign is prepared from one selected ready list.
              </li>
              <li className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                Suppressed contacts are auto-skipped.
              </li>
              <li className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                Role-based emails are skipped unless override is enabled.
              </li>
              <li className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                Sending remains manual in Gmail: open compose, click send in Gmail, then mark as
                sent.
              </li>
            </ul>
          </div>
        </div>
      ) : null}

      {selectedVariantSet && modalIndex !== null && displayVariants[modalIndex] ? (
        <div className="fixed inset-0 z-50 bg-slate-950/45 px-4 py-6" onClick={() => setModalIndex(null)}>
          <div
            className="mx-auto flex max-h-[calc(100vh-3rem)] w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
              <p className="text-sm font-semibold text-slate-900">
                {selectedVariantSet.name} · Variant {modalIndex + 1}
              </p>
              <button
                type="button"
                onClick={() => setModalIndex(null)}
                className="inline-flex h-8 items-center rounded-md border border-slate-300 bg-white px-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Close
              </button>
            </div>

            <div className="space-y-3 overflow-y-auto px-4 py-4">
              <label className="grid gap-1">
                <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-slate-500">
                  Subject
                </span>
                <input
                  value={modalSubject}
                  onChange={(event) => setModalSubject(event.target.value)}
                  className="rounded-md border border-slate-300 px-3 py-2 text-sm"
                  disabled={isSavingVariant}
                />
              </label>
              <label className="grid gap-1">
                <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-slate-500">
                  Body
                </span>
                <textarea
                  value={modalBody}
                  onChange={(event) => setModalBody(event.target.value)}
                  rows={12}
                  className="rounded-md border border-slate-300 px-3 py-2 text-sm leading-6"
                  disabled={isSavingVariant}
                />
              </label>
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-slate-200 px-4 py-3">
              <button
                type="button"
                onClick={() => setModalIndex(null)}
                className="inline-flex h-8 items-center rounded-md border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => saveVariantEdit(modalIndex)}
                disabled={isSavingVariant}
                className="inline-flex h-8 items-center rounded-md border border-blue-700 bg-blue-600 px-3 text-xs font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSavingVariant ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {templatePreviewOpen && selectedTemplate ? (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/30 px-4 py-6">
          <div className="mx-auto flex w-full max-w-2xl max-h-[calc(100vh-3rem)] flex-col rounded-xl border border-slate-200 bg-white p-4 shadow-xl">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-900">
                {selectedTemplate.name} ({selectedTemplate.campaign_type})
              </h3>
              <button
                type="button"
                onClick={() => setTemplatePreviewOpen(false)}
                className="inline-flex h-8 items-center rounded-md border border-slate-300 bg-white px-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Close
              </button>
            </div>
            <div className="space-y-2 overflow-y-auto pr-1 text-sm text-slate-700">
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                <p className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
                  Subject
                </p>
                <p className="mt-1 whitespace-pre-wrap">
                  {decodeTemplateText(selectedTemplate.subject_template)}
                </p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                <p className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
                  Body
                </p>
                <div className="prose prose-sm mt-1 max-w-none text-slate-700 [&_li]:my-1 [&_ol]:list-decimal [&_ol]:pl-5 [&_ul]:list-disc [&_ul]:pl-5">
                  <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]}>
                    {toPreviewMarkdown(selectedTemplate.body_template)}
                  </ReactMarkdown>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
