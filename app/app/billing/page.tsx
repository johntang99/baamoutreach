import {
  PageHeader,
  SectionCard,
  StatCard,
} from "@/components/product/page-primitives";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getOrCreatePrimaryWorkspace } from "@/lib/workspaces";
import {
  isPlanTier,
  PLAN_ENTITLEMENTS,
  type PlanTier,
  getWorkspaceSubscription,
} from "@/lib/billing";
import { toSafeText } from "@/lib/single-send";
import { logWorkspaceAudit } from "@/lib/audit";

export default async function BillingPage({
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
    redirect("/login?next=/app/billing");
  }

  const workspace = await getOrCreatePrimaryWorkspace(user, supabase);
  const subscription = await getWorkspaceSubscription(workspace.workspaceId, supabase);

  async function updatePlan(formData: FormData) {
    "use server";

    const planTierRaw = toSafeText(formData.get("plan_tier"), "starter");
    if (!isPlanTier(planTierRaw)) {
      redirect("/app/billing?error=" + encodeURIComponent("Invalid plan tier."));
    }

    const serverSupabase = await createClient();
    const {
      data: { user: actionUser },
    } = await serverSupabase.auth.getUser();

    if (!actionUser) {
      redirect("/login?next=/app/billing");
    }

    const actionWorkspace = await getOrCreatePrimaryWorkspace(
      actionUser,
      serverSupabase,
    );

    const { data: actorMembership } = await serverSupabase
      .from("workspace_memberships")
      .select("role")
      .eq("workspace_id", actionWorkspace.workspaceId)
      .eq("user_id", actionUser.id)
      .maybeSingle();

    if (!actorMembership || actorMembership.role !== "owner") {
      redirect(
        "/app/billing?error=" + encodeURIComponent("Only owner can manage billing."),
      );
    }

    const entitlements = PLAN_ENTITLEMENTS[planTierRaw];
    const { error } = await serverSupabase.from("workspace_subscriptions").upsert(
      {
        workspace_id: actionWorkspace.workspaceId,
        plan_tier: planTierRaw,
        status: "active",
        seat_limit: entitlements.seatLimit,
        campaign_daily_limit: entitlements.campaignDailyLimit,
        hard_cap_limit: entitlements.hardCapLimit,
        created_by: actionUser.id,
        updated_by: actionUser.id,
        updated_at: new Date().toISOString(),
      },
      {
        onConflict: "workspace_id",
      },
    );

    if (error) {
      redirect("/app/billing?error=" + encodeURIComponent(error.message));
    }

    await logWorkspaceAudit({
      workspaceId: actionWorkspace.workspaceId,
      actorUserId: actionUser.id,
      action: "billing.plan_updated",
      entityType: "workspace_subscription",
      entityId: actionWorkspace.workspaceId,
      metadata: {
        planTier: planTierRaw,
        seatLimit: entitlements.seatLimit,
        campaignDailyLimit: entitlements.campaignDailyLimit,
        hardCapLimit: entitlements.hardCapLimit,
      },
    });

    redirect("/app/billing?message=" + encodeURIComponent("Plan updated."));
  }

  const planRows: Array<{
    tier: PlanTier;
    label: string;
    description: string;
  }> = [
    {
      tier: "starter",
      label: "Starter",
      description: "Small teams with controlled outreach volume.",
    },
    {
      tier: "growth",
      label: "Growth",
      description: "Growing outreach teams with higher daily capacity.",
    },
    {
      tier: "scale",
      label: "Scale",
      description: "Large operations with higher throughput and seats.",
    },
  ];

  return (
    <div className="grid gap-3">
      <PageHeader
        title="Billing"
        description="Plans, entitlements, and subscription controls used for workspace enforcement."
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

      {subscription.tableMissing ? (
        <SectionCard title="Database migration required">
          <p className="text-sm leading-6 text-slate-600">
            Billing tables are not ready. Run
            <code className="mx-1 rounded bg-slate-100 px-1.5 py-0.5 text-xs">
              supabase/migrations/0007_team_and_billing_foundation.sql
            </code>
            and refresh.
          </p>
        </SectionCard>
      ) : (
        <>
          <section className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="Current plan"
              value={subscription.planTier}
              detail={`Status: ${subscription.status}`}
            />
            <StatCard
              label="Seat limit"
              value={String(subscription.seatLimit)}
              detail="Members + pending invites"
            />
            <StatCard
              label="Daily campaign cap"
              value={String(subscription.campaignDailyLimit)}
              detail="Maximum daily_cap per campaign"
            />
            <StatCard
              label="Hard cap"
              value={String(subscription.hardCapLimit)}
              detail="Maximum hard_cap per campaign"
            />
          </section>

          <SectionCard title="Plan management">
            <div className="grid gap-3 md:grid-cols-3">
              {planRows.map((plan) => {
                const ent = PLAN_ENTITLEMENTS[plan.tier];
                const active = subscription.planTier === plan.tier;

                return (
                  <form
                    key={plan.tier}
                    action={updatePlan}
                    className="rounded-xl border border-slate-200 bg-slate-50 p-3"
                  >
                    <input type="hidden" name="plan_tier" value={plan.tier} />
                    <p className="text-sm font-semibold text-slate-900">{plan.label}</p>
                    <p className="mt-1 text-xs leading-5 text-slate-600">
                      {plan.description}
                    </p>
                    <ul className="mt-2 space-y-1 text-xs text-slate-600">
                      <li>Seats: {ent.seatLimit}</li>
                      <li>Daily campaign cap: {ent.campaignDailyLimit}</li>
                      <li>Hard cap: {ent.hardCapLimit}</li>
                    </ul>
                    <button
                      type="submit"
                      disabled={active || workspace.role !== "owner"}
                      className="mt-3 inline-flex h-8 items-center justify-center rounded-lg border border-blue-700 bg-blue-600 px-3 text-[11px] font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {active ? "Current plan" : "Switch to this plan"}
                    </button>
                  </form>
                );
              })}
            </div>
            {workspace.role !== "owner" ? (
              <p className="mt-3 text-xs text-slate-500">
                Only workspace owner can change billing plan.
              </p>
            ) : null}
          </SectionCard>
        </>
      )}
    </div>
  );
}
