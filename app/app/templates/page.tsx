import {
  PageHeader,
  SectionCard,
} from "@/components/product/page-primitives";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getOrCreatePrimaryWorkspace } from "@/lib/workspaces";
import { isMissingTableError, toSafeText } from "@/lib/single-send";
import { logWorkspaceAudit } from "@/lib/audit";
import { TemplateLibraryTable } from "@/components/templates/template-library-table";
import { TemplateStarterGrid } from "@/components/templates/template-starter-grid";
import { TemplateAiGenerator } from "@/components/templates/template-ai-generator";

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
  const activeTab =
    params.tab === "starters" || params.tab === "ai" ? params.tab : "library";
  const openTemplateId =
    typeof params.templateId === "string" ? params.templateId : null;

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
      "/app/templates?tab=library&message=" + encodeURIComponent("Template created."),
    );
  }

  const { data: templates, error: templatesError } = await supabase
    .from("templates")
    .select(
      "id, name, campaign_type, subject_template, body_template, is_active, created_at",
    )
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
        <div className="grid gap-3">
          <SectionCard title="Template workspace">
            <div className="flex flex-wrap items-center gap-2">
              <Link
                href="/app/templates?tab=library"
                className={`inline-flex h-8 items-center rounded-md border px-2.5 text-xs font-semibold ${
                  activeTab === "library"
                    ? "border-blue-700 bg-blue-600 text-white"
                    : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                }`}
              >
                My templates
              </Link>
              <Link
                href="/app/templates?tab=starters"
                className={`inline-flex h-8 items-center rounded-md border px-2.5 text-xs font-semibold ${
                  activeTab === "starters"
                    ? "border-blue-700 bg-blue-600 text-white"
                    : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                }`}
              >
                Starter library
              </Link>
              <Link
                href="/app/templates?tab=ai"
                className={`inline-flex h-8 items-center rounded-md border px-2.5 text-xs font-semibold ${
                  activeTab === "ai"
                    ? "border-blue-700 bg-blue-600 text-white"
                    : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                }`}
              >
                AI generator
              </Link>
            </div>
          </SectionCard>

          {activeTab === "starters" ? (
            <SectionCard title="Starter library">
              <TemplateStarterGrid />
            </SectionCard>
          ) : activeTab === "ai" ? (
            <SectionCard title="AI template generator">
              <TemplateAiGenerator />
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
                <TemplateLibraryTable
                  templates={templates ?? []}
                  initialOpenTemplateId={openTemplateId}
                />
              </SectionCard>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
