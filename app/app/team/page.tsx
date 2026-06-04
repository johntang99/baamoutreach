import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { PageHeader, SectionCard, StatCard } from "@/components/product/page-primitives";
import { createClient } from "@/lib/supabase/server";
import { getOrCreatePrimaryWorkspace } from "@/lib/workspaces";
import { getWorkspaceRole } from "@/lib/workspace-access";
import { getWorkspaceSubscription } from "@/lib/billing";
import { isMissingTableError, toSafeText } from "@/lib/single-send";
import { logWorkspaceAudit } from "@/lib/audit";
import { getSiteUrl } from "@/lib/supabase/env";
import { sendWorkspaceInviteEmail } from "@/lib/team-invitations";
import { createAdminClient } from "@/lib/supabase/admin";

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

function firstHeaderValue(value: string | null) {
  if (!value) return null;
  return value.split(",")[0]?.trim() ?? null;
}

async function getInviteBaseUrl() {
  const h = await headers();
  const forwardedHost = firstHeaderValue(h.get("x-forwarded-host"));
  const host = forwardedHost ?? firstHeaderValue(h.get("host"));
  const proto = firstHeaderValue(h.get("x-forwarded-proto")) ?? "https";

  if (host) {
    return `${proto}://${host}`;
  }

  return getSiteUrl();
}

