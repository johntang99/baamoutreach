import Link from "next/link";
import { redirect } from "next/navigation";
import { PageHeader, SectionCard } from "@/components/product/page-primitives";
import { logWorkspaceAudit } from "@/lib/audit";
import { isMissingTableError, toSafeText } from "@/lib/single-send";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getOrCreatePrimaryWorkspace } from "@/lib/workspaces";

function shortUserId(userId: string) {
  if (userId.length <= 12) return userId;
  return `${userId.slice(0, 8)}...${userId.slice(-4)}`;
}

function toDisplayName(params: {
  fullName?: string | null;
  email?: string | null;
  userId: string;
}) {
  const fullName = params.fullName?.trim();
  if (fullName) return fullName;

  const email = params.email?.trim();
  if (email) return email;

  return shortUserId(params.userId);
}

function isMissingColumnError(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const maybeCode = (error as { code?: string }).code;
  return maybeCode === "42703";
}

function isLikelyEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

type SenderSettingsRow = {
  id: string;
  send_from_name: string | null;
  reply_to_email: string | null;
  gmail_preset_email: string | null;
  added_by_user_id: string | null;
  is_verified: boolean;
  created_at: string;
  updated_at: string;
};

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
  const editingSenderId = typeof params.edit === "string" ? params.edit : null;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?next=/app/settings/sender");
  }

  const workspace = await getOrCreatePrimaryWorkspace(user, supabase);
  const { data: senderRows, error: senderSettingsError } = await supabase
    .from("workspace_sender_settings")
    .select(
      "id, send_from_name, reply_to_email, gmail_preset_email, added_by_user_id, is_verified, created_at, updated_at",
    )
    .eq("workspace_id", workspace.workspaceId)
    .order("created_at", { ascending: false });

  const senderTableMissing = isMissingTableError(senderSettingsError);
  const senderColumnsMissing = isMissingColumnError(senderSettingsError);
  if (senderSettingsError && !senderTableMissing && !senderColumnsMissing) {
    throw senderSettingsError;
  }

  const senders = (senderRows ?? []) as SenderSettingsRow[];
  const editingSender =
    senders.find((sender) => sender.id === editingSenderId) ?? null;
  const senderSchemaReady = !senderTableMissing && !senderColumnsMissing;

  const admin = createAdminClient();
  const { data: members, error: membersError } = await admin
    .from("workspace_memberships")
    .select("user_id, created_at")
    .eq("workspace_id", workspace.workspaceId)
    .order("created_at", { ascending: true });

  if (membersError) {
    throw membersError;
  }

  const uniqueUserIds = [
    ...new Set((members ?? []).map((member) => member.user_id).filter(Boolean)),
  ];
  const memberProfileByUserId = new Map<
    string,
    {
      displayName: string;
      email: string | null;
    }
  >();

  await Promise.all(
    uniqueUserIds.map(async (userId) => {
      const { data, error } = await admin.auth.admin.getUserById(userId);
      if (error || !data.user) {
        memberProfileByUserId.set(userId, {
          displayName: toDisplayName({ userId }),
          email: null,
        });
        return;
      }

      const fullNameRaw = data.user.user_metadata?.full_name;
      const fullName =
        typeof fullNameRaw === "string" && fullNameRaw.trim().length > 0
          ? fullNameRaw
          : null;
      const email = data.user.email ?? null;
      memberProfileByUserId.set(userId, {
        displayName: toDisplayName({
          fullName,
          email,
          userId,
        }),
        email,
      });
    }),
  );

  const memberOptions = uniqueUserIds.map((userId) => ({
    userId,
    displayName: memberProfileByUserId.get(userId)?.displayName ?? shortUserId(userId),
    email: memberProfileByUserId.get(userId)?.email ?? null,
  }));
  const hasTeamMembers = memberOptions.length > 0;

  async function addSender(formData: FormData) {
    "use server";

    const sendFromName = toSafeText(formData.get("send_from_name"));
    const replyToEmailRaw = toSafeText(formData.get("reply_to_email"));
    const gmailPresetEmail = toSafeText(formData.get("gmail_preset_email"));
    const addedByUserId = toSafeText(formData.get("added_by_user_id"));
    const verifiedRaw = toSafeText(formData.get("is_verified"), "no");
    const isVerified = verifiedRaw === "yes";
    const replyToEmail = replyToEmailRaw ? normalizeEmail(replyToEmailRaw) : "";
    const normalizedGmailPresetEmail = normalizeEmail(gmailPresetEmail);

    if (!sendFromName) {
      redirect(
        "/app/settings/sender?error=" +
          encodeURIComponent("Send-from name is required."),
      );
    }
    if (!gmailPresetEmail) {
      redirect(
        "/app/settings/sender?error=" +
          encodeURIComponent("Gmail preset email is required."),
      );
    }
    if (!isLikelyEmail(normalizedGmailPresetEmail)) {
      redirect(
        "/app/settings/sender?error=" +
          encodeURIComponent("Gmail preset email format is invalid."),
      );
    }
    if (replyToEmail && !isLikelyEmail(replyToEmail)) {
      redirect(
        "/app/settings/sender?error=" +
          encodeURIComponent("Reply-to email format is invalid."),
      );
    }
    if (!addedByUserId) {
      redirect(
        "/app/settings/sender?error=" +
          encodeURIComponent("Please choose who added this sender."),
      );
    }

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

    const { data: addedByMember } = await serverSupabase
      .from("workspace_memberships")
      .select("id")
      .eq("workspace_id", actionWorkspace.workspaceId)
      .eq("user_id", addedByUserId)
      .maybeSingle();

    if (!addedByMember) {
      redirect(
        "/app/settings/sender?error=" +
          encodeURIComponent("Added by user must be a team member."),
      );
    }

    const { data: duplicateSender } = await serverSupabase
      .from("workspace_sender_settings")
      .select("id")
      .eq("workspace_id", actionWorkspace.workspaceId)
      .ilike("gmail_preset_email", normalizedGmailPresetEmail)
      .limit(1)
      .maybeSingle();

    if (duplicateSender) {
      redirect(
        "/app/settings/sender?error=" +
          encodeURIComponent("Gmail preset email already exists in this workspace."),
      );
    }

    const { data: insertedSender, error } = await serverSupabase
      .from("workspace_sender_settings")
      .insert({
        workspace_id: actionWorkspace.workspaceId,
        send_from_name: sendFromName,
        reply_to_email: replyToEmail || null,
        gmail_preset_email: normalizedGmailPresetEmail,
        added_by_user_id: addedByUserId,
        is_verified: isVerified,
        created_by: actionUser.id,
        updated_by: actionUser.id,
        updated_at: new Date().toISOString(),
      })
      .select("id")
      .maybeSingle();

    if (error) {
      if (isMissingTableError(error)) {
        redirect(
          "/app/settings/sender?error=" +
            encodeURIComponent(
              "Run supabase/migrations/0004_policy_and_audit.sql first.",
            ),
        );
      }
      if (isMissingColumnError(error)) {
        redirect(
          "/app/settings/sender?error=" +
            encodeURIComponent(
              "Run supabase/migrations/0012_workspace_multiple_senders.sql first.",
            ),
        );
      }
      redirect("/app/settings/sender?error=" + encodeURIComponent(error.message));
    }

    await logWorkspaceAudit({
      workspaceId: actionWorkspace.workspaceId,
      actorUserId: actionUser.id,
      action: "workspace.sender.created",
      entityType: "workspace_sender_settings",
      entityId: insertedSender?.id ?? null,
      metadata: {
        sendFromName,
        replyToEmail,
        gmailPresetEmail,
        addedByUserId,
        isVerified,
      },
    });

    redirect(
      "/app/settings/sender?message=" + encodeURIComponent("New sender added."),
    );
  }

  async function updateSender(formData: FormData) {
    "use server";

    const senderId = toSafeText(formData.get("sender_id"));
    const sendFromName = toSafeText(formData.get("send_from_name"));
    const replyToEmailRaw = toSafeText(formData.get("reply_to_email"));
    const gmailPresetEmail = toSafeText(formData.get("gmail_preset_email"));
    const addedByUserIdRaw = toSafeText(formData.get("added_by_user_id"));
    const verifiedRaw = toSafeText(formData.get("is_verified"), "no");
    const isVerified = verifiedRaw === "yes";
    const replyToEmail = replyToEmailRaw ? normalizeEmail(replyToEmailRaw) : "";
    const normalizedGmailPresetEmail = normalizeEmail(gmailPresetEmail);

    if (!senderId) {
      redirect(
        "/app/settings/sender?error=" + encodeURIComponent("Sender id is required."),
      );
    }
    if (!sendFromName) {
      redirect(
        "/app/settings/sender?error=" +
          encodeURIComponent("Send-from name is required."),
      );
    }
    if (!gmailPresetEmail) {
      redirect(
        "/app/settings/sender?error=" +
          encodeURIComponent("Gmail preset email is required."),
      );
    }
    if (!isLikelyEmail(normalizedGmailPresetEmail)) {
      redirect(
        "/app/settings/sender?error=" +
          encodeURIComponent("Gmail preset email format is invalid."),
      );
    }
    if (replyToEmail && !isLikelyEmail(replyToEmail)) {
      redirect(
        "/app/settings/sender?error=" +
          encodeURIComponent("Reply-to email format is invalid."),
      );
    }

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

    const { data: currentSender } = await serverSupabase
      .from("workspace_sender_settings")
      .select("id, added_by_user_id")
      .eq("id", senderId)
      .eq("workspace_id", actionWorkspace.workspaceId)
      .maybeSingle();

    if (!currentSender) {
      redirect(
        "/app/settings/sender?error=" + encodeURIComponent("Sender not found."),
      );
    }

    const addedByUserId =
      addedByUserIdRaw || (currentSender.added_by_user_id ?? "");
    if (!addedByUserId) {
      redirect(
        "/app/settings/sender?error=" +
          encodeURIComponent("Please choose who added this sender."),
      );
    }

    const { data: addedByMember } = await serverSupabase
      .from("workspace_memberships")
      .select("id")
      .eq("workspace_id", actionWorkspace.workspaceId)
      .eq("user_id", addedByUserId)
      .maybeSingle();

    if (!addedByMember) {
      redirect(
        "/app/settings/sender?error=" +
          encodeURIComponent("Added by user must be a team member."),
      );
    }

    const { data: duplicateSender } = await serverSupabase
      .from("workspace_sender_settings")
      .select("id")
      .eq("workspace_id", actionWorkspace.workspaceId)
      .ilike("gmail_preset_email", normalizedGmailPresetEmail)
      .neq("id", senderId)
      .limit(1)
      .maybeSingle();

    if (duplicateSender) {
      redirect(
        "/app/settings/sender?error=" +
          encodeURIComponent("Gmail preset email already exists in this workspace."),
      );
    }

    const { data: updatedSender, error } = await serverSupabase
      .from("workspace_sender_settings")
      .update({
        send_from_name: sendFromName,
        reply_to_email: replyToEmail || null,
        gmail_preset_email: normalizedGmailPresetEmail,
        added_by_user_id: addedByUserId,
        is_verified: isVerified,
        updated_by: actionUser.id,
        updated_at: new Date().toISOString(),
      })
      .eq("id", senderId)
      .eq("workspace_id", actionWorkspace.workspaceId)
      .select("id")
      .maybeSingle();

    if (error) {
      if (isMissingTableError(error)) {
        redirect(
          "/app/settings/sender?error=" +
            encodeURIComponent(
              "Run supabase/migrations/0004_policy_and_audit.sql first.",
            ),
        );
      }
      if (isMissingColumnError(error)) {
        redirect(
          "/app/settings/sender?error=" +
            encodeURIComponent(
              "Run supabase/migrations/0012_workspace_multiple_senders.sql first.",
            ),
        );
      }
      redirect("/app/settings/sender?error=" + encodeURIComponent(error.message));
    }

    if (!updatedSender) {
      redirect(
        "/app/settings/sender?error=" + encodeURIComponent("Sender not found."),
      );
    }

    await logWorkspaceAudit({
      workspaceId: actionWorkspace.workspaceId,
      actorUserId: actionUser.id,
      action: "workspace.sender.updated",
      entityType: "workspace_sender_settings",
      entityId: senderId,
      metadata: {
        sendFromName,
        replyToEmail,
        gmailPresetEmail,
        addedByUserId,
        isVerified,
      },
    });

    redirect(
      "/app/settings/sender?message=" + encodeURIComponent("Sender updated."),
    );
  }

  async function deleteSender(formData: FormData) {
    "use server";

    const senderId = toSafeText(formData.get("sender_id"));
    if (!senderId) {
      redirect(
        "/app/settings/sender?error=" + encodeURIComponent("Sender id is required."),
      );
    }

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

    const { data: deletedSender, error } = await serverSupabase
      .from("workspace_sender_settings")
      .delete()
      .eq("id", senderId)
      .eq("workspace_id", actionWorkspace.workspaceId)
      .select("id, send_from_name")
      .maybeSingle();

    if (error) {
      if (isMissingTableError(error)) {
        redirect(
          "/app/settings/sender?error=" +
            encodeURIComponent(
              "Run supabase/migrations/0004_policy_and_audit.sql first.",
            ),
        );
      }
      if (isMissingColumnError(error)) {
        redirect(
          "/app/settings/sender?error=" +
            encodeURIComponent(
              "Run supabase/migrations/0012_workspace_multiple_senders.sql first.",
            ),
        );
      }
      redirect("/app/settings/sender?error=" + encodeURIComponent(error.message));
    }

    if (!deletedSender) {
      redirect(
        "/app/settings/sender?error=" + encodeURIComponent("Sender not found."),
      );
    }

    await logWorkspaceAudit({
      workspaceId: actionWorkspace.workspaceId,
      actorUserId: actionUser.id,
      action: "workspace.sender.deleted",
      entityType: "workspace_sender_settings",
      entityId: senderId,
      metadata: {
        sendFromName: deletedSender.send_from_name,
      },
    });

    redirect(
      "/app/settings/sender?message=" + encodeURIComponent("Sender deleted."),
    );
  }

  return (
    <div className="grid gap-3">
      <PageHeader
        title="Sender Settings"
        description="Manage multiple sender identities, ownership, verification, and Gmail presets."
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
          first.
        </p>
      ) : null}
      {senderColumnsMissing ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
          Sender table schema is outdated. Run
          <code className="mx-1 rounded bg-amber-100 px-1.5 py-0.5">
            supabase/migrations/0012_workspace_multiple_senders.sql
          </code>
          to enable multi-sender management.
        </p>
      ) : null}

      <section className="grid gap-3 xl:grid-cols-[1fr_1.4fr]">
        <SectionCard title="Add new sender">
          {senderSchemaReady && hasTeamMembers ? (
            <form action={addSender} className="grid gap-3">
              <label className="grid gap-1">
                <span className="text-xs font-medium text-slate-600">Send-from name</span>
                <input
                  name="send_from_name"
                  type="text"
                  required
                  placeholder="Review Support"
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </label>
              <label className="grid gap-1">
                <span className="text-xs font-medium text-slate-600">Reply-to email</span>
                <input
                  name="reply_to_email"
                  type="email"
                  placeholder="support@company.com"
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </label>
              <label className="grid gap-1">
                <span className="text-xs font-medium text-slate-600">Gmail preset email</span>
                <input
                  name="gmail_preset_email"
                  type="email"
                  required
                  placeholder="support@company.com"
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </label>
              <label className="grid gap-1">
                <span className="text-xs font-medium text-slate-600">Added by</span>
                <select
                  name="added_by_user_id"
                  required
                  defaultValue={memberOptions[0]?.userId ?? ""}
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                >
                  {memberOptions.map((member) => (
                    <option key={member.userId} value={member.userId}>
                      {member.displayName}
                      {member.email ? ` (${member.email})` : ""}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1">
                <span className="text-xs font-medium text-slate-600">Verified</span>
                <select
                  name="is_verified"
                  defaultValue="no"
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                >
                  <option value="yes">Yes</option>
                  <option value="no">No</option>
                </select>
              </label>
              <button
                type="submit"
                className="inline-flex h-9 items-center justify-center rounded-lg border border-blue-700 bg-blue-600 px-3 text-xs font-semibold text-white hover:bg-blue-700"
              >
                Add new sender
              </button>
            </form>
          ) : senderSchemaReady ? (
            <p className="text-sm text-amber-700">
              No team members found. Add at least one member in Team settings before
              creating sender profiles.
            </p>
          ) : (
            <p className="text-sm text-slate-500">
              Run the migration first, then refresh to add senders.
            </p>
          )}
        </SectionCard>

        <SectionCard title="Sender list">
          {!senderSchemaReady ? (
            <p className="text-sm text-slate-500">
              Sender list becomes available after migration.
            </p>
          ) : senders.length === 0 ? (
            <p className="text-sm text-slate-500">
              No senders yet. Add your first sender from the left panel.
            </p>
          ) : (
            <div className="overflow-hidden rounded-xl border border-slate-200">
              <table className="w-full border-collapse text-xs">
                <thead className="bg-slate-50">
                  <tr>
                    {[
                      "Name",
                      "Reply-to",
                      "Gmail preset",
                      "Added by",
                      "Verified",
                      "Action",
                    ].map((header) => (
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
                  {senders.map((sender) => (
                    <tr key={sender.id}>
                      <td className="border-b border-slate-200 px-3 py-2 text-slate-700">
                        {sender.send_from_name || "-"}
                      </td>
                      <td className="border-b border-slate-200 px-3 py-2 text-slate-600">
                        {sender.reply_to_email || "-"}
                      </td>
                      <td className="border-b border-slate-200 px-3 py-2 text-slate-600">
                        {sender.gmail_preset_email || "-"}
                      </td>
                      <td className="border-b border-slate-200 px-3 py-2 text-slate-600">
                        {sender.added_by_user_id
                          ? (memberProfileByUserId.get(sender.added_by_user_id)?.displayName ??
                            shortUserId(sender.added_by_user_id))
                          : "-"}
                      </td>
                      <td className="border-b border-slate-200 px-3 py-2">
                        <span
                          className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                            sender.is_verified
                              ? "bg-emerald-100 text-emerald-700"
                              : "bg-slate-100 text-slate-600"
                          }`}
                        >
                          {sender.is_verified ? "Yes" : "No"}
                        </span>
                      </td>
                      <td className="border-b border-slate-200 px-3 py-2">
                        <Link
                          href={`/app/settings/sender?edit=${encodeURIComponent(sender.id)}`}
                          className="inline-flex rounded-md border border-slate-300 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                        >
                          Edit
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>
      </section>

      {editingSender ? (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/30 px-4 py-6">
          <div className="mx-auto my-2 flex w-full max-w-xl flex-col rounded-xl border border-slate-200 bg-white p-4 shadow-xl">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-900">
                Edit sender: {editingSender.send_from_name || editingSender.gmail_preset_email}
              </h3>
              <Link
                href="/app/settings/sender"
                className="inline-flex h-8 items-center rounded-md border border-slate-300 bg-white px-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Close
              </Link>
            </div>

            <form action={updateSender} className="grid gap-3">
              <input type="hidden" name="sender_id" value={editingSender.id} />
              {!hasTeamMembers ? (
                <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                  Team member list is empty. Update is limited until at least one member exists.
                </p>
              ) : null}
              <label className="grid gap-1">
                <span className="text-xs font-medium text-slate-600">Send-from name</span>
                <input
                  name="send_from_name"
                  type="text"
                  required
                  defaultValue={editingSender.send_from_name ?? ""}
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </label>
              <label className="grid gap-1">
                <span className="text-xs font-medium text-slate-600">Reply-to email</span>
                <input
                  name="reply_to_email"
                  type="email"
                  defaultValue={editingSender.reply_to_email ?? ""}
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </label>
              <label className="grid gap-1">
                <span className="text-xs font-medium text-slate-600">Gmail preset email</span>
                <input
                  name="gmail_preset_email"
                  type="email"
                  required
                  defaultValue={editingSender.gmail_preset_email ?? ""}
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </label>
              {hasTeamMembers ? (
                <label className="grid gap-1">
                  <span className="text-xs font-medium text-slate-600">Added by</span>
                  <select
                    name="added_by_user_id"
                    required
                    defaultValue={editingSender.added_by_user_id ?? memberOptions[0]?.userId ?? ""}
                    className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  >
                    {memberOptions.map((member) => (
                      <option key={member.userId} value={member.userId}>
                        {member.displayName}
                        {member.email ? ` (${member.email})` : ""}
                      </option>
                    ))}
                  </select>
                </label>
              ) : (
                <input
                  type="hidden"
                  name="added_by_user_id"
                  value={editingSender.added_by_user_id ?? ""}
                />
              )}
              <label className="grid gap-1">
                <span className="text-xs font-medium text-slate-600">Verified</span>
                <select
                  name="is_verified"
                  defaultValue={editingSender.is_verified ? "yes" : "no"}
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                >
                  <option value="yes">Yes</option>
                  <option value="no">No</option>
                </select>
              </label>

              <div className="mt-1">
                <button
                  type="submit"
                  className="inline-flex h-9 items-center justify-center rounded-lg border border-blue-700 bg-blue-600 px-3 text-xs font-semibold text-white hover:bg-blue-700"
                >
                  Save sender
                </button>
              </div>
            </form>

            <form action={deleteSender} className="mt-2">
              <input type="hidden" name="sender_id" value={editingSender.id} />
              <button
                type="submit"
                className="inline-flex h-9 items-center justify-center rounded-lg border border-rose-300 bg-white px-3 text-xs font-semibold text-rose-700 hover:bg-rose-50"
              >
                Delete sender
              </button>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
