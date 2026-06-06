import Link from "next/link";
import { redirect } from "next/navigation";
import { CampaignDetailActions } from "@/components/campaigns/campaign-detail-actions";
import { CampaignRecipientTable } from "@/components/campaigns/campaign-recipient-table";
import { CampaignSetupForm } from "@/components/campaigns/campaign-setup-form";
import { PageHeader, SectionCard } from "@/components/product/page-primitives";
import { logWorkspaceAudit } from "@/lib/audit";
import { getWorkspaceSubscription } from "@/lib/billing";
import {
  buildRenderedSend,
  campaignRecipientRisk,
  normalizeIntervalRange,
  scheduledAtForIndex,
} from "@/lib/campaigns";
import { parseTemplateVariantRows } from "@/lib/template-variant-sets";
import { getWorkspacePolicyDefaults } from "@/lib/policies";
import { isMissingTableError, toSafeText } from "@/lib/single-send";
import { createClient } from "@/lib/supabase/server";
import { getOrCreatePrimaryWorkspace } from "@/lib/workspaces";

export default async function CampaignsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const errorMessage =
    typeof params.error === "string" ? decodeURIComponent(params.error) : null;
  const message =
    typeof params.message === "string" ? decodeURIComponent(params.message) : null;
  const preselectedListId = typeof params.listId === "string" ? params.listId : "";
  const activeCampaignIdParam =
    typeof params.campaignId === "string" ? params.campaignId : "";
  const isNewCampaignMode = params.new === "1";
  const preselectedIncludeRoleParam =
    typeof params.includeRole === "string" ? params.includeRole : "";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?next=/app/campaigns");
  }

  const workspace = await getOrCreatePrimaryWorkspace(user, supabase);

  async function createCampaign(formData: FormData) {
    "use server";

    const name = toSafeText(formData.get("name"));
    const templateId = toSafeText(formData.get("template_id"));
    const templateVariantSetId = toSafeText(formData.get("template_variant_set_id"));
    const sourceListId = toSafeText(formData.get("source_list_id"));
    const includeRoleEmails = String(formData.get("include_role_emails")) === "on";
    const dailyCapInput = Number(formData.get("daily_cap") ?? NaN);
    const hardCapInput = Number(formData.get("hard_cap") ?? NaN);
    const minIntervalInputRaw = Number(formData.get("min_interval_seconds") ?? NaN);
    const maxIntervalInputRaw = Number(formData.get("max_interval_seconds") ?? NaN);

    if (!name || !templateId || !sourceListId) {
      redirect(
        "/app/campaigns?error=" +
          encodeURIComponent(
            "Campaign name, template, and one recipient list are required.",
          ),
      );
    }

    const serverSupabase = await createClient();
    const {
      data: { user: actionUser },
    } = await serverSupabase.auth.getUser();

    if (!actionUser) {
      redirect("/login?next=/app/campaigns");
    }

    const actionWorkspace = await getOrCreatePrimaryWorkspace(
      actionUser,
      serverSupabase,
    );
    const subscription = await getWorkspaceSubscription(
      actionWorkspace.workspaceId,
      serverSupabase,
    );

    if (subscription.tableMissing) {
      redirect(
        "/app/campaigns?error=" +
          encodeURIComponent(
            "Run supabase/migrations/0007_team_and_billing_foundation.sql first.",
          ),
      );
    }

    const policyDefaults = await getWorkspacePolicyDefaults(
      actionWorkspace.workspaceId,
    );

    const dailyCap = Number.isFinite(dailyCapInput)
      ? Math.max(1, dailyCapInput)
      : policyDefaults.recommendedDailyCap;
    const hardCap = Number.isFinite(hardCapInput)
      ? Math.max(1, hardCapInput)
      : policyDefaults.hardDailyCap;
    const interval = normalizeIntervalRange(
      Number.isFinite(minIntervalInputRaw)
        ? minIntervalInputRaw
        : policyDefaults.minIntervalSeconds,
      Number.isFinite(maxIntervalInputRaw)
        ? maxIntervalInputRaw
        : policyDefaults.maxIntervalSeconds,
    );

    if (dailyCap > subscription.campaignDailyLimit) {
      redirect(
        "/app/campaigns?error=" +
          encodeURIComponent(
            `Plan ${subscription.planTier} allows daily cap up to ${subscription.campaignDailyLimit}.`,
          ),
      );
    }

    if (hardCap > subscription.hardCapLimit) {
      redirect(
        "/app/campaigns?error=" +
          encodeURIComponent(
            `Plan ${subscription.planTier} allows hard cap up to ${subscription.hardCapLimit}.`,
          ),
      );
    }

    const { data: membership } = await serverSupabase
      .from("workspace_memberships")
      .select("role")
      .eq("workspace_id", actionWorkspace.workspaceId)
      .eq("user_id", actionUser.id)
      .maybeSingle();

    if (!membership || membership.role === "viewer") {
      redirect(
        "/app/campaigns?error=" +
          encodeURIComponent("Viewer role cannot create campaigns."),
      );
    }

    const { data: template, error: templateError } = await serverSupabase
      .from("templates")
      .select("id, name, subject_template, body_template")
      .eq("id", templateId)
      .eq("workspace_id", actionWorkspace.workspaceId)
      .eq("is_active", true)
      .maybeSingle();

    if (templateError || !template) {
      redirect(
        "/app/campaigns?error=" +
          encodeURIComponent(templateError?.message ?? "Template not found."),
      );
    }

    const { data: selectedList, error: selectedListError } = await serverSupabase
      .from("audience_lists")
      .select("id, name, default_language")
      .eq("id", sourceListId)
      .eq("workspace_id", actionWorkspace.workspaceId)
      .eq("status", "ready")
      .maybeSingle();

    if (selectedListError) {
      if (isMissingTableError(selectedListError)) {
        redirect(
          "/app/campaigns?error=" +
            encodeURIComponent("Run supabase/migrations/0008_lists_mvp.sql first."),
        );
      }
      redirect(
        "/app/campaigns?error=" + encodeURIComponent(selectedListError.message),
      );
    }

    if (!selectedList) {
      redirect(
        "/app/campaigns?error=" +
          encodeURIComponent("Selected list not found or not ready."),
      );
    }

    const sourceList = {
      id: selectedList.id,
      name: selectedList.name,
      defaultLanguage: selectedList.default_language,
    };

    let selectedVariantSet:
      | {
          id: string;
          name: string;
          language: string;
          variants: Array<{
            subject: string;
            body: string;
            tone: string;
            edited_at?: string | null;
          }>;
        }
      | null = null;

    if (templateVariantSetId) {
      const { data: variantSet, error: variantSetError } = await serverSupabase
        .from("template_variant_sets")
        .select("id, name, language, variants, template_id")
        .eq("workspace_id", actionWorkspace.workspaceId)
        .eq("id", templateVariantSetId)
        .maybeSingle();

      if (variantSetError || !variantSet) {
        redirect(
          "/app/campaigns?error=" +
            encodeURIComponent(variantSetError?.message ?? "Variant set not found."),
        );
      }
      if (variantSet.template_id !== template.id) {
        redirect(
          "/app/campaigns?error=" +
            encodeURIComponent("Selected variant set does not belong to the selected template."),
        );
      }

      selectedVariantSet = {
        id: variantSet.id,
        name: variantSet.name,
        language: variantSet.language,
        variants: parseTemplateVariantRows(variantSet.variants),
      };
      if (selectedVariantSet.variants.length === 0) {
        redirect(
          "/app/campaigns?error=" +
            encodeURIComponent("Selected variant set has no valid variants."),
        );
      }
    }

    const { data: listEntries, error: listEntriesError } = await serverSupabase
      .from("audience_list_entries")
      .select("id, contact_id, full_name, email, company_name, language, is_suppressed")
      .eq("workspace_id", actionWorkspace.workspaceId)
      .eq("list_id", selectedList.id)
      .order("created_at", { ascending: true })
      .limit(Math.min(hardCap * 3, 5000));

    if (listEntriesError) {
      redirect("/app/campaigns?error=" + encodeURIComponent(listEntriesError.message));
    }

    const sourceRecipients = (listEntries ?? []).map((entry) => ({
      sourceId: entry.id,
      contactId: entry.contact_id,
      fullName: entry.full_name,
      email: entry.email,
      companyName: entry.company_name,
      language: entry.language,
      preSuppressed: entry.is_suppressed,
    }));

    if (sourceRecipients.length === 0) {
      redirect(
        "/app/campaigns?error=" +
          encodeURIComponent("Selected list has no recipients to prepare."),
      );
    }

    const { data: suppressionRows, error: suppressionError } = await serverSupabase
      .from("suppression_entries")
      .select("email")
      .eq("workspace_id", actionWorkspace.workspaceId);

    if (suppressionError) {
      redirect("/app/campaigns?error=" + encodeURIComponent(suppressionError.message));
    }

    const suppressionSet = new Set(
      (suppressionRows ?? []).map((row) => row.email.toLowerCase()),
    );

    const { data: campaign, error: campaignError } = await serverSupabase
      .from("campaigns")
      .insert({
        workspace_id: actionWorkspace.workspaceId,
        name,
        source_list_id: sourceList.id,
        template_id: template.id,
        template_variant_set_id: selectedVariantSet?.id ?? null,
        status: "draft",
        daily_cap: dailyCap,
        hard_cap: hardCap,
        min_interval_seconds: interval.min,
        max_interval_seconds: interval.max,
        created_by: actionUser.id,
      })
      .select("id")
      .single();

    if (campaignError || !campaign) {
      redirect(
        "/app/campaigns?error=" +
          encodeURIComponent(campaignError?.message ?? "Could not create campaign."),
      );
    }

    const recipients = [];
    const now = new Date();
    let queuedIndex = 0;
    let queuedCount = 0;
    let skippedCount = 0;
    let totalContacts = 0;
    let variantAppliedCount = 0;

    const variantAssignment = new Map<number, number>();
    const activeVariants = selectedVariantSet?.variants ?? [];
    const variantLanguage = selectedVariantSet?.language ?? sourceList.defaultLanguage;

    if (activeVariants.length > 0) {
      const eligibleIndices: number[] = [];
      sourceRecipients.forEach((recipient, index) => {
        if (recipient.language === variantLanguage) {
          eligibleIndices.push(index);
        }
      });
      eligibleIndices.forEach((recipientIndex, slot) => {
        variantAssignment.set(recipientIndex, slot % activeVariants.length);
      });
    }

    for (const [recipientIndex, recipient] of sourceRecipients.entries()) {
      if (totalContacts >= hardCap) break;
      totalContacts += 1;

      const email = recipient.email.toLowerCase();
      const variantIndex = variantAssignment.get(recipientIndex);
      const subjectTemplate =
        variantIndex !== undefined
          ? activeVariants[variantIndex]?.subject ?? template.subject_template
          : template.subject_template;
      const bodyTemplate =
        variantIndex !== undefined
          ? activeVariants[variantIndex]?.body ?? template.body_template
          : template.body_template;
      const rendered = buildRenderedSend({
        email,
        fullName: recipient.fullName,
        companyName: recipient.companyName,
        subjectTemplate,
        bodyTemplate,
      });

      if (!rendered.subject || !rendered.body) {
        skippedCount += 1;
        recipients.push({
          workspace_id: actionWorkspace.workspaceId,
          campaign_id: campaign.id,
          contact_id: recipient.contactId,
          full_name: recipient.fullName,
          email,
          company_name: recipient.companyName,
          status: "failed",
          risk_level: "high",
          risk_notes: ["Template render produced empty subject or body."],
          subject: rendered.subject || "(empty)",
          body: rendered.body || "(empty)",
          gmail_compose_url: rendered.gmailComposeUrl,
          scheduled_at: null,
          variant_index: variantIndex ?? null,
        });
        continue;
      }

      if (recipient.preSuppressed || suppressionSet.has(email)) {
        skippedCount += 1;
        recipients.push({
          workspace_id: actionWorkspace.workspaceId,
          campaign_id: campaign.id,
          contact_id: recipient.contactId,
          full_name: recipient.fullName,
          email,
          company_name: recipient.companyName,
          status: "skipped_suppressed",
          risk_level: "high",
          risk_notes: ["Recipient is in suppression list."],
          subject: rendered.subject,
          body: rendered.body,
          gmail_compose_url: rendered.gmailComposeUrl,
          scheduled_at: null,
          variant_index: variantIndex ?? null,
        });
        continue;
      }

      const risk = campaignRecipientRisk(email, includeRoleEmails);
      if (!risk.shouldQueue) {
        skippedCount += 1;
        recipients.push({
          workspace_id: actionWorkspace.workspaceId,
          campaign_id: campaign.id,
          contact_id: recipient.contactId,
          full_name: recipient.fullName,
          email,
          company_name: recipient.companyName,
          status: risk.status,
          risk_level: risk.riskLevel,
          risk_notes: risk.riskNotes,
          subject: rendered.subject,
          body: rendered.body,
          gmail_compose_url: rendered.gmailComposeUrl,
          scheduled_at: null,
          variant_index: variantIndex ?? null,
        });
        continue;
      }

      const scheduledAt = scheduledAtForIndex(
        queuedIndex,
        now,
        interval.min,
        interval.max,
      );
      queuedIndex += 1;
      queuedCount += 1;
      if (variantIndex !== undefined) {
        variantAppliedCount += 1;
      }

      recipients.push({
        workspace_id: actionWorkspace.workspaceId,
        campaign_id: campaign.id,
        contact_id: recipient.contactId,
        full_name: recipient.fullName,
        email,
        company_name: recipient.companyName,
        status: "queued",
        risk_level: risk.riskLevel,
        risk_notes: risk.riskNotes,
        subject: rendered.subject,
        body: rendered.body,
        gmail_compose_url: rendered.gmailComposeUrl,
        scheduled_at: scheduledAt,
        variant_index: variantIndex ?? null,
      });
    }

    const { error: recipientsError } = await serverSupabase
      .from("campaign_recipients")
      .insert(recipients);

    if (recipientsError) {
      redirect("/app/campaigns?error=" + encodeURIComponent(recipientsError.message));
    }

    const nextStatus = queuedCount > 0 ? "ready" : "completed";
    await serverSupabase
      .from("campaigns")
      .update({
        status: nextStatus,
        total_contacts: totalContacts,
        queued_count: queuedCount,
        skipped_count: skippedCount,
      })
      .eq("id", campaign.id);

    await serverSupabase.from("campaign_events").insert({
      workspace_id: actionWorkspace.workspaceId,
      campaign_id: campaign.id,
      event_type: "campaign_prepared",
      event_payload: {
        total_contacts: totalContacts,
        queued_count: queuedCount,
        skipped_count: skippedCount,
        include_role_emails: includeRoleEmails,
        source_list_id: sourceList.id,
        variant_applied_count: variantAppliedCount,
        template_variant_set_id: selectedVariantSet?.id ?? null,
      },
      created_by: actionUser.id,
    });

    await logWorkspaceAudit({
      workspaceId: actionWorkspace.workspaceId,
      actorUserId: actionUser.id,
      action: "campaign.prepared",
      entityType: "campaign",
      entityId: campaign.id,
      metadata: {
        totalContacts,
        queuedCount,
        skippedCount,
        includeRoleEmails,
        dailyCap,
        hardCap,
        minIntervalSeconds: interval.min,
        maxIntervalSeconds: interval.max,
        sourceListId: sourceList.id,
        sourceListName: sourceList.name,
        variantAppliedCount,
        templateVariantSetId: selectedVariantSet?.id ?? null,
        templateVariantSetName: selectedVariantSet?.name ?? null,
      },
    });

    redirect(
      `/app/campaigns?campaignId=${campaign.id}&message=` +
        encodeURIComponent(
          `Campaign prepared with ${queuedCount} queued and ${skippedCount} skipped recipients.`,
        ) +
        `&includeRole=${includeRoleEmails ? "1" : "0"}`,
    );
  }

  const { data: campaigns, error: campaignsError } = await supabase
    .from("campaigns")
    .select(
      `
        id,
        name,
        source_list_id,
        template_variant_set_id,
        source_list:audience_lists (
          id,
          name
        ),
        status,
        total_contacts,
        queued_count,
        skipped_count,
        opened_count,
        sent_count,
        daily_cap,
        hard_cap,
        min_interval_seconds,
        max_interval_seconds,
        created_at,
        template:templates (
          id,
          name,
          campaign_type
        ),
        template_variant_set:template_variant_sets (
          id,
          name,
          language,
          variants,
          updated_at
        )
      `,
    )
    .eq("workspace_id", workspace.workspaceId)
    .order("created_at", { ascending: false })
    .limit(100);

  const { data: templates, error: templatesError } = await supabase
    .from("templates")
    .select("id, name, campaign_type, subject_template, body_template")
    .eq("workspace_id", workspace.workspaceId)
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .limit(100);

  const { data: templateVariantSets, error: templateVariantSetsError } = await supabase
    .from("template_variant_sets")
    .select("id, template_id, name, language, variants, updated_at, generation_notes")
    .eq("workspace_id", workspace.workspaceId)
    .order("created_at", { ascending: true });

  const { data: readyLists, error: readyListsError } = await supabase
    .from("audience_lists")
    .select("id, name, ready_row_count")
    .eq("workspace_id", workspace.workspaceId)
    .eq("status", "ready")
    .order("created_at", { ascending: false })
    .limit(100);

  const schemaMissing =
    isMissingTableError(campaignsError) ||
    isMissingTableError(templatesError) ||
    isMissingTableError(templateVariantSetsError);
  const listsMissing = isMissingTableError(readyListsError);

  if (readyListsError && !listsMissing) {
    throw readyListsError;
  }
  if (templateVariantSetsError && !isMissingTableError(templateVariantSetsError)) {
    throw templateVariantSetsError;
  }

  const safeCampaigns = campaigns ?? [];
  const safeTemplates = templates ?? [];
  const safeLists = readyLists ?? [];
  const safeTemplateVariantSets = (templateVariantSets ?? []).map((row) => ({
    id: row.id,
    template_id: row.template_id,
    name: row.name,
    language: row.language as "en" | "zh" | "es",
    generation_notes: (row.generation_notes as Record<string, unknown>) ?? {},
    variants: parseTemplateVariantRows(row.variants),
    updated_at: row.updated_at,
  }));
  const policyDefaults = await getWorkspacePolicyDefaults(workspace.workspaceId);
  const subscription = await getWorkspaceSubscription(workspace.workspaceId, supabase);

  const activeCampaignFromParam = safeCampaigns.find(
    (campaign) => campaign.id === activeCampaignIdParam,
  );
  const activeCampaign =
    activeCampaignFromParam ??
    (activeCampaignIdParam ? null : isNewCampaignMode ? null : safeCampaigns[0] ?? null);

  const { data: campaignRecipients, error: campaignRecipientsError } = activeCampaign
    ? await supabase
        .from("campaign_recipients")
        .select(
          "id, full_name, company_name, email, status, risk_level, risk_notes, variant_index, scheduled_at, opened_at, sent_at, gmail_compose_url",
        )
        .eq("campaign_id", activeCampaign.id)
        .order("created_at", { ascending: true })
        .limit(500)
    : { data: [], error: null };

  if (campaignRecipientsError && !isMissingTableError(campaignRecipientsError)) {
    throw campaignRecipientsError;
  }

  const safeRecipients = campaignRecipients ?? [];

  const initialOpenedRecipient = [...safeRecipients]
    .filter((recipient) => recipient.status === "opened_gmail")
    .sort(
      (a, b) =>
        new Date(b.opened_at ?? 0).getTime() - new Date(a.opened_at ?? 0).getTime(),
    )[0];

  const initialLastSentRecipient = [...safeRecipients]
    .filter((recipient) => recipient.status === "sent")
    .sort(
      (a, b) =>
        new Date(b.sent_at ?? 0).getTime() - new Date(a.sent_at ?? 0).getTime(),
    )[0];

  const sourceListInfo = activeCampaign
    ? Array.isArray(activeCampaign.source_list)
      ? activeCampaign.source_list[0]
      : activeCampaign.source_list
    : null;
  const templateInfo = activeCampaign
    ? Array.isArray(activeCampaign.template)
      ? activeCampaign.template[0]
      : activeCampaign.template
    : null;
  const templateVariantSetInfo = activeCampaign
    ? Array.isArray(activeCampaign.template_variant_set)
      ? activeCampaign.template_variant_set[0]
      : activeCampaign.template_variant_set
    : null;
  const effectivePreselectedListId = preselectedListId || activeCampaign?.source_list_id || "";
  const effectivePreselectedTemplateId = templateInfo?.id ?? "";
  const effectivePreselectedVariantSetId = templateVariantSetInfo?.id ?? "";
  const effectiveCampaignName = activeCampaign?.name ?? "";
  const effectiveDailyCap = activeCampaign?.daily_cap ?? Math.min(
    policyDefaults.recommendedDailyCap,
    subscription.campaignDailyLimit,
  );
  const effectiveHardCap = activeCampaign?.hard_cap ?? Math.min(
    policyDefaults.hardDailyCap,
    subscription.hardCapLimit,
  );
  const effectiveMinIntervalSeconds =
    activeCampaign?.min_interval_seconds ?? policyDefaults.minIntervalSeconds;
  const effectiveMaxIntervalSeconds =
    activeCampaign?.max_interval_seconds ?? policyDefaults.maxIntervalSeconds;
  const effectiveAllowRoleBasedRecipients =
    preselectedIncludeRoleParam === "1"
      ? true
      : preselectedIncludeRoleParam === "0"
        ? false
        : policyDefaults.allowRoleBasedRecipients;

  return (
    <div className="grid gap-3">
      <PageHeader
        title="Campaigns"
        description="Single-page campaign workflow: prepare from one list, send in Gmail, and mark sent without switching screens."
        actions={
          <>
            <Link
              href="/app/campaigns?new=1"
              className="inline-flex h-9 items-center rounded-lg border border-blue-700 bg-blue-600 px-3 text-xs font-semibold text-white hover:bg-blue-700"
            >
              + Start new campaign
            </Link>
            <Link
              href="/app/docs"
              className="inline-flex h-9 items-center rounded-lg border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              View setup guide
            </Link>
          </>
        }
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
      {isNewCampaignMode ? (
        <p className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-700">
          New campaign mode is on. Use
          <span className="mx-1 font-semibold text-blue-900">
            Campaign setup
          </span>
          below to create a fresh campaign session.
        </p>
      ) : null}
      {listsMissing ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
          Lists table not ready yet. Run
          <code className="mx-1 rounded bg-amber-100 px-1.5 py-0.5 text-xs">
            supabase/migrations/0008_lists_mvp.sql
          </code>
          to enable single-list campaign source.
        </p>
      ) : null}

      {schemaMissing ? (
        <SectionCard title="Database migration required">
          <p className="text-sm leading-6 text-slate-600">
            Bulk campaign tables are not ready. Run
            <code className="mx-1 rounded bg-slate-100 px-1.5 py-0.5 text-xs">
              supabase/migrations/0003_bulk_campaign_mvp.sql
            </code>
            and
            <code className="mx-1 rounded bg-slate-100 px-1.5 py-0.5 text-xs">
              supabase/migrations/0011_template_variant_sets.sql
            </code>
            and refresh this page.
          </p>
        </SectionCard>
      ) : (
        <>
          {safeCampaigns.length > 0 ? (
            <SectionCard title="Active campaign session">
              <div className="grid gap-2">
                <form method="get" className="grid gap-2 sm:grid-cols-[1fr_auto]">
                  <select
                    name="campaignId"
                    defaultValue={activeCampaign?.id}
                    className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  >
                    {safeCampaigns.map((campaign) => (
                      <option key={campaign.id} value={campaign.id}>
                        {campaign.name} ({campaign.status})
                      </option>
                    ))}
                  </select>
                  <button
                    type="submit"
                    className="inline-flex h-9 items-center justify-center rounded-lg border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    Load campaign
                  </button>
                </form>
                <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2">
                  <p className="text-xs text-blue-700">
                    Want to avoid editing old unfinished campaigns?
                    <Link
                      href="/app/campaigns?new=1"
                      className="ml-1 font-semibold text-blue-900 underline"
                    >
                      Start a new campaign
                    </Link>
                  </p>
                </div>
              </div>
            </SectionCard>
          ) : null}

          <section className="grid gap-3 xl:grid-cols-[1fr_1.3fr]">
            <SectionCard title="Campaign setup">
              <CampaignSetupForm
                key={`campaign-setup-${activeCampaign?.id ?? "new"}-${effectivePreselectedTemplateId}-${effectivePreselectedListId}-${effectivePreselectedVariantSetId}`}
                templates={safeTemplates}
                readyLists={safeLists}
                templateVariantSets={safeTemplateVariantSets}
                preselectedListId={effectivePreselectedListId}
                preselectedTemplateId={effectivePreselectedTemplateId}
                preselectedVariantSetId={effectivePreselectedVariantSetId}
                initialCampaignName={effectiveCampaignName}
                initialDailyCap={effectiveDailyCap}
                initialHardCap={effectiveHardCap}
                initialMinIntervalSeconds={effectiveMinIntervalSeconds}
                initialMaxIntervalSeconds={effectiveMaxIntervalSeconds}
                initialAllowRoleBasedRecipients={effectiveAllowRoleBasedRecipients}
                maxDailyCap={subscription.campaignDailyLimit}
                maxHardCap={subscription.hardCapLimit}
                createCampaignAction={createCampaign}
              />
            </SectionCard>

            <SectionCard title="Send actions (same page)">
              {activeCampaign ? (
                <CampaignDetailActions
                  campaignId={activeCampaign.id}
                  initialQueuedCount={activeCampaign.queued_count ?? 0}
                  minIntervalSeconds={activeCampaign.min_interval_seconds ?? 90}
                  maxIntervalSeconds={activeCampaign.max_interval_seconds ?? 120}
                  initialStatus={activeCampaign.status}
                  initialOpenedRecipient={
                    initialOpenedRecipient
                      ? {
                          id: initialOpenedRecipient.id,
                          fullName:
                            initialOpenedRecipient.full_name ??
                            initialOpenedRecipient.email,
                          email: initialOpenedRecipient.email,
                        }
                      : null
                  }
                  initialLastSentRecipient={
                    initialLastSentRecipient
                      ? {
                          fullName:
                            initialLastSentRecipient.full_name ??
                            initialLastSentRecipient.email,
                          email: initialLastSentRecipient.email,
                          sentAt: initialLastSentRecipient.sent_at ?? new Date().toISOString(),
                        }
                      : null
                  }
                />
              ) : (
                <p className="text-sm text-slate-500">
                  No prepared campaign yet. Configure setup and click
                  <span className="mx-1 font-semibold text-slate-700">
                    Save + Prepare recipients
                  </span>
                  first.
                </p>
              )}
            </SectionCard>
          </section>

          {activeCampaign ? (
            <>
              <section className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                <article className="rounded-xl border border-slate-200 bg-white p-3">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500">
                    Status
                  </p>
                  <p className="mt-1 text-2xl font-semibold tracking-tight text-slate-950">
                    {activeCampaign.status}
                  </p>
                  <p className="text-[11px] text-slate-500">
                    Template: {templateInfo?.name ?? "-"}
                  </p>
                  <p className="text-[11px] text-slate-500">
                    Variant set: {templateVariantSetInfo?.name ?? "None"}
                  </p>
                  <p className="text-[11px] text-slate-500">
                    Source: {sourceListInfo?.name ?? "-"}
                  </p>
                </article>
                <article className="rounded-xl border border-slate-200 bg-white p-3">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500">
                    Queued / Skipped
                  </p>
                  <p className="mt-1 text-2xl font-semibold tracking-tight text-slate-950">
                    {activeCampaign.queued_count} / {activeCampaign.skipped_count}
                  </p>
                  <p className="text-[11px] text-slate-500">
                    Total contacts: {activeCampaign.total_contacts}
                  </p>
                </article>
                <article className="rounded-xl border border-slate-200 bg-white p-3">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500">
                    Opened / Sent
                  </p>
                  <p className="mt-1 text-2xl font-semibold tracking-tight text-slate-950">
                    {activeCampaign.opened_count} / {activeCampaign.sent_count}
                  </p>
                  <p className="text-[11px] text-slate-500">Manual Gmail progression</p>
                </article>
                <article className="rounded-xl border border-slate-200 bg-white p-3">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500">
                    Pacing
                  </p>
                  <p className="mt-1 text-2xl font-semibold tracking-tight text-slate-950">
                    {activeCampaign.min_interval_seconds}s-{activeCampaign.max_interval_seconds}s
                  </p>
                  <p className="text-[11px] text-slate-500">
                    Daily cap {activeCampaign.daily_cap}, hard cap {activeCampaign.hard_cap}
                  </p>
                </article>
              </section>

              <SectionCard title={`Recipient list: ${activeCampaign.name}`}>
                <CampaignRecipientTable
                  campaignId={activeCampaign.id}
                  recipients={safeRecipients}
                />
              </SectionCard>
            </>
          ) : null}
        </>
      )}
    </div>
  );
}
