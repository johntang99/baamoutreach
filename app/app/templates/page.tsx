import {
  PageHeader,
  SectionCard,
} from "@/components/product/page-primitives";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getOrCreatePrimaryWorkspace } from "@/lib/workspaces";
import { isMissingTableError, toSafeText } from "@/lib/single-send";
import { logWorkspaceAudit } from "@/lib/audit";

export default async function TemplatesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const errorMessage =
    typeof params.error === "string" ? decodeURIComponent(params.error) : null;
  const message =
    typeof params.message === "string" ? decodeURIComponent(params.message) : null;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?next=/app/templates");
  }

  const workspace = await getOrCreatePrimaryWorkspace(user, supabase);

  async function createTemplate(formData: FormData) {
    "use server";

    const name = toSafeText(formData.get("name"));
    const campaignType = toSafeText(formData.get("campaign_type"), "general");
    const subjectTemplate = toSafeText(formData.get("subject_template"));
    const bodyTemplate = toSafeText(formData.get("body_template"));

    if (!name || !subjectTemplate || !bodyTemplate) {
      redirect(
        "/app/templates?error=" +
          encodeURIComponent("Name, subject, and body are required."),
      );
    }

    const serverSupabase = await createClient();
    const {
      data: { user: actionUser },
    } = await serverSupabase.auth.getUser();

    if (!actionUser) {
      redirect("/login?next=/app/templates");
    }

    const actionWorkspace = await getOrCreatePrimaryWorkspace(
      actionUser,
      serverSupabase,
    );
    const { data: insertedTemplate, error } = await serverSupabase
      .from("templates")
      .insert({
      workspace_id: actionWorkspace.workspaceId,
      name,
      campaign_type: campaignType,
      subject_template: subjectTemplate,
      body_template: bodyTemplate,
      is_active: true,
        created_by: actionUser.id,
      })
      .select("id")
      .single();

    if (error) {
      if (isMissingTableError(error)) {
        redirect(
          "/app/templates?error=" +
            encodeURIComponent(
              "Run supabase/migrations/0002_single_send_mvp.sql first.",
            ),
        );
      }
      redirect("/app/templates?error=" + encodeURIComponent(error.message));
    }

    await logWorkspaceAudit({
      workspaceId: actionWorkspace.workspaceId,
      actorUserId: actionUser.id,
      action: "template.created",
      entityType: "template",
      entityId: insertedTemplate?.id ?? null,
      metadata: {
        name,
        campaignType,
      },
    });

    redirect(
      "/app/templates?message=" + encodeURIComponent("Template created."),
    );
  }

  const { data: templates, error: templatesError } = await supabase
    .from("templates")
    .select("id, name, campaign_type, subject_template, is_active, created_at")
    .eq("workspace_id", workspace.workspaceId)
    .order("created_at", { ascending: false })
    .limit(200);

  const schemaMissing = isMissingTableError(templatesError);

  return (
    <div className="grid gap-3">
      <PageHeader
        title="Templates"
        description="Template library, variant controls, and compliance checks for all campaign types."
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

      {schemaMissing ? (
        <SectionCard title="Database migration required">
          <p className="text-sm leading-6 text-slate-600">
            Templates table is not ready. Run
            <code className="mx-1 rounded bg-slate-100 px-1.5 py-0.5 text-xs">
              supabase/migrations/0002_single_send_mvp.sql
            </code>
            and refresh.
          </p>
        </SectionCard>
      ) : (
        <section className="grid gap-3 xl:grid-cols-[1fr_1.25fr]">
          <SectionCard title="Create template">
            <form action={createTemplate} className="grid gap-3">
              <label className="grid gap-1">
                <span className="text-xs font-medium text-slate-600">Name</span>
                <input
                  name="name"
                  type="text"
                  required
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </label>
              <label className="grid gap-1">
                <span className="text-xs font-medium text-slate-600">Campaign type</span>
                <input
                  name="campaign_type"
                  type="text"
                  placeholder="business_intro"
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </label>
              <label className="grid gap-1">
                <span className="text-xs font-medium text-slate-600">Subject template</span>
                <input
                  name="subject_template"
                  type="text"
                  required
                  placeholder="{first_name}, quick intro from BAAM Outreach"
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </label>
              <label className="grid gap-1">
                <span className="text-xs font-medium text-slate-600">Body template</span>
                <textarea
                  name="body_template"
                  required
                  rows={6}
                  placeholder={"Hi {first_name},\n\n..."}
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </label>
              <button
                type="submit"
                className="inline-flex h-9 items-center justify-center rounded-lg border border-blue-700 bg-blue-600 px-3 text-xs font-semibold text-white hover:bg-blue-700"
              >
                Save template
              </button>
            </form>
          </SectionCard>

          <SectionCard title="Template library">
            {(templates ?? []).length === 0 ? (
              <p className="text-sm text-slate-500">
                No templates yet. Create one to unlock single send.
              </p>
            ) : (
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
                    {(templates ?? []).map((template) => (
                      <tr key={template.id}>
                        <td className="border-b border-slate-200 px-3 py-2 text-slate-700">
                          {template.name}
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
            )}
          </SectionCard>
        </section>
      )}
    </div>
  );
}