export default async function TeamPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const errorMessage =
    typeof params.error === "string" ? decodeURIComponent(params.error) : null;
  const message =
    typeof params.message === "string" ? decodeURIComponent(params.message) : null;
  const warning =
    typeof params.warning === "string" ? decodeURIComponent(params.warning) : null;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?next=/app/team");
  }

  const workspace = await getOrCreatePrimaryWorkspace(user, supabase);
  const subscription = await getWorkspaceSubscription(workspace.workspaceId, supabase);

  async function inviteTeammate(formData: FormData) {
    "use server";

    const email = toSafeText(formData.get("email")).toLowerCase();
    const inviteRoleRaw = toSafeText(formData.get("role"), "viewer");
    const inviteRole = inviteRoleRaw === "operator" ? "operator" : "viewer";

    if (!email || !email.includes("@")) {
      redirect("/app/team?error=" + encodeURIComponent("A valid email is required."));
    }

    const serverSupabase = await createClient();
    const {
      data: { user: actionUser },
    } = await serverSupabase.auth.getUser();

    if (!actionUser) {
      redirect("/login?next=/app/team");
    }

    const actionWorkspace = await getOrCreatePrimaryWorkspace(
      actionUser,
      serverSupabase,
    );
    const actorRole = await getWorkspaceRole(
      actionWorkspace.workspaceId,
      actionUser.id,
      serverSupabase,
    );

    if (!actorRole || (actorRole !== "owner" && actorRole !== "operator")) {
      redirect(
        "/app/team?error=" +
          encodeURIComponent("Only owner/operator can invite teammates."),
      );
    }

    const teamSubscription = await getWorkspaceSubscription(
      actionWorkspace.workspaceId,
      serverSupabase,
    );
    if (teamSubscription.tableMissing) {
      redirect(
        "/app/team?error=" +
          encodeURIComponent(
            "Run supabase/migrations/0007_team_and_billing_foundation.sql first.",
          ),
      );
    }

    const { count: memberCount, error: memberCountError } = await serverSupabase
      .from("workspace_memberships")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", actionWorkspace.workspaceId);

    if (memberCountError) {
      redirect("/app/team?error=" + encodeURIComponent(memberCountError.message));
    }

    const { count: pendingInviteCount, error: pendingInviteError } =
      await serverSupabase
        .from("workspace_invitations")
        .select("id", { count: "exact", head: true })
        .eq("workspace_id", actionWorkspace.workspaceId)
        .eq("status", "pending");

    if (pendingInviteError) {
      if (isMissingTableError(pendingInviteError)) {
        redirect(
          "/app/team?error=" +
            encodeURIComponent(
              "Run supabase/migrations/0007_team_and_billing_foundation.sql first.",
            ),
        );
      }
      redirect("/app/team?error=" + encodeURIComponent(pendingInviteError.message));
    }

    const occupiedSeats = (memberCount ?? 0) + (pendingInviteCount ?? 0);
    if (occupiedSeats >= teamSubscription.seatLimit) {
      redirect(
        "/app/team?error=" +
          encodeURIComponent(
            `Seat limit reached for ${teamSubscription.planTier} plan (${teamSubscription.seatLimit} seats).`,
          ),
      );
    }

    const { data: existingInvite, error: existingInviteError } = await serverSupabase
      .from("workspace_invitations")
      .select("id")
      .eq("workspace_id", actionWorkspace.workspaceId)
      .eq("email", email)
      .eq("status", "pending")
      .maybeSingle();

    if (existingInviteError && !isMissingTableError(existingInviteError)) {
      redirect("/app/team?error=" + encodeURIComponent(existingInviteError.message));
    }

    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    if (existingInvite?.id) {
      const { error: updateInviteError } = await serverSupabase
        .from("workspace_invitations")
        .update({
          role: inviteRole,
          invited_by: actionUser.id,
          expires_at: expiresAt,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existingInvite.id);

      if (updateInviteError) {
        redirect("/app/team?error=" + encodeURIComponent(updateInviteError.message));
      }
    } else {
      const { error: createInviteError } = await serverSupabase
        .from("workspace_invitations")
        .insert({
          workspace_id: actionWorkspace.workspaceId,
          email,
          role: inviteRole,
          status: "pending",
          invited_by: actionUser.id,
          expires_at: expiresAt,
        });

      if (createInviteError) {
        if (isMissingTableError(createInviteError)) {
          redirect(
            "/app/team?error=" +
              encodeURIComponent(
                "Run supabase/migrations/0007_team_and_billing_foundation.sql first.",
              ),
          );
        }
        redirect("/app/team?error=" + encodeURIComponent(createInviteError.message));
      }
    }

    await logWorkspaceAudit({
      workspaceId: actionWorkspace.workspaceId,
      actorUserId: actionUser.id,
      action: "team.invite_upserted",
      entityType: "workspace_invitation",
      metadata: {
        email,
        role: inviteRole,
      },
    });

    const siteUrl = await getInviteBaseUrl();
    const signupPath = `/signup?email=${encodeURIComponent(email)}&invite=1`;
    const loginPath = `/login?next=${encodeURIComponent("/app")}&email=${encodeURIComponent(email)}&invite=1`;
    const signupUrl = `${siteUrl}/auth/switch-account?next=${encodeURIComponent(signupPath)}`;
    const loginUrl = `${siteUrl}/auth/switch-account?next=${encodeURIComponent(loginPath)}`;
    const inviteEmailResult = await sendWorkspaceInviteEmail({
      recipientEmail: email,
      role: inviteRole,
      workspaceName: actionWorkspace.workspaceName,
      inviterEmail: actionUser.email ?? "workspace owner",
      signupUrl,
      loginUrl,
    });

    if (!inviteEmailResult.sent) {
      redirect(
        "/app/team?message=" +
          encodeURIComponent(
            existingInvite?.id
              ? "Existing invite updated."
              : "Invitation created (pending).",
          ) +
          "&warning=" +
          encodeURIComponent(
            `Invite email could not be delivered: ${inviteEmailResult.error ?? "unknown error"}`,
          ),
      );
    }

    redirect(
      "/app/team?message=" +
        encodeURIComponent(
          existingInvite?.id
            ? "Existing invite updated and email sent."
            : "Invitation created and email sent.",
        ),
    );
  }

  async function updateMemberRole(formData: FormData) {
    "use server";

    const membershipId = toSafeText(formData.get("membership_id"));
    const nextRoleRaw = toSafeText(formData.get("next_role"), "viewer");
    const nextRole =
      nextRoleRaw === "owner" || nextRoleRaw === "operator" ? nextRoleRaw : "viewer";

    if (!membershipId) {
      redirect("/app/team?error=" + encodeURIComponent("Membership id is required."));
    }

    const serverSupabase = await createClient();
    const {
      data: { user: actionUser },
    } = await serverSupabase.auth.getUser();

    if (!actionUser) {
      redirect("/login?next=/app/team");
    }

    const actionWorkspace = await getOrCreatePrimaryWorkspace(
      actionUser,
      serverSupabase,
    );
    const actorRole = await getWorkspaceRole(
      actionWorkspace.workspaceId,
      actionUser.id,
      serverSupabase,
    );

    if (actorRole !== "owner") {
      redirect(
        "/app/team?error=" +
          encodeURIComponent("Only owner can update member roles."),
      );
    }

    const { data: targetMembership, error: targetError } = await serverSupabase
      .from("workspace_memberships")
      .select("id, user_id, role")
      .eq("id", membershipId)
      .eq("workspace_id", actionWorkspace.workspaceId)
      .maybeSingle();

    if (targetError || !targetMembership) {
      redirect(
        "/app/team?error=" +
          encodeURIComponent(targetError?.message ?? "Membership not found."),
      );
    }

    if (targetMembership.user_id === actionUser.id && nextRole !== "owner") {
      redirect(
        "/app/team?error=" +
          encodeURIComponent("Owner cannot demote themselves."),
      );
    }

    const { count: ownerCount } = await serverSupabase
      .from("workspace_memberships")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", actionWorkspace.workspaceId)
      .eq("role", "owner");

    if (
      targetMembership.role === "owner" &&
      nextRole !== "owner" &&
      (ownerCount ?? 0) <= 1
    ) {
      redirect(
        "/app/team?error=" +
          encodeURIComponent("Workspace must keep at least one owner."),
      );
    }

    const { error: updateError } = await serverSupabase
      .from("workspace_memberships")
      .update({
        role: nextRole,
      })
      .eq("id", membershipId)
      .eq("workspace_id", actionWorkspace.workspaceId);

    if (updateError) {
      redirect("/app/team?error=" + encodeURIComponent(updateError.message));
    }

    await logWorkspaceAudit({
      workspaceId: actionWorkspace.workspaceId,
      actorUserId: actionUser.id,
      action: "team.member_role_updated",
      entityType: "workspace_membership",
      entityId: membershipId,
      metadata: {
        nextRole,
      },
    });

    redirect("/app/team?message=" + encodeURIComponent("Member role updated."));
  }

  async function revokeInvite(formData: FormData) {
    "use server";

    const invitationId = toSafeText(formData.get("invitation_id"));
    if (!invitationId) {
      redirect("/app/team?error=" + encodeURIComponent("Invitation id is required."));
    }

    const serverSupabase = await createClient();
    const {
      data: { user: actionUser },
    } = await serverSupabase.auth.getUser();

    if (!actionUser) {
      redirect("/login?next=/app/team");
    }

    const actionWorkspace = await getOrCreatePrimaryWorkspace(
      actionUser,
      serverSupabase,
    );
    const actorRole = await getWorkspaceRole(
      actionWorkspace.workspaceId,
      actionUser.id,
      serverSupabase,
    );

    if (!actorRole || (actorRole !== "owner" && actorRole !== "operator")) {
      redirect(
        "/app/team?error=" +
          encodeURIComponent("Only owner/operator can revoke invitations."),
      );
    }

    const { error: revokeError } = await serverSupabase
      .from("workspace_invitations")
      .update({
        status: "revoked",
        revoked_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", invitationId)
      .eq("workspace_id", actionWorkspace.workspaceId);

    if (revokeError) {
      if (isMissingTableError(revokeError)) {
        redirect(
          "/app/team?error=" +
            encodeURIComponent(
              "Run supabase/migrations/0007_team_and_billing_foundation.sql first.",
            ),
        );
      }
      redirect("/app/team?error=" + encodeURIComponent(revokeError.message));
    }

    await logWorkspaceAudit({
      workspaceId: actionWorkspace.workspaceId,
      actorUserId: actionUser.id,
      action: "team.invite_revoked",
      entityType: "workspace_invitation",
      entityId: invitationId,
    });

    redirect("/app/team?message=" + encodeURIComponent("Invitation revoked."));
  }

  const admin = createAdminClient();

  const { data: members, error: membersError } = await admin
    .from("workspace_memberships")
    .select("id, user_id, role, created_at")
    .eq("workspace_id", workspace.workspaceId)
    .order("created_at", { ascending: true });

  if (membersError) throw membersError;

  const { data: invitations, error: invitationsError } = await admin
    .from("workspace_invitations")
    .select("id, email, role, status, expires_at, created_at")
    .eq("workspace_id", workspace.workspaceId)
    .order("created_at", { ascending: false })
    .limit(100);

  if (invitationsError && !isMissingTableError(invitationsError)) {
    throw invitationsError;
  }

  const teamSchemaMissing = isMissingTableError(invitationsError);
  const memberProfileByUserId = new Map<
    string,
    {
      displayName: string;
      email: string | null;
    }
  >();
  if ((members ?? []).length > 0) {
    const uniqueUserIds = [...new Set((members ?? []).map((member) => member.user_id))];
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
  }

  const pendingInvitations = (invitations ?? []).filter(
    (invite) => invite.status === "pending",
  );

  const memberCount = (members ?? []).length;
  const pendingInviteCount = pendingInvitations.length;

  return (
    <div className="grid gap-3">
      <PageHeader
        title="Team"
        description="Members, invitations, role assignments, and workspace seat controls."
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
      {warning ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          {warning}
        </p>
      ) : null}

      <section className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Members" value={String(memberCount)} detail="Active seats" />
        <StatCard
          label="Pending invites"
          value={String(pendingInviteCount)}
          detail="Awaiting acceptance"
        />
        <StatCard
          label="Seat limit"
          value={String(subscription.seatLimit)}
          detail={`${subscription.planTier} plan`}
        />
        <StatCard
          label="Your role"
          value={workspace.role}
          detail={workspace.workspaceName}
        />
      </section>

      {teamSchemaMissing || subscription.tableMissing ? (
        <SectionCard title="Database migration required">
          <p className="text-sm leading-6 text-slate-600">
            Team and billing tables are not ready. Run
            <code className="mx-1 rounded bg-slate-100 px-1.5 py-0.5 text-xs">
              supabase/migrations/0007_team_and_billing_foundation.sql
            </code>
            and refresh.
          </p>
        </SectionCard>
      ) : (
        <>
          <section className="grid gap-3 xl:grid-cols-[1fr_1.5fr]">
            <SectionCard title="Invite teammate">
              <form action={inviteTeammate} className="grid gap-3">
                <label className="grid gap-1">
                  <span className="text-xs font-medium text-slate-600">Email</span>
                  <input
                    name="email"
                    type="email"
                    required
                    placeholder="operator@company.com"
                    className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                </label>
                <label className="grid gap-1">
                  <span className="text-xs font-medium text-slate-600">Role</span>
                  <select
                    name="role"
                    defaultValue="viewer"
                    className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  >
                    <option value="operator">Operator</option>
                    <option value="viewer">Viewer</option>
                  </select>
                </label>
                <button
                  type="submit"
                  className="inline-flex h-9 items-center justify-center rounded-lg border border-blue-700 bg-blue-600 px-3 text-xs font-semibold text-white hover:bg-blue-700"
                >
                  Send invite
                </button>
              </form>
            </SectionCard>

            <SectionCard title="Current members">
              <div className="overflow-hidden rounded-xl border border-slate-200">
                <table className="w-full border-collapse text-xs">
                  <thead className="bg-slate-50">
                    <tr>
                      {["User", "Role", "Joined", "Action"].map((header) => (
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
                    {(members ?? []).map((member) => (
                      <tr key={member.id}>
                        <td className="border-b border-slate-200 px-3 py-2 text-slate-700">
                          <div className="flex flex-col gap-0.5">
                            <span>{memberProfileByUserId.get(member.user_id)?.displayName}</span>
                            {memberProfileByUserId.get(member.user_id)?.email ? (
                              <span className="text-[10px] text-slate-500">
                                {memberProfileByUserId.get(member.user_id)?.email}
                              </span>
                            ) : null}
                          </div>
                        </td>
                        <td className="border-b border-slate-200 px-3 py-2 text-slate-700">
                          {member.role}
                        </td>
                        <td className="border-b border-slate-200 px-3 py-2 text-slate-500">
                          {new Date(member.created_at).toLocaleDateString()}
                        </td>
                        <td className="border-b border-slate-200 px-3 py-2">
                          {workspace.role === "owner" ? (
                            <form action={updateMemberRole} className="flex items-center gap-2">
                              <input type="hidden" name="membership_id" value={member.id} />
                              <select
                                name="next_role"
                                defaultValue={member.role}
                                className="rounded-md border border-slate-300 px-2 py-1 text-xs"
                              >
                                <option value="owner">Owner</option>
                                <option value="operator">Operator</option>
                                <option value="viewer">Viewer</option>
                              </select>
                              <button
                                type="submit"
                                className="rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-700 hover:bg-slate-50"
                              >
                                Update
                              </button>
                            </form>
                          ) : (
                            <span className="text-slate-400">Owner only</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </SectionCard>
          </section>

          <SectionCard title="Pending invitations">
            {pendingInvitations.length === 0 ? (
              <p className="text-sm text-slate-500">No invitations yet.</p>
            ) : (
              <div className="overflow-hidden rounded-xl border border-slate-200">
                <table className="w-full border-collapse text-xs">
                  <thead className="bg-slate-50">
                    <tr>
                      {["Email", "Role", "Status", "Expires", "Action"].map((header) => (
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
                    {pendingInvitations.map((invite) => (
                      <tr key={invite.id}>
                        <td className="border-b border-slate-200 px-3 py-2 text-slate-700">
                          {invite.email}
                        </td>
                        <td className="border-b border-slate-200 px-3 py-2 text-slate-700">
                          {invite.role}
                        </td>
                        <td className="border-b border-slate-200 px-3 py-2 text-slate-700">
                          {invite.status}
                        </td>
                        <td className="border-b border-slate-200 px-3 py-2 text-slate-500">
                          {invite.expires_at
                            ? new Date(invite.expires_at).toLocaleDateString()
                            : "-"}
                        </td>
                        <td className="border-b border-slate-200 px-3 py-2">
                          {invite.status === "pending" ? (
                            <form action={revokeInvite}>
                              <input type="hidden" name="invitation_id" value={invite.id} />
                              <button
                                type="submit"
                                className="rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-700 hover:bg-slate-50"
                              >
                                Revoke
                              </button>
                            </form>
                          ) : (
                            <span className="text-slate-400">-</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </SectionCard>
        </>
      )}
    </div>
  );
}
