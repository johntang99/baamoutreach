import type { SupabaseClient, User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isMissingTableError } from "@/lib/single-send";

export interface WorkspaceContext {
  workspaceId: string;
  workspaceName: string;
  role: "owner" | "operator" | "viewer";
}

function toWorkspaceName(user: User) {
  const fullName = user.user_metadata?.full_name as string | undefined;
  if (fullName && fullName.trim().length > 0) {
    return `${fullName.trim()}'s Workspace`;
  }

  const emailPrefix = user.email?.split("@")[0];
  if (emailPrefix && emailPrefix.trim().length > 0) {
    return `${emailPrefix.trim()}'s Workspace`;
  }

  return "My Workspace";
}

export async function getOrCreatePrimaryWorkspace(
  user: User,
  existingClient?: SupabaseClient,
): Promise<WorkspaceContext> {
  const supabase = existingClient ?? (await createClient());
  const admin = createAdminClient();
  const userEmail = user.email?.trim().toLowerCase();

  const { data: membership, error: membershipError } = await supabase
    .from("workspace_memberships")
    .select(
      `
        role,
        workspace:workspaces (
          id,
          name
        )
      `,
    )
    .eq("user_id", user.id)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (membershipError) {
    throw membershipError;
  }

  const workspaceRecord = Array.isArray(membership?.workspace)
    ? membership.workspace[0]
    : membership?.workspace;

  const membershipRole = membership?.role as WorkspaceContext["role"] | undefined;

  let acceptedInviteContext: WorkspaceContext | null = null;
  if (userEmail) {
    const { data: invite, error: inviteError } = await admin
      .from("workspace_invitations")
      .select(
        `
          id,
          workspace_id,
          role,
          expires_at,
          workspace:workspaces (
            id,
            name
          )
        `,
      )
      .eq("email", userEmail)
      .eq("status", "pending")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (inviteError && !isMissingTableError(inviteError)) {
      throw inviteError;
    }

    if (invite) {
      const isExpired =
        Boolean(invite.expires_at) &&
        new Date(String(invite.expires_at)).getTime() < Date.now();

      if (isExpired) {
        await admin
          .from("workspace_invitations")
          .update({
            status: "expired",
            updated_at: new Date().toISOString(),
          })
          .eq("id", invite.id);
      } else {
        await admin.from("workspace_memberships").upsert(
          {
            workspace_id: invite.workspace_id,
            user_id: user.id,
            role: invite.role,
          },
          {
            onConflict: "workspace_id,user_id",
          },
        );

        await admin
          .from("workspace_invitations")
          .update({
            status: "accepted",
            accepted_by_user_id: user.id,
            accepted_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("id", invite.id);

        const inviteWorkspace = Array.isArray(invite.workspace)
          ? invite.workspace[0]
          : invite.workspace;

        acceptedInviteContext = {
          workspaceId: invite.workspace_id,
          workspaceName: (inviteWorkspace?.name as string) ?? "Workspace",
          role: invite.role as WorkspaceContext["role"],
        };
      }
    }
  }

  if (workspaceRecord?.id) {
    return {
      workspaceId: workspaceRecord.id as string,
      workspaceName: (workspaceRecord.name as string) ?? "Workspace",
      role: membershipRole ?? "viewer",
    };
  }

  if (acceptedInviteContext) {
    return acceptedInviteContext;
  }

  const { data: adminMembership, error: adminMembershipError } = await admin
    .from("workspace_memberships")
    .select(
      `
        role,
        workspace:workspaces (
          id,
          name
        )
      `,
    )
    .eq("user_id", user.id)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (adminMembershipError) {
    throw adminMembershipError;
  }

  const adminWorkspaceRecord = Array.isArray(adminMembership?.workspace)
    ? adminMembership.workspace[0]
    : adminMembership?.workspace;

  if (adminWorkspaceRecord?.id) {
    return {
      workspaceId: adminWorkspaceRecord.id as string,
      workspaceName: (adminWorkspaceRecord.name as string) ?? "Workspace",
      role:
        (adminMembership?.role as WorkspaceContext["role"] | undefined) ?? "viewer",
    };
  }

  const workspaceName = toWorkspaceName(user);
  const workspaceId = crypto.randomUUID();
  const { error: workspaceError } = await admin
    .from("workspaces")
    .insert({
      id: workspaceId,
      name: workspaceName,
      created_by: user.id,
    });

  if (workspaceError) {
    throw workspaceError ?? new Error("Could not create workspace");
  }

  const { error: membershipInsertError } = await admin
    .from("workspace_memberships")
    .insert({
      workspace_id: workspaceId,
      user_id: user.id,
      role: "owner",
    });

  if (membershipInsertError) {
    throw membershipInsertError;
  }

  return {
    workspaceId,
    workspaceName,
    role: "owner",
  };
}
