"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkBreaks from "remark-breaks";
import {
  TemplateVariantSetsPanel,
  type TemplateVariantSetRow,
} from "@/components/templates/template-variant-sets-panel";

type TemplateRow = {
  id: string;
  name: string;
  campaign_type: string;
  subject_template: string;
  body_template: string;
  is_active: boolean;
  created_at: string;
};

interface TemplateLibraryTableProps {
  templates: TemplateRow[];
  variantSetsByTemplate: Record<string, TemplateVariantSetRow[]>;
  initialOpenTemplateId?: string | null;
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
    // Normalize common bullet glyphs to markdown list items on new lines.
    .replace(/\s*[•●▪◦]\s*/g, "\n- ");
  if (!bulletNormalized.includes("\n")) {
    return bulletNormalized;
  }

  // Keep author-intended markdown as-is if they already use explicit paragraph breaks.
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

    const isBullet = /^([•*-]\s+|\d+\.\s+)/.test(line);
    const normalizedLine = line.replace(/^•\s+/, "- ");

    if (output.length > 0 && output.at(-1) !== "") {
      if (isBullet && !previousWasList) {
        output.push("");
      } else if (!isBullet) {
        output.push("");
      }
    }

    output.push(normalizedLine);
    previousWasList = isBullet;
  }

  return output.join("\n");
}

