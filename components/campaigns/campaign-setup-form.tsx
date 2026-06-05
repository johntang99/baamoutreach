"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

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
  template_variants: unknown[] | null;
};

interface CampaignSetupFormProps {
  templates: TemplateOption[];
  readyLists: ReadyListOption[];
  preselectedListId: string;
  defaultDailyCap: number;
  defaultHardCap: number;
  defaultMinIntervalSeconds: number;
  defaultMaxIntervalSeconds: number;
  defaultAllowRoleBasedRecipients: boolean;
  maxDailyCap: number;
  maxHardCap: number;
  createCampaignAction: (formData: FormData) => void | Promise<void>;
}

export function CampaignSetupForm({
  templates,
  readyLists,
  preselectedListId,
  defaultDailyCap,
  defaultHardCap,
  defaultMinIntervalSeconds,
  defaultMaxIntervalSeconds,
  defaultAllowRoleBasedRecipients,
  maxDailyCap,
  maxHardCap,
  createCampaignAction,
}: CampaignSetupFormProps) {
  const [notesOpen, setNotesOpen] = useState(false);
  const [templatePreviewOpen, setTemplatePreviewOpen] = useState(false);

  const initialTemplateId = templates[0]?.id ?? "";
  const [selectedTemplateId, setSelectedTemplateId] = useState(initialTemplateId);

  const initialListId =
    preselectedListId && readyLists.some((list) => list.id === preselectedListId)
      ? preselectedListId
      : readyLists[0]?.id ?? "";
  const [selectedListId, setSelectedListId] = useState(initialListId);

  const selectedTemplate = useMemo(
    () => templates.find((template) => template.id === selectedTemplateId) ?? null,
    [selectedTemplateId, templates],
  );

  const hasReadyLists = readyLists.length > 0;
  const hasTemplates = templates.length > 0;

  return (
    <>
      <form action={createCampaignAction} className="grid gap-3">
        <label className="grid gap-1">
          <span className="text-xs font-medium text-slate-600">Campaign name</span>
          <input
            name="name"
            type="text"
            required
            placeholder="TCM NYC Batch A"
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </label>

        <div className="grid gap-1">
          <span className="text-xs font-medium text-slate-600">Template</span>
          <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
            <select
              name="template_id"
              required
              value={selectedTemplateId}
              onChange={(event) => setSelectedTemplateId(event.target.value)}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
            >
              {templates.map((template) => (
                <option key={template.id} value={template.id}>
                  {template.name} ({template.campaign_type})
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => setTemplatePreviewOpen(true)}
              disabled={!selectedTemplate}
              className="inline-flex h-9 items-center justify-center rounded-lg border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Preview template
            </button>
          </div>
          <p className="text-xs text-slate-500">
            Preview subject/body before preparing recipients.
          </p>
        </div>

        <div className="grid gap-1">
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
                {list.name} ({list.ready_row_count} ready
                {Array.isArray(list.template_variants) && list.template_variants.length > 0
                  ? ", AI variants ready"
                  : ""}
                )
              </option>
            ))}
          </select>
          {!hasReadyLists ? (
            <p className="text-xs text-amber-700">
              No ready list found. Prepare a list in Lists before creating campaign.
            </p>
          ) : null}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1">
            <span className="text-xs font-medium text-slate-600">Daily cap</span>
            <input
              name="daily_cap"
              type="number"
              min={1}
              max={maxDailyCap}
              defaultValue={defaultDailyCap}
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
              defaultValue={defaultHardCap}
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
              defaultValue={defaultMinIntervalSeconds}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </label>
          <label className="grid gap-1">
            <span className="text-xs font-medium text-slate-600">Max interval (sec)</span>
            <input
              name="max_interval_seconds"
              type="number"
              min={30}
              defaultValue={defaultMaxIntervalSeconds}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </label>
        </div>

        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input
            name="include_role_emails"
            type="checkbox"
            defaultChecked={defaultAllowRoleBasedRecipients}
          />
          Include role-based mailboxes (info@, contact@, admin@)
        </label>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setNotesOpen(true)}
            className="inline-flex h-9 items-center justify-center rounded-lg border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            Prepare notes
          </button>
          <Link
            href="/app/docs"
            className="inline-flex h-9 items-center justify-center rounded-lg border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            Open docs
          </Link>
          <button
            type="submit"
            disabled={!hasTemplates || !hasReadyLists || !selectedListId}
            className="inline-flex h-9 items-center justify-center rounded-lg border border-blue-700 bg-blue-600 px-3 text-xs font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Save + Prepare recipients
          </button>
        </div>
      </form>

      {notesOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/30 px-4">
          <div className="w-full max-w-2xl rounded-xl border border-slate-200 bg-white p-4 shadow-xl">
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

      {templatePreviewOpen && selectedTemplate ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/30 px-4">
          <div className="w-full max-w-2xl rounded-xl border border-slate-200 bg-white p-4 shadow-xl">
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
            <div className="space-y-2 text-sm text-slate-700">
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                <p className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
                  Subject
                </p>
                <p className="mt-1 whitespace-pre-wrap">{selectedTemplate.subject_template}</p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                <p className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
                  Body
                </p>
                <p className="mt-1 whitespace-pre-wrap">{selectedTemplate.body_template}</p>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
