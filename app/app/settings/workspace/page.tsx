import {
  PageHeader,
  SectionCard,
} from "@/components/product/page-primitives";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getOrCreatePrimaryWorkspace } from "@/lib/workspaces";
import { isMissingTableError, toSafeText } from "@/lib/single-send";
import { logWorkspaceAudit } from "@/lib/audit";
import { getWorkspacePolicyDefaults } from "@/lib/policies";

export default async function WorkspaceSettingsPage({
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
    redirect("/login?next=/app/settings/workspace");
  }

  const workspace = await getOrCreatePrimaryWorkspace(user, supabase);
  const policy = await getWorkspacePolicyDefaults(workspace.workspaceId);
  const { error: policySchemaError } = await supabase
    .from("workspace_policies")
    .select("id")
    .limit(1);

  async function saveWorkspaceSettings(formData: FormData) {
    "use server";

    const workspaceName = toSafeText(formData.get("workspace_name"));
    const recommendedDailyCap = Number(formData.get("recommended_daily_cap") ?? 100);
    const hardDailyCap = Number(formData.get("hard_daily_cap") ?? 200);
    const minIntervalSeconds = Number(formData.get("min_interval_seconds") ?? 120);
    const maxIntervalSeconds = Number(formData.get("max_interval_seconds") ?? 180);
    const allowRoleBasedRecipients =
      String(formData.get("allow_role_based_recipients")) === "on";

    if (!workspaceName) {
      redirect(
        "/app/settings/workspace?error=" +
          encodeURIComponent("Workspace name is required."),
      );
    }

    const serverSupabase = await createClient();
    const {
      data: { user: actionUser },
    } = await serverSupabase.auth.getUser();

    if (!actionUser) {
      redirect("/login?next=/app/settings/workspace");
    }

    const actionWorkspace = await getOrCreatePrimaryWorkspace(
      actionUser,
      serverSupabase,
    );

    const { data: membership } = await serverSupabase
      .from("workspace_memberships")
      .select("role")
      .eq("workspace_id", actionWorkspace.workspaceId)
      .eq("user_id", actionUser.id)
      .maybeSingle();

    if (!membership || membership.role === "viewer") {
      redirect(
        "/app/settings/workspace?error=" +
          encodeURIComponent("Viewer role cannot update workspace settings."),
      );
    }

    const { error: workspaceError } = await serverSupabase
      .from("workspaces")
      .update({
        name: workspaceName,
        updated_at: new Date().toISOString(),
      })
      .eq("id", actionWorkspace.workspaceId);

    if (workspaceError) {
      redirect(
        "/app/settings/workspace?error=" +
          encodeURIComponent(workspaceError.message),
      );
    }

    const { error: policyError } = await serverSupabase
      .from("workspace_policies")
      .upsert(
        {
          workspace_id: actionWorkspace.workspaceId,
          recommended_daily_cap: Math.max(1, recommendedDailyCap),
          hard_daily_cap: Math.max(1, hardDailyCap),
          min_interval_seconds: Math.max(30, minIntervalSeconds),
          max_interval_seconds: Math.max(30, maxIntervalSeconds),
          allow_role_based_recipients: allowRoleBasedRecipients,
          created_by: actionUser.id,
          updated_by: actionUser.id,
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: "workspace_id",
        },
      );

    if (policyError) {
      if (isMissingTableError(policyError)) {
        redirect(
          "/app/settings/workspace?error=" +
            encodeURIComponent(
              "Run supabase/migrations/0004_policy_and_audit.sql first.",
            ),
        );
      }

      redirect(
        "/app/settings/workspace?error=" + encodeURIComponent(policyError.message),
      );
    }

    await logWorkspaceAudit({
      workspaceId: actionWorkspace.workspaceId,
      actorUserId: actionUser.id,
      action: "workspace.settings.updated",
      entityType: "workspace",
      entityId: actionWorkspace.workspaceId,
      metadata: {
        recommendedDailyCap: Math.max(1, recommendedDailyCap),
        hardDailyCap: Math.max(1, hardDailyCap),
        minIntervalSeconds: Math.max(30, minIntervalSeconds),
        maxIntervalSeconds: Math.max(30, maxIntervalSeconds),
        allowRoleBasedRecipients,
      },
    });

    redirect(
      "/app/settings/workspace?message=" +
        encodeURIComponent("Workspace settings saved."),
    );
  }

  const policyTableMissing = isMissingTableError(policySchemaError);

  return (
    <div className="grid gap-3">
      <PageHeader
        title="Workspace Settings"
        description="Workspace profile, branding, localization, and default outreach policies."
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

      {policyTableMissing ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
          Policy table not found yet. Run
          <code className="mx-1 rounded bg-amber-100 px-1.5 py-0.5">
            supabase/migrations/0004_policy_and_audit.sql
          </code>
          to persist settings.
        </p>
      ) : null}

      <form action={saveWorkspaceSettings} className="grid gap-3 xl:grid-cols-2">
        <SectionCard title="Profile and branding">
          <div className="grid gap-3">
            <label className="grid gap-1">
              <span className="text-xs font-medium text-slate-600">Workspace name</span>
              <input
                name="workspace_name"
                type="text"
                defaultValue={workspace.workspaceName}
                required
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </label>
            <p className="text-xs text-slate-500">
              Additional branding fields (logo, color, locale) can be added in next iteration.
            </p>
          </div>
        </SectionCard>

        <SectionCard title="Policy defaults">
          <div className="grid gap-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="grid gap-1">
                <span className="text-xs font-medium text-slate-600">Recommended daily cap</span>
                <input
                  name="recommended_daily_cap"
                  type="number"
                  min={1}
                  defaultValue={policy.recommendedDailyCap}
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </label>
              <label className="grid gap-1">
                <span className="text-xs font-medium text-slate-600">Hard daily cap</span>
                <input
                  name="hard_daily_cap"
                  type="number"
                  min={1}
                  defaultValue={policy.hardDailyCap}
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </label>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="grid gap-1">
                <span className="text-xs font-medium text-slate-600">Min interval seconds</span>
                <input
                  name="min_interval_seconds"
                  type="number"
                  min={30}
                  defaultValue={policy.minIntervalSeconds}
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </label>
              <label className="grid gap-1">
                <span className="text-xs font-medium text-slate-600">Max interval seconds</span>
                <input
                  name="max_interval_seconds"
                  type="number"
                  min={30}
                  defaultValue={policy.maxIntervalSeconds}
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </label>
            </div>
            <label className="flex items-center gap-2 text-sm text-slate-600">
              <input
                name="allow_role_based_recipients"
                type="checkbox"
                defaultChecked={policy.allowRoleBasedRecipients}
              />
              Allow role-based recipients by default
            </label>
            <button
              type="submit"
              className="inline-flex h-9 items-center justify-center rounded-lg border border-blue-700 bg-blue-600 px-3 text-xs font-semibold text-white hover:bg-blue-700"
            >
              Save workspace settings
            </button>
          </div>
        </SectionCard>
      </form>
    </div>
  );
}
