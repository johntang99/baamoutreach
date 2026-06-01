import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { isMissingTableError } from "@/lib/single-send";

export type PlanTier = "starter" | "growth" | "scale";

export interface PlanEntitlements {
  seatLimit: number;
  campaignDailyLimit: number;
  hardCapLimit: number;
}

export const PLAN_ENTITLEMENTS: Record<PlanTier, PlanEntitlements> = {
  starter: {
    seatLimit: 3,
    campaignDailyLimit: 100,
    hardCapLimit: 200,
  },
  growth: {
    seatLimit: 8,
    campaignDailyLimit: 250,
    hardCapLimit: 500,
  },
  scale: {
    seatLimit: 25,
    campaignDailyLimit: 1000,
    hardCapLimit: 2000,
  },
};

export interface WorkspaceSubscriptionState extends PlanEntitlements {
  planTier: PlanTier;
  status: "trialing" | "active" | "past_due" | "canceled";
  currentPeriodEnd: string | null;
  tableMissing: boolean;
}

export function isPlanTier(value: string): value is PlanTier {
  return value === "starter" || value === "growth" || value === "scale";
}

export async function getWorkspaceSubscription(
  workspaceId: string,
  existingClient?: SupabaseClient,
): Promise<WorkspaceSubscriptionState> {
  const supabase = existingClient ?? (await createClient());
  const { data, error } = await supabase
    .from("workspace_subscriptions")
    .select(
      "plan_tier, status, seat_limit, campaign_daily_limit, hard_cap_limit, current_period_end",
    )
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  if (error) {
    if (isMissingTableError(error)) {
      return {
        planTier: "starter",
        status: "active",
        ...PLAN_ENTITLEMENTS.starter,
        currentPeriodEnd: null,
        tableMissing: true,
      };
    }
    throw error;
  }

  if (!data) {
    return {
      planTier: "starter",
      status: "active",
      ...PLAN_ENTITLEMENTS.starter,
      currentPeriodEnd: null,
      tableMissing: false,
    };
  }

  const planTier = isPlanTier(data.plan_tier) ? data.plan_tier : "starter";
  return {
    planTier,
    status: data.status,
    seatLimit: data.seat_limit,
    campaignDailyLimit: data.campaign_daily_limit,
    hardCapLimit: data.hard_cap_limit,
    currentPeriodEnd: data.current_period_end,
    tableMissing: false,
  };
}
