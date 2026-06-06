"use client";

import { useEffect, useMemo, useState, useTransition } from "react";

export type TemplateVariantRow = {
  subject: string;
  body: string;
  tone: string;
  edited_at?: string | null;
};

export type TemplateVariantSetRow = {
  id: string;
  template_id: string;
  name: string;
  language: "en" | "zh" | "es";
  generation_notes?: Record<string, unknown>;
  variants: TemplateVariantRow[];
  updated_at: string;
};

interface TemplateVariantSetsPanelProps {
  templateId: string;
  initialSets: TemplateVariantSetRow[];
  defaultSelectedSetId?: string | null;
  canEdit: boolean;
  allowGenerate?: boolean;
  onSelectionChange?: (setId: string | null) => void;
  onSetsChange?: (sets: TemplateVariantSetRow[]) => void;
}

const TONE_LABEL: Record<string, string> = {
  base: "Base",
  brief: "Brief",
  professional: "Professional",
  casual: "Casual",
  warm: "Warm",
};

function toSafeText(value: string) {
  return value.trim();
}

function formatTimestamp(value: string | null | undefined) {
  if (!value) {
    return "N/A";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "N/A";
  }
  return date.toLocaleString();
}

function languageLabel(value: string) {
  if (value === "zh") return "Chinese";
  if (value === "es") return "Spanish";
  return "English";
}