export function TemplateLibraryTable({
  templates,
  variantSetsByTemplate,
  initialOpenTemplateId = null,
}: TemplateLibraryTableProps) {
  const router = useRouter();
  const bodyTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [templateRows, setTemplateRows] = useState<TemplateRow[]>(templates);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDuplicating, setIsDuplicating] = useState(false);
  const [isArchiving, setIsArchiving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);
  const [modalMessage, setModalMessage] = useState<string | null>(null);
  const [tableNotice, setTableNotice] = useState<string | null>(null);
  const [variantSetMap, setVariantSetMap] = useState<Record<string, TemplateVariantSetRow[]>>(
    variantSetsByTemplate,
  );
  const [imageAltText, setImageAltText] = useState("");
  const [editValues, setEditValues] = useState({
    name: "",
    campaignType: "",
    subjectTemplate: "",
    bodyTemplate: "",
  });

  const selectedTemplate = useMemo(
    () => templateRows.find((template) => template.id === selectedTemplateId) ?? null,
    [selectedTemplateId, templateRows],
  );
  const selectedTemplateVariantSets = selectedTemplate
    ? (variantSetMap[selectedTemplate.id] ?? [])
    : [];

  useEffect(() => {
    if (!initialOpenTemplateId) return;
    const matched = templateRows.find((template) => template.id === initialOpenTemplateId);
    if (!matched) return;
    openTemplateModal(matched);
  }, [initialOpenTemplateId, templateRows]);

  function openTemplateModal(template: TemplateRow) {
    setSelectedTemplateId(template.id);
    setIsEditing(false);
    setModalError(null);
    setModalMessage(null);
    setImageAltText(template.name);
    setEditValues({
      name: template.name,
      campaignType: template.campaign_type,
      subjectTemplate: decodeTemplateText(template.subject_template),
      bodyTemplate: decodeTemplateText(template.body_template),
    });
  }

  function closeTemplateModal() {
    setSelectedTemplateId(null);
    setIsEditing(false);
    setModalError(null);
    setModalMessage(null);
    setIsUploadingImage(false);
  }

  function insertIntoBody(value: string) {
    const target = bodyTextareaRef.current;
    if (!target) {
      setEditValues((current) => ({
        ...current,
        bodyTemplate: `${current.bodyTemplate}${value}`,
      }));
      return;
    }

    const start = target.selectionStart ?? editValues.bodyTemplate.length;
    const end = target.selectionEnd ?? editValues.bodyTemplate.length;
    const next =
      editValues.bodyTemplate.slice(0, start) + value + editValues.bodyTemplate.slice(end);
    const nextCursor = start + value.length;

    setEditValues((current) => ({
      ...current,
      bodyTemplate: next,
    }));

    requestAnimationFrame(() => {
      target.focus();
      target.setSelectionRange(nextCursor, nextCursor);
    });
  }

  async function uploadImage(file: File) {
    setIsUploadingImage(true);
    setModalError(null);
    setModalMessage(null);

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("altText", imageAltText.trim());

      const response = await fetch("/api/templates/upload-image", {
        method: "POST",
        body: formData,
      });
      const data = (await response.json()) as {
        error?: string;
        markdown?: string;
      };

      if (!response.ok || !data.markdown) {
        setModalError(data.error ?? "Could not upload image.");
        return;
      }

      insertIntoBody(`\n${data.markdown}\n`);
      setModalMessage("Image uploaded and inserted.");
    } catch {
      setModalError("Network error while uploading image.");
    } finally {
      setIsUploadingImage(false);
    }
  }

  async function saveTemplateEdits() {
    if (!selectedTemplate) return;

    const name = editValues.name.trim();
    const campaignType = editValues.campaignType.trim();
    const subjectTemplate = editValues.subjectTemplate.trim();
    const bodyTemplate = editValues.bodyTemplate.trim();

    if (!name || !subjectTemplate || !bodyTemplate) {
      setModalError("Name, subject, and body are required.");
      return;
    }

    setIsSaving(true);
    setModalError(null);
    setModalMessage(null);

    try {
      const response = await fetch(`/api/templates/${selectedTemplate.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name,
          campaignType: campaignType || "general",
          subjectTemplate,
          bodyTemplate,
        }),
      });

      const data = (await response.json()) as {
        error?: string;
        template?: TemplateRow;
      };

      if (!response.ok || !data.template) {
        setModalError(data.error ?? "Could not update template.");
        return;
      }

      setTemplateRows((current) =>
        current.map((row) => (row.id === data.template?.id ? data.template : row)),
      );
      setModalMessage("Template updated.");
      setIsEditing(false);
      router.refresh();
    } catch {
      setModalError("Network error while saving template.");
    } finally {
      setIsSaving(false);
    }
  }

  async function duplicateTemplate() {
    if (!selectedTemplate) return;
    setIsDuplicating(true);
    setModalError(null);
    setModalMessage(null);

    try {
      const response = await fetch(`/api/templates/${selectedTemplate.id}/duplicate`, {
        method: "POST",
      });
      const data = (await response.json()) as {
        error?: string;
        template?: TemplateRow;
      };

      if (!response.ok || !data.template) {
        setModalError(data.error ?? "Could not duplicate template.");
        return;
      }

      setTemplateRows((current) => [data.template!, ...current]);
      openTemplateModal(data.template);
      setModalMessage(`Template duplicated: ${data.template.name}`);
      router.refresh();
    } catch {
      setModalError("Network error while duplicating template.");
    } finally {
      setIsDuplicating(false);
    }
  }

  async function setTemplateArchived(archive: boolean) {
    if (!selectedTemplate) return;
    setIsArchiving(true);
    setModalError(null);
    setModalMessage(null);

    try {
      const response = await fetch(`/api/templates/${selectedTemplate.id}/archive`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          archive,
        }),
      });
      const data = (await response.json()) as {
        error?: string;
        template?: TemplateRow;
      };

      if (!response.ok || !data.template) {
        setModalError(data.error ?? "Could not update template status.");
        return;
      }

      setTemplateRows((current) =>
        current.map((row) => (row.id === data.template?.id ? data.template : row)),
      );
      openTemplateModal(data.template);
      setModalMessage(archive ? "Template archived." : "Template unarchived.");
      router.refresh();
    } catch {
      setModalError("Network error while updating template status.");
    } finally {
      setIsArchiving(false);
    }
  }

  async function deleteTemplate() {
    if (!selectedTemplate) return;
    const confirmed = window.confirm(
      `Delete template "${selectedTemplate.name}"? This cannot be undone.`,
    );
    if (!confirmed) return;

    setIsDeleting(true);
    setModalError(null);
    setModalMessage(null);
    setTableNotice(null);

    try {
      const response = await fetch(`/api/templates/${selectedTemplate.id}`, {
        method: "DELETE",
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) {
        setModalError(data.error ?? "Could not delete template.");
        return;
      }

      const deletedName = selectedTemplate.name;
      setTemplateRows((current) =>
        current.filter((row) => row.id !== selectedTemplate.id),
      );
      setSelectedTemplateId(null);
      setIsEditing(false);
      setTableNotice(`Template deleted: ${deletedName}`);
      router.refresh();
    } catch {
      setModalError("Network error while deleting template.");
    } finally {
      setIsDeleting(false);
    }
  }

  if (templateRows.length === 0) {
    return (
      <p className="text-sm text-slate-500">
        No templates yet. Create one to unlock single send.
      </p>
    );
  }

  return (
    <>
      {tableNotice ? (
        <p className="mb-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
          {tableNotice}
        </p>
      ) : null}
      <div className="overflow-hidden rounded-xl border border-slate-200">
        <table className="w-full border-collapse text-xs">
          <thead className="bg-slate-50">
            <tr>
              {["Name", "Type", "Subject", "Active", "Created"].map((header) => (
                <th
                  key={header}
                  className="border-b border-slate-200 px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500"
                >
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {templateRows.map((template) => (
              <tr key={template.id}>
                <td className="border-b border-slate-200 px-3 py-2 text-slate-700">
                  <button
                    type="button"
                    onClick={() => openTemplateModal(template)}
                    className="font-medium text-blue-600 hover:text-blue-700"
                  >
                    {template.name}
                  </button>
                </td>
                <td className="border-b border-slate-200 px-3 py-2 text-slate-700">
                  {template.campaign_type}
                </td>
                <td className="border-b border-slate-200 px-3 py-2 text-slate-700">
                  {template.subject_template}
                </td>
                <td className="border-b border-slate-200 px-3 py-2 text-slate-700">
                  {template.is_active ? "Yes" : "No"}
                </td>
                <td className="border-b border-slate-200 px-3 py-2 text-slate-500">
                  {new Date(template.created_at).toLocaleDateString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {selectedTemplate ? (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/30 px-4 py-6">
          <div className="mx-auto my-2 flex w-full max-w-2xl max-h-[calc(100vh-3rem)] flex-col rounded-xl border border-slate-200 bg-white p-4 shadow-xl">
            <div className="mb-3 flex items-center justify-between shrink-0">
              <h3 className="text-sm font-semibold text-slate-900">
                {selectedTemplate.name} ({selectedTemplate.campaign_type})
              </h3>
              <div className="flex items-center gap-2">
                {!isEditing ? (
                  <button
                    type="button"
                    onClick={duplicateTemplate}
                    disabled={isDuplicating || isDeleting}
                    className="inline-flex h-8 items-center rounded-md border border-slate-300 bg-white px-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isDuplicating ? "Duplicating..." : "Duplicate"}
                  </button>
                ) : null}
                {isEditing ? (
                  <button
                    type="button"
                    onClick={saveTemplateEdits}
                    disabled={isSaving || isDeleting}
                    className="inline-flex h-8 items-center rounded-md border border-blue-700 bg-blue-600 px-2.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isSaving ? "Saving..." : "Save"}
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={isDeleting}
                    onClick={() => {
                      setIsEditing(true);
                      setModalError(null);
                      setModalMessage(null);
                    }}
                    className="inline-flex h-8 items-center rounded-md border border-slate-300 bg-white px-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Edit
                  </button>
                )}
                {isEditing ? (
                  <button
                    type="button"
                    onClick={() => {
                      setIsEditing(false);
                      setModalError(null);
                      setModalMessage(null);
                      setEditValues({
                        name: selectedTemplate.name,
                        campaignType: selectedTemplate.campaign_type,
                        subjectTemplate: decodeTemplateText(selectedTemplate.subject_template),
                        bodyTemplate: decodeTemplateText(selectedTemplate.body_template),
                      });
                    }}
                    className="inline-flex h-8 items-center rounded-md border border-slate-300 bg-white px-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    Cancel
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={isArchiving || isDeleting}
                    onClick={() => setTemplateArchived(selectedTemplate.is_active)}
                    className="inline-flex h-8 items-center rounded-md border border-slate-300 bg-white px-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isArchiving
                      ? "Saving..."
                      : selectedTemplate.is_active
                        ? "Archive"
                        : "Unarchive"}
                  </button>
                )}
                {!isEditing ? (
                  <button
                    type="button"
                    onClick={deleteTemplate}
                    disabled={isDeleting || isArchiving || isDuplicating}
                    className="inline-flex h-8 items-center rounded-md border border-rose-300 bg-white px-2.5 text-xs font-semibold text-rose-700 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isDeleting ? "Deleting..." : "Delete"}
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={closeTemplateModal}
                  className="inline-flex h-8 items-center rounded-md border border-slate-300 bg-white px-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Close
                </button>
              </div>
            </div>

            <div className="overflow-y-auto pr-1">
              {modalError ? (
                <p className="mb-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
                  {modalError}
                </p>
              ) : null}
              {modalMessage ? (
                <p className="mb-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
                  {modalMessage}
                </p>
              ) : null}

              {isEditing ? (
                <div className="grid gap-2 text-sm text-slate-700">
                <label className="grid gap-1">
                  <span className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
                    Name
                  </span>
                  <input
                    type="text"
                    value={editValues.name}
                    onChange={(event) =>
                      setEditValues((current) => ({
                        ...current,
                        name: event.target.value,
                      }))
                    }
                    className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                </label>
                <label className="grid gap-1">
                  <span className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
                    Campaign type
                  </span>
                  <input
                    type="text"
                    value={editValues.campaignType}
                    onChange={(event) =>
                      setEditValues((current) => ({
                        ...current,
                        campaignType: event.target.value,
                      }))
                    }
                    className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                </label>
                <label className="grid gap-1">
                  <span className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
                    Subject
                  </span>
                  <input
                    type="text"
                    value={editValues.subjectTemplate}
                    onChange={(event) =>
                      setEditValues((current) => ({
                        ...current,
                        subjectTemplate: event.target.value,
                      }))
                    }
                    className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                </label>
                <label className="grid gap-1">
                  <span className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
                    Body
                  </span>
                  <div className="flex flex-wrap gap-2 rounded-lg border border-slate-200 bg-slate-50 px-2 py-2">
                    <button
                      type="button"
                      onClick={() => insertIntoBody("{first_name}")}
                      className="inline-flex h-7 items-center rounded-md border border-slate-300 bg-white px-2 text-[11px] font-semibold text-slate-700"
                    >
                      Insert first name
                    </button>
                    <button
                      type="button"
                      onClick={() => insertIntoBody("{business_name}")}
                      className="inline-flex h-7 items-center rounded-md border border-slate-300 bg-white px-2 text-[11px] font-semibold text-slate-700"
                    >
                      Insert business
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        insertIntoBody("\n[Link text](https://example.com)\n")
                      }
                      className="inline-flex h-7 items-center rounded-md border border-slate-300 bg-white px-2 text-[11px] font-semibold text-slate-700"
                    >
                      Insert link
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        insertIntoBody("\n![Image alt](https://example.com/image.png)\n")
                      }
                      className="inline-flex h-7 items-center rounded-md border border-slate-300 bg-white px-2 text-[11px] font-semibold text-slate-700"
                    >
                      Insert image
                    </button>
                  </div>
                  <div className="grid gap-2 rounded-lg border border-slate-200 bg-slate-50 px-2 py-2 sm:grid-cols-[1fr_auto]">
                    <input
                      type="text"
                      value={imageAltText}
                      onChange={(event) => setImageAltText(event.target.value)}
                      placeholder="Image alt text"
                      className="rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs"
                    />
                    <label className="inline-flex h-8 cursor-pointer items-center justify-center rounded-md border border-slate-300 bg-white px-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">
                      {isUploadingImage ? "Uploading..." : "Upload image"}
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp,image/gif"
                        disabled={isUploadingImage}
                        className="hidden"
                        onChange={(event) => {
                          const file = event.target.files?.[0];
                          if (file) {
                            void uploadImage(file);
                          }
                          event.currentTarget.value = "";
                        }}
                      />
                    </label>
                  </div>
                  <div className="grid gap-2 lg:grid-cols-2">
                    <textarea
                      ref={bodyTextareaRef}
                      rows={12}
                      value={editValues.bodyTemplate}
                      onChange={(event) =>
                        setEditValues((current) => ({
                          ...current,
                          bodyTemplate: event.target.value,
                        }))
                      }
                      className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    />
                    <div className="rounded-lg border border-slate-300 bg-white px-3 py-2">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500">
                        Markdown preview
                      </p>
                      <div className="prose prose-sm mt-2 max-w-none text-slate-700 [&_li]:my-1 [&_ol]:list-decimal [&_ol]:pl-5 [&_ul]:list-disc [&_ul]:pl-5">
                        <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]}>
                          {toPreviewMarkdown(editValues.bodyTemplate)}
                        </ReactMarkdown>
                      </div>
                    </div>
                  </div>
                </label>
                {selectedTemplate ? (
                  <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3">
                    <p className="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
                      Template variant sets
                    </p>
                    <TemplateVariantSetsPanel
                      key={`template-variant-sets-edit-${selectedTemplate.id}`}
                      templateId={selectedTemplate.id}
                      initialSets={selectedTemplateVariantSets}
                      canEdit={true}
                      allowGenerate={true}
                      onSetsChange={(nextSets) =>
                        setVariantSetMap((current) => ({
                          ...current,
                          [selectedTemplate.id]: nextSets,
                        }))
                      }
                    />
                  </div>
                ) : null}
                </div>
              ) : (
                <div className="space-y-2 text-sm text-slate-700">
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                  <p className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
                    Status
                  </p>
                  <p className="mt-1">{selectedTemplate.is_active ? "Active" : "Archived"}</p>
                </div>
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
                {selectedTemplate ? (
                  <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3">
                    <p className="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
                      Template variant sets
                    </p>
                    <TemplateVariantSetsPanel
                      key={`template-variant-sets-view-${selectedTemplate.id}`}
                      templateId={selectedTemplate.id}
                      initialSets={selectedTemplateVariantSets}
                      canEdit={true}
                      allowGenerate={true}
                      onSetsChange={(nextSets) =>
                        setVariantSetMap((current) => ({
                          ...current,
                          [selectedTemplate.id]: nextSets,
                        }))
                      }
                    />
                  </div>
                ) : null}
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
