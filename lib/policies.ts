import { createClient } from "@/lib/supabase/server";
import { isMissingTableError } from "@/lib/single-send";

export interface WorkspacePolicyDefaults {
  recommendedDailyCap: number;
  hardDailyCap: number;
  minIntervalSeconds: number;
  maxIntervalSeconds: number;
  allowRoleBasedRecipients: boolean;
}

export const FALLBACK_POLICY_DEFAULTS: WorkspacePolicyDefaults = {
  recommendedDailyCap: 100,
  hardDailyCap: 200,
  minIntervalSeconds: 120,
  maxIntervalSeconds: 180,
  allowRoleBasedRecipients: true,
};

export async function getWorkspacePolicyDefaults(
  workspaceId: string,
): Promise<WorkspacePolicyDefaults> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("workspace_policies")
    .select(
      "recommended_daily_cap, hard_daily_cap, min_interval_seconds, max_interval_seconds, allow_role_based_recipients",
    )
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  if (error) {
    if (isMissingTableError(error)) return FALLBACK_POLICY_DEFAULTS;
    throw error;
  }

  if (!data) return FALLBACK_POLICY_DEFAULTS;

  return {
    recommendedDailyCap: data.recommended_daily_cap,
    hardDailyCap: data.hard_daily_cap,
    minIntervalSeconds: data.min_interval_seconds,
    maxIntervalSeconds: data.max_interval_seconds,
    allowRoleBasedRecipients: data.allow_role_based_recipients,
  };
}
