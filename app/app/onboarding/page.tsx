import Link from "next/link";
import { redirect } from "next/navigation";
import { BulletList, PageHeader, SectionCard } from "@/components/product/page-primitives";
import { createClient } from "@/lib/supabase/server";
import { getOrCreatePrimaryWorkspace } from "@/lib/workspaces";
import { isMissingTableError } from "@/lib/single-send";

function clampPct(value: number) {
  return Math.max(0, Math.min(100, value));
}

type OnboardingStep = {
  label: string;
  done: boolean;
  pendingNote: string;
  doneNote: string;
  resumePath: string;
};

export default async function OnboardingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?next=/app/onboarding");
  }

  const workspace = await getOrCreatePrimaryWorkspace(user, supabase);

  const [
    senderSettingsResult,
    policyResult,
    contactsCountResult,
    templatesResult,
    suppressionCountResult,
    listStatsResult,
    sendRequestCountResult,
    campaignActivityCountResult,
  ] = await Promise.all([
    supabase
      .from("workspace_sender_settings")
      .select("gmail_preset_email, reply_to_email")
      .eq("workspace_id", workspace.workspaceId)
      .order("created_at", { ascending: false })
      .limit(20),
    supabase
      .from("workspace_policies")
      .select(
        "recommended_daily_cap, hard_daily_cap, min_interval_seconds, max_interval_seconds, allow_role_based_recipients",
      )
      .eq("workspace_id", workspace.workspaceId)
      .maybeSingle(),
    supabase
      .from("contacts")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", workspace.workspaceId)
      .eq("status", "active"),
    supabase
      .from("templates")
      .select("id, campaign_type")
      .eq("workspace_id", workspace.workspaceId)
      .eq("is_active", true),
    supabase
      .from("suppression_entries")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", workspace.workspaceId),
    supabase
      .from("audience_lists")
      .select("valid_row_count, ready_row_count")
      .eq("workspace_id", workspace.workspaceId),
    supabase
      .from("send_requests")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", workspace.workspaceId),
    supabase
      .from("campaign_recipients")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", workspace.workspaceId)
      .in("status", ["opened_gmail", "sent"]),
  ]);

  const safeTableError = [
    senderSettingsResult.error,
    policyResult.error,
    contactsCountResult.error,
    templatesResult.error,
    suppressionCountResult.error,
    listStatsResult.error,
    sendRequestCountResult.error,
    campaignActivityCountResult.error,
  ].find((error) => error && !isMissingTableError(error));
  if (safeTableError) {
    throw safeTableError;
  }

  const senderSettings = !senderSettingsResult.error
    ? (senderSettingsResult.data ?? [])
    : [];
  const configuredSender = senderSettings.find(
    (sender) =>
      Boolean(
        sender.gmail_preset_email?.trim() ||
          sender.reply_to_email?.trim(),
      ),
  );
  const policy = !policyResult.error ? policyResult.data : null;
  const contactsCount = contactsCountResult.count ?? 0;
  const templates = templatesResult.data ?? [];
  const suppressionCount = suppressionCountResult.count ?? 0;
  const sendRequestCount = sendRequestCountResult.count ?? 0;
  const campaignActivityCount = campaignActivityCountResult.count ?? 0;
  const listStats = listStatsResult.data ?? [];
  const totalValidRows = listStats.reduce((sum, row) => sum + (row.valid_row_count ?? 0), 0);
  const totalReadyRows = listStats.reduce((sum, row) => sum + (row.ready_row_count ?? 0), 0);
  const listCoverageCount = Math.max(contactsCount, totalValidRows);
  const listQualityPct =
    totalValidRows > 0 ? clampPct(Math.round((totalReadyRows / totalValidRows) * 100)) : 0;
  const templateTypesConfigured = new Set(
    templates.map((template) => template.campaign_type?.trim()).filter(Boolean),
  ).size;

  const onboardingSteps: OnboardingStep[] = [
    {
      label: "Workspace profile complete",
      done: workspace.workspaceName.trim().length > 0,
      pendingNote: "Set workspace identity and policy defaults.",
      doneNote: `Workspace: ${workspace.workspaceName}`,
      resumePath: "/app/settings/workspace",
    },
    {
      label: "Sender mailbox verified",
      done: Boolean(configuredSender),
      pendingNote: "Configure sender mailbox in Sender Settings.",
      doneNote:
        configuredSender?.gmail_preset_email?.trim() ??
        configuredSender?.reply_to_email?.trim() ??
        "Mailbox configured",
      resumePath: "/app/settings/sender",
    },
    {
      label: "Contacts imported",
      done: listCoverageCount > 0,
      pendingNote: "Add contacts or upload a list.",
      doneNote: `${listCoverageCount} contact/list rows available`,
      resumePath: contactsCount > 0 ? "/app/lists" : "/app/contacts",
    },
    {
      label: "First template approved",
      done: templates.length > 0,
      pendingNote: "Create an active outreach template.",
      doneNote: `${templates.length} active template${templates.length === 1 ? "" : "s"}`,
      resumePath: "/app/templates",
    },
  ];
  const nextStep = onboardingSteps.find((step) => !step.done);
  const resumePath = nextStep?.resumePath ?? "/app/send/single";

  const launchChecklistItems = [
    `Campaign types configured: ${
      templateTypesConfigured > 0
        ? `${templateTypesConfigured} type${templateTypesConfigured === 1 ? "" : "s"}`
        : "pending"
    }.`,
    `Suppression seed imported: ${
      suppressionCount > 0 ? `${suppressionCount} entries` : "pending"
    }.`,
    `Safety policy acknowledged and saved: ${policy ? "done" : "pending"}.`,
    `Send test completed: ${
      sendRequestCount > 0 || campaignActivityCount > 0 ? "done" : "pending"
    }.`,
  ];

  const templateHealthPct = clampPct(
    templates.length === 0 ? 0 : 45 + Math.min(templates.length, 3) * 18,
  );
  const pacingPolicyPct = clampPct(policy ? 100 : 40);
  const firstSendPct = clampPct(
    sendRequestCount > 0 || campaignActivityCount > 0 ? 100 : 25,
  );
  const qualityGateItems = [
    "Auth setup: 100%",
    `Template health: ${templateHealthPct}%`,
    `List quality: ${listQualityPct}%`,
    `Pacing policy: ${pacingPolicyPct}%`,
    `First send readiness: ${firstSendPct}%`,
  ];

  return (
    <div className="grid gap-3">
      <PageHeader
        title="Onboarding"
        description="Non-linear checklist that gets a new workspace from signup to first successful send."
        actions={
          <>
            <Link
              href="/app/docs"
              className="inline-flex h-9 items-center rounded-lg border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              View setup guide
            </Link>
            <Link
              href={resumePath}
              className="inline-flex h-9 items-center rounded-lg border border-blue-700 bg-blue-600 px-3 text-xs font-semibold text-white hover:bg-blue-700"
            >
              Resume setup
            </Link>
          </>
        }
      />

      <section className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        {onboardingSteps.map((step, index) => (
          <article
            key={step.label}
            className={`rounded-xl border p-3 ${
              step.done
                ? "border-emerald-200 bg-emerald-50"
                : "border-slate-200 bg-slate-50"
            }`}
          >
            <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500">
              Step {index + 1}
            </p>
            <p className="mt-1 text-sm font-semibold text-slate-900">{step.label}</p>
            <p className="mt-1 text-xs text-slate-600">
              {step.done ? step.doneNote : step.pendingNote}
            </p>
            <p
              className={`mt-1 text-[11px] font-semibold ${
                step.done ? "text-emerald-700" : "text-amber-700"
              }`}
            >
              {step.done ? "Done" : "Pending"}
            </p>
          </article>
        ))}
      </section>

      <section className="grid gap-3 xl:grid-cols-[1.4fr_1fr]">
        <SectionCard title="Launch checklist">
          <BulletList items={launchChecklistItems} />
        </SectionCard>
        <SectionCard title="Quality gates">
          <BulletList items={qualityGateItems} />
        </SectionCard>
      </section>
    </div>
  );
}
