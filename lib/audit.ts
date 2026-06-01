import { isMissingTableError } from "@/lib/single-send";
import { createClient } from "@/lib/supabase/server";

interface AuditInput {
  workspaceId: string;
  actorUserId: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  metadata?: Record<string, unknown>;
}

export async function logWorkspaceAudit(input: AuditInput) {
  const supabase = await createClient();
  const { error } = await supabase.from("workspace_audit_logs").insert({
    workspace_id: input.workspaceId,
    actor_user_id: input.actorUserId,
    action: input.action,
    entity_type: input.entityType,
    entity_id: input.entityId ?? null,
    metadata: input.metadata ?? {},
  });

  if (!error) return;
  if (isMissingTableError(error)) return;
  // Do not throw from audit logger; avoid blocking primary workflow.
}
