import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

export type WorkspaceRole = "owner" | "operator" | "viewer";

export async function getWorkspaceRole(
  workspaceId: string,
  userId: string,
  existingClient?: SupabaseClient,
): Promise<WorkspaceRole | null> {
  const supabase = existingClient ?? (await createClient());
  const { data, error } = await supabase
    .from("workspace_memberships")
    .select("role")
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return (data?.role as WorkspaceRole | undefined) ?? null;
}
