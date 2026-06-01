import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { PageHeader, SectionCard } from "@/components/product/page-primitives";
import { createClient } from "@/lib/supabase/server";
import { getOrCreatePrimaryWorkspace } from "@/lib/workspaces";
import { isMissingTableError } from "@/lib/single-send";
import { getWorkspaceRole } from "@/lib/workspace-access";
import { generateListVariants } from "@/lib/ai/list-variants";
import { logWorkspaceAudit } from "@/lib/audit";

type VariantLanguage = "en" | "zh" | "es";
type StoredVariant = {
  subject: string;
  body: string;
  tone: string;
};

function parseVariantLanguage(value: FormDataEntryValue | null): VariantLanguage {
  const normalized = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (normalized === "zh" || normalized === "es") {
    return normalized;
  }
  return "en";
}

export default async function ListDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const errorMessage =
    typeof query.error === "string" ? decodeURIComponent(query.error) : null;
  const message =
    typeof query.message === "string" ? decodeURIComponent(query.message) : null;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/login?next=/app/lists/${id}`);
  }

  const workspace = await getOrCreatePrimaryWorkspace(user, supabase);

  async function generateAiVariants(formData: FormData) {
    "use server";

    const templateId = String(formData.get("template_id") ?? "").trim();
    const language = parseVariantLanguage(formData.get("variant_language"));

    if (!templateId) {
      redirect(`/app/lists/${id}?error=` + encodeURIComponent("Template is required."));
    }

    const serverSupabase = await createClient();
    const {
      data: { user: actionUser },
    } = await serverSupabase.auth.getUser();
    if (!actionUser) {
      redirect(`/login?next=/app/lists/${id}`);
    }

    const actionWorkspace = await getOrCreatePrimaryWorkspace(actionUser, serverSupabase);
    const role = await getWorkspaceRole(
      actionWorkspace.workspaceId,
      actionUser.id,
      serverSupabase,
    );
    if (!role || role === "viewer") {
      redirect(
        `/app/lists/${id}?error=` +
          encodeURIComponent("Viewer role cannot generate AI variants."),
      );
    }

    const { data: listForAction, error: listActionError } = await serverSupabase
      .from("audience_lists")
      .select("id, name")
      .eq("workspace_id", actionWorkspace.workspaceId)
      .eq("id", id)
      .maybeSingle();

    if (listActionError || !listForAction) {
      redirect(
        `/app/lists/${id}?error=` +
          encodeURIComponent(listActionError?.message ?? "List not found."),
      );
    }

    const { data: template, error: templateError } = await serverSupabase
      .from("templates")
      .select("id, name, subject_template, body_template")
      .eq("workspace_id", actionWorkspace.workspaceId)
      .eq("id", templateId)
      .eq("is_active", true)
      .maybeSingle();

    if (templateError || !template) {
      redirect(
        `/app/lists/${id}?error=` +
          encodeURIComponent(templateError?.message ?? "Template not found."),
      );
    }

    const result = await generateListVariants({
      baseSubject: template.subject_template,
      baseBody: template.body_template,
      language,
    });

    if (!result.ok || !result.variants) {
      redirect(
        `/app/lists/${id}?error=` +
          encodeURIComponent(result.error ?? "Could not generate AI variants."),
      );
    }

    const { error: updateError } = await serverSupabase
      .from("audience_lists")
      .update({
        variants_template_id: template.id,
        template_variants: result.variants as unknown as Record<string, unknown>,
        variants_generated_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", listForAction.id);

    if (updateError) {
      redirect(`/app/lists/${id}?error=` + encodeURIComponent(updateError.message));
    }

    await logWorkspaceAudit({
      workspaceId: actionWorkspace.workspaceId,
      actorUserId: actionUser.id,
      action: "lists.variants_generated",
      entityType: "audience_list",
      entityId: listForAction.id,
      metadata: {
        templateId: template.id,
        templateName: template.name,
        language,
        variantCount: result.variants.length,
      },
    });

    redirect(
      `/app/lists/${id}?message=` +
        encodeURIComponent(`Generated ${result.variants.length} AI variants.`),
    );
  }

  async function clearAiVariants() {
    "use server";

    const serverSupabase = await createClient();
    const {
      data: { user: actionUser },
    } = await serverSupabase.auth.getUser();
    if (!actionUser) {
      redirect(`/login?next=/app/lists/${id}`);
    }

    const actionWorkspace = await getOrCreatePrimaryWorkspace(actionUser, serverSupabase);
    const role = await getWorkspaceRole(
      actionWorkspace.workspaceId,
      actionUser.id,
      serverSupabase,
    );
    if (!role || role === "viewer") {
      redirect(
        `/app/lists/${id}?error=` +
          encodeURIComponent("Viewer role cannot clear AI variants."),
      );
    }

    const { error: updateError } = await serverSupabase
      .from("audience_lists")
      .update({
        variants_template_id: null,
        template_variants: null,
        variants_generated_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq("workspace_id", actionWorkspace.workspaceId)
      .eq("id", id);

    if (updateError) {
      redirect(`/app/lists/${id}?error=` + encodeURIComponent(updateError.message));
    }

    await logWorkspaceAudit({
      workspaceId: actionWorkspace.workspaceId,
      actorUserId: actionUser.id,
      action: "lists.variants_cleared",
      entityType: "audience_list",
      entityId: id,
    });

    redirect(`/app/lists/${id}?message=` + encodeURIComponent("AI variants cleared."));
  }

  const { data: list, error: listError } = await supabase
    .from("audience_lists")
    .select(
      "id, name, status, source_filename, raw_row_count, valid_row_count, deduped_row_count, suppressed_row_count, ready_row_count, processing_notes, default_language, template_variants, variants_template_id, variants_generated_at, created_at",
    )
    .eq("workspace_id", workspace.workspaceId)
    .eq("id", id)
    .maybeSingle();

  if (listError) {
    if (isMissingTableError(listError)) {
      return (
        <SectionCard title="Database migration required">
          <p className="text-sm leading-6 text-slate-600">
            Lists tables are not ready. Run
            <code className="mx-1 rounded bg-slate-100 px-1.5 py-0.5 text-xs">
              supabase/migrations/0008_lists_mvp.sql
            </code>
            and refresh.
          </p>
        </SectionCard>
      );
    }
    throw listError;
  }

  if (!list) {
    notFound();
  }

  const { data: entries, error: entriesError } = await supabase
    .from("audience_list_entries")
    .select("id, email, full_name, company_name, language, is_suppressed, created_at")
    .eq("workspace_id", workspace.workspaceId)
    .eq("list_id", list.id)
    .order("created_at", { ascending: true })
    .limit(300);

  if (entriesError) {
    throw entriesError;
  }

  const { data: templates, error: templatesError } = await supabase
    .from("templates")
    .select("id, name")
    .eq("workspace_id", workspace.workspaceId)
    .eq("is_active", true)
    .order("created_at", { ascending: false });

  if (templatesError) {
    throw templatesError;
  }

  const variants = Array.isArray(list.template_variants)
    ? (list.template_variants as unknown as StoredVariant[])
    : [];
  const variantTemplate = (templates ?? []).find(
    (template) => template.id === list.variants_template_id,
  );

  return (
    <div className="grid gap-3">
      <PageHeader
        title={`List: ${list.name}`}
        description="List detail, dedupe/suppression outcomes, and campaign handoff."
        actions={
          <Link
            href={`/app/campaigns?listId=${list.id}`}
            className="inline-flex h-9 items-center rounded-lg border border-blue-700 bg-blue-600 px-3 text-xs font-semibold text-white hover:bg-blue-700"
          >
            Create campaign from this list
          </Link>
        }
      />

      {errorMessage ? (
        <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
          {errorMessage}
        </p>
      ) : null}
      {message ? (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
          {message}
        </p>
      ) : null}

      <section className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
        <article className="rounded-xl border border-slate-200 bg-white p-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500">
            Status
          </p>
          <p className="mt-1 text-2xl font-semibold tracking-tight text-slate-950">
            {list.status}
          </p>
        </article>
        <article className="rounded-xl border border-slate-200 bg-white p-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500">
            Raw rows
          </p>
          <p className="mt-1 text-2xl font-semibold tracking-tight text-slate-950">
            {list.raw_row_count}
          </p>
        </article>
        <article className="rounded-xl border border-slate-200 bg-white p-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500">
            Valid rows
          </p>
          <p className="mt-1 text-2xl font-semibold tracking-tight text-slate-950">
            {list.valid_row_count}
          </p>
        </article>
        <article className="rounded-xl border border-slate-200 bg-white p-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500">
            Deduped rows
          </p>
          <p className="mt-1 text-2xl font-semibold tracking-tight text-slate-950">
            {list.deduped_row_count}
          </p>
        </article>
        <article className="rounded-xl border border-slate-200 bg-white p-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500">
            Ready rows
          </p>
          <p className="mt-1 text-2xl font-semibold tracking-tight text-slate-950">
            {list.ready_row_count}
          </p>
          <p className="text-[11px] text-slate-500">
            Suppressed {list.suppressed_row_count}
          </p>
        </article>
      </section>

      <SectionCard title="List source">
        <p className="text-sm text-slate-600">
          File: <span className="font-medium text-slate-800">{list.source_filename ?? "-"}</span>
        </p>
        <p className="mt-1 text-sm text-slate-600">
          Default language:{" "}
          <span className="font-medium text-slate-800">
            {(list.default_language ?? "en").toUpperCase()}
          </span>
        </p>
        <p className="mt-1 text-xs text-slate-500">
          Created: {new Date(list.created_at).toLocaleString()}
        </p>
        {list.processing_notes ? (
          <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
            Notes: {list.processing_notes}
          </p>
        ) : null}
      </SectionCard>

      <SectionCard title="How to send this list">
        <ol className="list-decimal space-y-2 pl-5 text-sm text-slate-600">
          <li>Optionally generate AI content variations for better deliverability.</li>
          <li>Click &quot;Create campaign from this list&quot; in the page header.</li>
          <li>Pick a template and keep this list as recipient source.</li>
          <li>Open queued recipients in Gmail and mark sent in campaign detail.</li>
        </ol>
      </SectionCard>

      <SectionCard title="AI content variations">
        <div className="grid gap-3">
          <p className="text-sm text-slate-600">
            Same as BAAM Review flow: generate multiple template variants so each
            recipient does not receive identical copy.
          </p>

          <form action={generateAiVariants} className="grid gap-3 md:grid-cols-[1fr_180px_auto]">
            <label className="grid gap-1">
              <span className="text-xs font-medium text-slate-600">Template</span>
              <select
                name="template_id"
                required
                defaultValue={list.variants_template_id ?? templates?.[0]?.id ?? ""}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
              >
                {(templates ?? []).map((template) => (
                  <option key={template.id} value={template.id}>
                    {template.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1">
              <span className="text-xs font-medium text-slate-600">Language</span>
              <select
                name="variant_language"
                defaultValue={list.default_language ?? "en"}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
              >
                <option value="en">English</option>
                <option value="zh">Chinese</option>
                <option value="es">Spanish</option>
              </select>
            </label>
            <div className="flex items-end gap-2">
              <button
                type="submit"
                className="inline-flex h-9 items-center rounded-lg border border-blue-700 bg-blue-600 px-3 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                disabled={(templates ?? []).length === 0}
              >
                {variants.length > 0 ? "Regenerate variants" : "Generate variants"}
              </button>
              {variants.length > 0 ? (
                <button
                  type="submit"
                  formAction={clearAiVariants}
                  className="inline-flex h-9 items-center rounded-lg border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Clear
                </button>
              ) : null}
            </div>
          </form>

          {(templates ?? []).length === 0 ? (
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
              Create at least one active template before generating AI variants.
            </p>
          ) : null}

          {variants.length > 0 ? (
            <div className="grid gap-2">
              <p className="text-xs text-slate-500">
                Generated {variants.length} variants
                {variantTemplate ? ` from template "${variantTemplate.name}"` : ""}.
                {list.variants_generated_at
                  ? ` Last generated ${new Date(list.variants_generated_at).toLocaleString()}.`
                  : ""}
              </p>
              <div className="space-y-2">
                {variants.map((variant, index) => (
                  <article
                    key={`${index}-${variant.tone}`}
                    className="rounded-xl border border-slate-200 bg-slate-50 p-3"
                  >
                    <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">
                      Variant {index + 1} · {variant.tone}
                    </p>
                    <p className="mt-1 text-sm font-medium text-slate-900">{variant.subject}</p>
                    <pre className="mt-1 whitespace-pre-wrap text-xs leading-5 text-slate-700">
                      {variant.body}
                    </pre>
                  </article>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-sm text-slate-500">
              No variants generated yet. Generate them now, then create a campaign
              from this list using the same template to auto-apply variations.
            </p>
          )}
        </div>
      </SectionCard>

      <SectionCard title="Entries (first 300)">
        {(entries ?? []).length === 0 ? (
          <p className="text-sm text-slate-500">No entries found in this list.</p>
        ) : (
          <div className="overflow-hidden rounded-xl border border-slate-200">
            <table className="w-full border-collapse text-xs">
              <thead className="bg-slate-50">
                <tr>
                  {["Email", "Name", "Company", "Language", "Suppressed", "Created"].map((header) => (
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
                {(entries ?? []).map((entry) => (
                  <tr key={entry.id}>
                    <td className="border-b border-slate-200 px-3 py-2 text-slate-700">
                      {entry.email}
                    </td>
                    <td className="border-b border-slate-200 px-3 py-2 text-slate-700">
                      {entry.full_name}
                    </td>
                    <td className="border-b border-slate-200 px-3 py-2 text-slate-700">
                      {entry.company_name ?? "-"}
                    </td>
                    <td className="border-b border-slate-200 px-3 py-2 text-slate-700">
                      {(entry.language ?? "en").toUpperCase()}
                    </td>
                    <td className="border-b border-slate-200 px-3 py-2 text-slate-700">
                      {entry.is_suppressed ? "Yes" : "No"}
                    </td>
                    <td className="border-b border-slate-200 px-3 py-2 text-slate-500">
                      {new Date(entry.created_at).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>
    </div>
  );
}