export function TemplateVariantSetsPanel({
  templateId,
  initialSets,
  defaultSelectedSetId = null,
  canEdit,
  allowGenerate = true,
  onSelectionChange,
  onSetsChange,
}: TemplateVariantSetsPanelProps) {
  const [localSets, setLocalSets] = useState<TemplateVariantSetRow[] | null>(null);
  const sets = localSets ?? initialSets;
  const initialSelectedSetId =
    defaultSelectedSetId && sets.some((set) => set.id === defaultSelectedSetId)
      ? defaultSelectedSetId
      : sets.length > 0
        ? sets[0].id
        : null;
  const [selectedSetId, setSelectedSetId] = useState<string | null>(initialSelectedSetId);
  const effectiveSelectedSetId =
    selectedSetId && sets.some((set) => set.id === selectedSetId)
      ? selectedSetId
      : sets.length > 0
        ? sets[0].id
        : null;
  const [nameDraft, setNameDraft] = useState(
    sets.find((set) => set.id === initialSelectedSetId)?.name ??
      sets[0]?.name ??
      "",
  );
  const [setNameInput, setSetNameInput] = useState("Var-A");
  const [languageInput, setLanguageInput] = useState<"en" | "zh" | "es">("en");
  const [mustIncludeInput, setMustIncludeInput] = useState("");
  const [mustAvoidInput, setMustAvoidInput] = useState("");
  const [modalIndex, setModalIndex] = useState<number | null>(null);
  const [modalSubject, setModalSubject] = useState("");
  const [modalBody, setModalBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const selectedSet = useMemo(
    () => sets.find((set) => set.id === effectiveSelectedSetId) ?? null,
    [effectiveSelectedSetId, sets],
  );
  const displayVariants = useMemo(
    () =>
      selectedSet
        ? Array.from({ length: 5 }, (_, index) => selectedSet.variants[index] ?? null)
        : [],
    [selectedSet],
  );

  function updateSets(next: TemplateVariantSetRow[]) {
    setLocalSets(next);
    onSetsChange?.(next);
    const fallbackSelection =
      effectiveSelectedSetId && next.some((set) => set.id === effectiveSelectedSetId)
        ? effectiveSelectedSetId
        : next.length > 0
          ? next[0].id
          : null;
    setSelectedSetId(fallbackSelection);
    const fallbackSet = next.find((set) => set.id === fallbackSelection) ?? null;
    setNameDraft(fallbackSet?.name ?? "");
    onSelectionChange?.(fallbackSelection);
  }

  useEffect(() => {
    onSelectionChange?.(effectiveSelectedSetId);
  }, [effectiveSelectedSetId, onSelectionChange]);

  async function requestJson(
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<{ ok: boolean; data: Record<string, unknown> }> {
    const response = await fetch(input, init);
    const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    return {
      ok: response.ok,
      data,
    };
  }

  function generateSet() {
    if (!allowGenerate || !canEdit) {
      return;
    }
    const name = toSafeText(setNameInput);
    if (!name) {
      setError("Variant set name is required.");
      return;
    }
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const { ok, data } = await requestJson(`/api/templates/${templateId}/variant-sets`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          language: languageInput,
          mustInclude: mustIncludeInput,
          mustAvoid: mustAvoidInput,
        }),
      });
      if (!ok || !data.item || typeof data.item !== "object") {
        setError(typeof data.error === "string" ? data.error : "Could not generate variant set.");
        return;
      }

      const created = data.item as unknown as TemplateVariantSetRow;
      const nextSets = [...sets, created];
      updateSets(nextSets);
      setSelectedSetId(created.id);
      setNotice(`Created variant set: ${created.name}`);
    });
  }

  function saveSetName() {
    if (!selectedSet || !canEdit) {
      return;
    }
    const nextName = toSafeText(nameDraft);
    if (!nextName) {
      setError("Set name cannot be empty.");
      return;
    }
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const { ok, data } = await requestJson(`/api/templates/${templateId}/variant-sets`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          setId: selectedSet.id,
          name: nextName,
        }),
      });
      if (!ok || !data.item || typeof data.item !== "object") {
        setError(typeof data.error === "string" ? data.error : "Could not rename variant set.");
        return;
      }
      const updated = data.item as unknown as TemplateVariantSetRow;
      const nextSets = sets.map((row) => (row.id === updated.id ? updated : row));
      updateSets(nextSets);
      setNotice("Variant set renamed.");
    });
  }

  function openEditModal(index: number, variant: TemplateVariantRow | null) {
    if (!variant) {
      return;
    }
    setModalIndex(index);
    setModalSubject(variant.subject);
    setModalBody(variant.body);
    setError(null);
    setNotice(null);
  }

  function saveVariant(index: number) {
    if (!selectedSet || !canEdit) {
      return;
    }
    const subject = toSafeText(modalSubject);
    const body = toSafeText(modalBody);
    if (!subject || !body) {
      setError("Subject and body are required.");
      return;
    }
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const { ok, data } = await requestJson(`/api/templates/${templateId}/variant-sets`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          setId: selectedSet.id,
          index,
          subject,
          body,
        }),
      });
      if (!ok || !data.item || typeof data.item !== "object") {
        setError(typeof data.error === "string" ? data.error : "Could not save variant.");
        return;
      }
      const updated = data.item as unknown as TemplateVariantSetRow;
      const nextSets = sets.map((row) => (row.id === updated.id ? updated : row));
      updateSets(nextSets);
      setModalIndex(null);
      setNotice(`Variant ${index + 1} updated.`);
    });
  }

  useEffect(() => {
    if (modalIndex === null) {
      return;
    }
    function onEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setModalIndex(null);
      }
    }
    window.addEventListener("keydown", onEscape);
    return () => window.removeEventListener("keydown", onEscape);
  }, [modalIndex]);

  return (
    <div className="grid gap-3">
      <div className="grid gap-2 md:grid-cols-[1fr_auto] md:items-end">
        <label className="grid gap-1">
          <span className="text-xs font-medium text-slate-600">Variant set</span>
          <select
            value={effectiveSelectedSetId ?? ""}
            onChange={(event) => {
              const nextId = event.target.value || null;
              setSelectedSetId(nextId);
              const nextSet = sets.find((set) => set.id === nextId) ?? null;
              setNameDraft(nextSet?.name ?? "");
              onSelectionChange?.(nextId);
            }}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="">No variant set</option>
            {sets.map((set) => (
              <option key={set.id} value={set.id}>
                {set.name} ({languageLabel(set.language)})
              </option>
            ))}
          </select>
        </label>
        {selectedSet ? (
          <p className="text-xs text-slate-500">Updated: {formatTimestamp(selectedSet.updated_at)}</p>
        ) : null}
      </div>

      {selectedSet ? (
        <div className="grid gap-2 md:grid-cols-[1fr_auto] md:items-end">
          <label className="grid gap-1">
            <span className="text-xs font-medium text-slate-600">Set name</span>
            <input
              value={nameDraft}
              onChange={(event) => setNameDraft(event.target.value)}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
              disabled={!canEdit || pending}
            />
          </label>
          {canEdit ? (
            <button
              type="button"
              onClick={saveSetName}
              disabled={pending}
              className="inline-flex h-9 items-center justify-center rounded-lg border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Save set name
            </button>
          ) : null}
        </div>
      ) : null}

      {allowGenerate ? (
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
            Generate new set
          </p>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            <label className="grid gap-1">
              <span className="text-xs font-medium text-slate-600">Set name</span>
              <input
                value={setNameInput}
                onChange={(event) => setSetNameInput(event.target.value)}
                className="rounded-md border border-slate-300 px-2.5 py-1.5 text-sm"
                disabled={!canEdit || pending}
              />
            </label>
            <label className="grid gap-1">
              <span className="text-xs font-medium text-slate-600">Language</span>
              <select
                value={languageInput}
                onChange={(event) =>
                  setLanguageInput(event.target.value as "en" | "zh" | "es")
                }
                className="rounded-md border border-slate-300 px-2.5 py-1.5 text-sm"
                disabled={!canEdit || pending}
              >
                <option value="en">English</option>
                <option value="zh">Chinese</option>
                <option value="es">Spanish</option>
              </select>
            </label>
            <label className="grid gap-1 sm:col-span-2">
              <span className="text-xs font-medium text-slate-600">Must include (optional)</span>
              <input
                value={mustIncludeInput}
                onChange={(event) => setMustIncludeInput(event.target.value)}
                className="rounded-md border border-slate-300 px-2.5 py-1.5 text-sm"
                disabled={!canEdit || pending}
              />
            </label>
            <label className="grid gap-1 sm:col-span-2">
              <span className="text-xs font-medium text-slate-600">Must avoid (optional)</span>
              <input
                value={mustAvoidInput}
                onChange={(event) => setMustAvoidInput(event.target.value)}
                className="rounded-md border border-slate-300 px-2.5 py-1.5 text-sm"
                disabled={!canEdit || pending}
              />
            </label>
          </div>
          {canEdit ? (
            <button
              type="button"
              onClick={generateSet}
              disabled={pending}
              className="mt-2 inline-flex h-8 items-center justify-center rounded-md border border-blue-700 bg-blue-600 px-3 text-xs font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {pending ? "Generating..." : "Generate 5 variants"}
            </button>
          ) : null}
        </div>
      ) : null}

      {error ? (
        <p className="rounded-md border border-rose-200 bg-rose-50 px-2 py-1 text-xs text-rose-700">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p className="rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs text-emerald-700">
          {notice}
        </p>
      ) : null}

      {selectedSet ? (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
          {displayVariants.map((variant, index) => (
            <button
              key={`${selectedSet.id}-${index}`}
              type="button"
              onClick={() => openEditModal(index, variant)}
              disabled={!variant}
              className="rounded-xl border border-slate-200 bg-white p-3 text-left transition hover:border-blue-300 hover:bg-blue-50/30 disabled:cursor-not-allowed"
            >
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-medium text-slate-600">Variant {index + 1}</p>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-700">
                  {variant ? TONE_LABEL[variant.tone] ?? variant.tone : "N/A"}
                </span>
              </div>
              {!variant ? (
                <p className="mt-3 text-xs text-slate-500">
                  Missing variant. Regenerate this set.
                </p>
              ) : (
                <div className="mt-2 space-y-2">
                  <div className="flex flex-wrap items-center gap-1.5">
                    {variant.edited_at ? (
                      <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em] text-emerald-700">
                        Edited
                      </span>
                    ) : null}
                    <span className="text-[11px] text-slate-500">
                      {variant.edited_at
                        ? formatTimestamp(variant.edited_at)
                        : "Not edited"}
                    </span>
                  </div>
                  <p className="text-xs font-medium text-slate-900">{variant.subject}</p>
                  <pre className="max-h-36 overflow-auto whitespace-pre-wrap text-xs leading-5 text-slate-700">
                    {variant.body}
                  </pre>
                </div>
              )}
            </button>
          ))}
        </div>
      ) : (
        <p className="text-xs text-slate-500">
          Select a variant set to preview and edit its 5 cards.
        </p>
      )}

      {selectedSet && modalIndex !== null && displayVariants[modalIndex] ? (
        <div className="fixed inset-0 z-50 bg-slate-950/45 px-4 py-6" onClick={() => setModalIndex(null)}>
          <div
            className="mx-auto flex max-h-[calc(100vh-3rem)] w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-semibold text-slate-900">
                  {selectedSet.name} · Variant {modalIndex + 1}
                </p>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-700">
                  {TONE_LABEL[displayVariants[modalIndex]!.tone] ?? displayVariants[modalIndex]!.tone}
                </span>
              </div>
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
                  disabled={!canEdit || pending}
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
                  disabled={!canEdit || pending}
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
              {canEdit ? (
                <button
                  type="button"
                  onClick={() => saveVariant(modalIndex)}
                  disabled={pending}
                  className="inline-flex h-8 items-center rounded-md border border-blue-700 bg-blue-600 px-3 text-xs font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {pending ? "Saving..." : "Save"}
                </button>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
