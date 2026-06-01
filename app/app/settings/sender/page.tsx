import {
  PageHeader,
  SectionCard,
} from "@/components/product/page-primitives";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getOrCreatePrimaryWorkspace } from "@/lib/workspaces";
import { isMissingTableError, toSafeText } from "@/lib/single-send";
import { logWorkspaceAudit } from "@/lib/audit";

export default async function SenderSettingsPage({
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
    redirect("/login?next=/app/settings/sender");
  }

  const workspace = await getOrCreatePrimaryWorkspace(user, supabase);
  const { data: senderSettings, error: senderSettingsError } = await supabase
    .from("workspace_sender_settings")
    .select("send_from_name, reply_to_email, gmail_preset_email")
    .eq("workspace_id", workspace.workspaceId)
    .maybeSingle();

  const senderTableMissing = isMissingTableError(senderSettingsError);

  async function saveSenderSettings(formData: FormData) {
    "use server";

    const sendFromName = toSafeText(formData.get("send_from_name"));
    const replyToEmail = toSafeText(formData.get("reply_to_email"));
    const gmailPresetEmail = toSafeText(formData.get("gmail_preset_email"));

    const serverSupabase = await createClient();
    const {
      data: { user: actionUser },
    } = await serverSupabase.auth.getUser();

    if (!actionUser) {
      redirect("/login?next=/app/settings/sender");
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
        "/app/settings/sender?error=" +
          encodeURIComponent("Viewer role cannot update sender settings."),
      );
    }

    const { error } = await serverSupabase
      .from("workspace_sender_settings")
      .upsert(
        {
          workspace_id: actionWorkspace.workspaceId,
          send_from_name: sendFromName || null,
          reply_to_email: replyToEmail || null,
          gmail_preset_email: gmailPresetEmail || null,
          created_by: actionUser.id,
          updated_by: actionUser.id,
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: "workspace_id",
        },
      );

    if (error) {
      if (isMissingTableError(error)) {
        redirect(
          "/app/settings/sender?error=" +
            encodeURIComponent(
              "Run supabase/migrations/0004_policy_and_audit.sql first.",
            ),
        );
      }
      redirect("/app/settings/sender?error=" + encodeURIComponent(error.message));
    }

    await logWorkspaceAudit({
      workspaceId: actionWorkspace.workspaceId,
      actorUserId: actionUser.id,
      action: "workspace.sender.updated",
      entityType: "workspace_sender_settings",
      entityId: actionWorkspace.workspaceId,
      metadata: {
        sendFromName,
        replyToEmail,
        gmailPresetEmail,
      },
    });

    redirect(
      "/app/settings/sender?message=" + encodeURIComponent("Sender settings saved."),
    );
  }

  return (
    <div className="grid gap-3">
      <PageHeader
        title="Sender Settings"
        description="Sender identity, Gmail preset, and send-mode configuration."
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

      {senderTableMissing ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
          Sender settings table not found. Run
          <code className="mx-1 rounded bg-amber-100 px-1.5 py-0.5">
            supabase/migrations/0004_policy_and_audit.sql
          </code>
          to persist this config.
        </p>
      ) : null}

      <form action={saveSenderSettings}>
        <section className="grid gap-3 xl:grid-cols-2">
          <SectionCard title="Sender identity">
            <div className="grid gap-3">
              <label className="grid gap-1">
                <span className="text-xs font-medium text-slate-600">Send-from name</span>
                <input
                  name="send_from_name"
                  type="text"
                  defaultValue={senderSettings?.send_from_name ?? ""}
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </label>
              <label className="grid gap-1">
                <span className="text-xs font-medium text-slate-600">Reply-to email</span>
                <input
                  name="reply_to_email"
                  type="email"
                  defaultValue={senderSettings?.reply_to_email ?? ""}
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </label>
              <label className="grid gap-1">
                <span className="text-xs font-medium text-slate-600">Gmail preset email</span>
                <input
                  name="gmail_preset_email"
                  type="email"
                  defaultValue={senderSettings?.gmail_preset_email ?? ""}
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </label>
            </div>
          </SectionCard>
          <SectionCard title="Operational rules">
            <ul className="space-y-2 text-sm text-slate-600">
              <li className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                Manual Send in Gmail remains the default execution mode.
              </li>
              <li className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                Single send and bulk send inherit workspace policy gates.
              </li>
              <li className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                Sender changes are written into workspace audit logs.
              </li>
            </ul>
            <button
              type="submit"
              className="mt-3 inline-flex h-9 items-center justify-center rounded-lg border border-blue-700 bg-blue-600 px-3 text-xs font-semibold text-white hover:bg-blue-700"
            >
              Save sender settings
            </button>
          </SectionCard>
        </section>
      </form>
    </div>
  );
}
