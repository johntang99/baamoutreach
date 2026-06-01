import Link from "next/link";
import {
  PageHeader,
  SectionCard,
} from "@/components/product/page-primitives";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getOrCreatePrimaryWorkspace } from "@/lib/workspaces";
import { isMissingTableError, toSafeText } from "@/lib/single-send";
import { getWorkspacePolicyDefaults } from "@/lib/policies";
import { logWorkspaceAudit } from "@/lib/audit";
import { getWorkspaceSubscription } from "@/lib/billing";
import {
  buildRenderedSend,
  campaignRecipientRisk,
  normalizeIntervalRange,
  scheduledAtForIndex,
} from "@/lib/campaigns";

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
    const sourceListIdInput = toSafeText(formData.get("source_list_id"));
    const sourceListId =
      sourceListIdInput && sourceListIdInput !== "__all__" ? sourceListIdInput : null;
    const includeRoleEmails =
      String(formData.get("include_role_emails")) === "on";
    const dailyCapInput = Number(formData.get("daily_cap") ?? NaN);
    const hardCapInput = Number(formData.get("hard_cap") ?? NaN);
    const minIntervalInputRaw = Number(formData.get("min_interval_seconds") ?? NaN);
    const maxIntervalInputRaw = Number(formData.get("max_interval_seconds") ?? NaN);

    if (!name || !templateId) {
      redirect(
        "/app/campaigns?error=" +
          encodeURIComponent("Campaign name and template are required."),
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

    let sourceList:
      | {
          id: string;
          name: string;
          defaultLanguage: string;
          variantsTemplateId: string | null;
          templateVariants: Array<{ subject: string; body: string; tone: string }>;
        }
      | null = null;

    type SourceRecipient = {
      sourceId: string;
      contactId: string | null;
      fullName: string;
      email: string;
      companyName: string | null;
      language: string;
      preSuppressed: boolean;
    };

    let sourceRecipients: SourceRecipient[] = [];
    if (sourceListId) {
      const { data: selectedList, error: selectedListError } = await serverSupabase
        .from("audience_lists")
        .select("id, name, default_language, variants_template_id, template_variants")
        .eq("id", sourceListId)
        .eq("workspace_id", actionWorkspace.workspaceId)
        .eq("status", "ready")
        .maybeSingle();

      if (selectedListError) {
        if (isMissingTableError(selectedListError)) {
          redirect(
            "/app/campaigns?error=" +
              encodeURIComponent(
                "Run supabase/migrations/0008_lists_mvp.sql first.",
              ),
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

      sourceList = {
        id: selectedList.id,
        name: selectedList.name,
        defaultLanguage: selectedList.default_language,
        variantsTemplateId: selectedList.variants_template_id,
        templateVariants: Array.isArray(selectedList.template_variants)
          ? (selectedList.template_variants as Array<{
              subject: string;
              body: string;
              tone: string;
            }>)
          : [],
      };
      const { data: listEntries, error: listEntriesError } = await serverSupabase
        .from("audience_list_entries")
        .select("id, contact_id, full_name, email, company_name, language, is_suppressed")
        .eq("workspace_id", actionWorkspace.workspaceId)
        .eq("list_id", selectedList.id)
        .order("created_at", { ascending: true })
        .limit(Math.min(hardCap * 3, 5000));

      if (listEntriesError) {
        redirect(
          "/app/campaigns?error=" + encodeURIComponent(listEntriesError.message),
        );
      }

      sourceRecipients = (listEntries ?? []).map((entry) => ({
        sourceId: entry.id,
        contactId: entry.contact_id,
        fullName: entry.full_name,
        email: entry.email,
        companyName: entry.company_name,
        language: entry.language,
        preSuppressed: entry.is_suppressed,
      }));
    } else {
      const { data: contacts, error: contactsError } = await serverSupabase
        .from("contacts")
        .select("id, full_name, email, company_name")
        .eq("workspace_id", actionWorkspace.workspaceId)
        .eq("status", "active")
        .order("created_at", { ascending: false })
        .limit(Math.min(hardCap * 3, 2000));

      if (contactsError) {
        redirect(
          "/app/campaigns?error=" + encodeURIComponent(contactsError.message),
        );
      }

      sourceRecipients = (contacts ?? []).map((contact) => ({
        sourceId: contact.id,
        contactId: contact.id,
        fullName: contact.full_name,
        email: contact.email,
        companyName: contact.company_name,
        language: "en",
        preSuppressed: false,
      }));
    }

    const { data: suppressionRows, error: suppressionError } = await serverSupabase
      .from("suppression_entries")
      .select("email")
      .eq("workspace_id", actionWorkspace.workspaceId);

    if (suppressionError) {
      redirect(
        "/app/campaigns?error=" + encodeURIComponent(suppressionError.message),
      );
    }

    const suppressionSet = new Set(
      (suppressionRows ?? []).map((row) => row.email.toLowerCase()),
    );

    const { data: campaign, error: campaignError } = await serverSupabase
      .from("campaigns")
      .insert({
        workspace_id: actionWorkspace.workspaceId,
        name,
        source_list_id: sourceList?.id ?? null,
        template_id: template.id,
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
    const activeVariants =
      sourceList &&
      sourceList.variantsTemplateId === template.id &&
      sourceList.templateVariants.length > 0
        ? sourceList.templateVariants
        : [];

    if (sourceList && activeVariants.length > 0) {
      const eligibleIndices: number[] = [];
      sourceRecipients.forEach((recipient, index) => {
        if (recipient.language === sourceList?.defaultLanguage) {
          eligibleIndices.push(index);
        }
      });
      const ordered = eligibleIndices.map((_, index) => index % activeVariants.length);
      for (let index = ordered.length - 1; index > 0; index -= 1) {
        const swap = Math.floor(Math.random() * (index + 1));
        [ordered[index], ordered[swap]] = [ordered[swap], ordered[index]];
      }
      eligibleIndices.forEach((recipientIndex, slot) => {
        variantAssignment.set(recipientIndex, ordered[slot]);
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
      const shouldQueue = risk.shouldQueue;

      if (!shouldQueue) {
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
      redirect(
        "/app/campaigns?error=" + encodeURIComponent(recipientsError.message),
      );
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
        source_list_id: sourceList?.id ?? null,
        variant_applied_count: variantAppliedCount,
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
        totalContacts: totalContacts,
        queuedCount: queuedCount,
        skippedCount: skippedCount,
        includeRoleEmails,
        dailyCap,
        hardCap,
        minIntervalSeconds: interval.min,
        maxIntervalSeconds: interval.max,
        sourceListId: sourceList?.id ?? null,
        sourceListName: sourceList?.name ?? "active_contacts",
        variantAppliedCount,
        variantsSourceTemplateMatched: sourceList
          ? sourceList.variantsTemplateId === template.id
          : false,
      },
    });

    redirect(
      "/app/campaigns?message=" +
        encodeURIComponent(
          `Campaign prepared with ${queuedCount} queued and ${skippedCount} skipped recipients.`,
        ),
    );
  }

  const { data: campaigns, error: campaignsError } = await supabase
    .from("campaigns")
    .select(
      `
        id,
        name,
        source_list:audience_lists (
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
        created_at,
        template:templates (
          name
        )
      `,
    )
    .eq("workspace_id", workspace.workspaceId)
    .order("created_at", { ascending: false })
    .limit(100);

  const { data: templates, error: templatesError } = await supabase
    .from("templates")
    .select("id, name, campaign_type")
    .eq("workspace_id", workspace.workspaceId)
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .limit(100);

  const { data: readyLists, error: readyListsError } = await supabase
    .from("audience_lists")
    .select("id, name, ready_row_count, variants_template_id, template_variants")
    .eq("workspace_id", workspace.workspaceId)
    .eq("status", "ready")
    .order("created_at", { ascending: false })
    .limit(100);

  const schemaMissing =
    isMissingTableError(campaignsError) || isMissingTableError(templatesError);
  const listsMissing = isMissingTableError(readyListsError);

  if (readyListsError && !listsMissing) {
    throw readyListsError;
  }

  const safeCampaigns = campaigns ?? [];
  const safeTemplates = templates ?? [];
  const safeLists = readyLists ?? [];
  const policyDefaults = await getWorkspacePolicyDefaults(workspace.workspaceId);
  const subscription = await getWorkspaceSubscription(workspace.workspaceId, supabase);

  return (
    <div className="grid gap-3">
      <PageHeader
        title="Campaigns"
        description="Bulk campaign index with status, pacing policy, and release controls."
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

      {schemaMissing ? (
        <SectionCard title="Database migration required">
          <p className="text-sm leading-6 text-slate-600">
            Bulk campaign tables are not ready. Run
            <code className="mx-1 rounded bg-slate-100 px-1.5 py-0.5 text-xs">
              supabase/migrations/0003_bulk_campaign_mvp.sql
            </code>
            and refresh this page.
          </p>
        </SectionCard>
      ) : (
        <>
          <section className="grid gap-3 xl:grid-cols-[1fr_1.3fr]">
            <SectionCard title="Create campaign">
              <form action={createCampaign} className="grid gap-3">
                <label className="grid gap-1">
                  <span className="text-xs font-medium text-slate-600">Campaign name</span>
                  <input
                    name="name"
                    type="text"
                    required
                    placeholder="TCM NYC Batch A"
                    className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                </label>

                <label className="grid gap-1">
                  <span className="text-xs font-medium text-slate-600">Template</span>
                  <select
                    name="template_id"
                    required
                    className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  >
                    {safeTemplates.map((template) => (
                      <option key={template.id} value={template.id}>
                        {template.name} ({template.campaign_type})
                      </option>
                    ))}
                  </select>
                </label>

                <label className="grid gap-1">
                  <span className="text-xs font-medium text-slate-600">Recipient source</span>
                  <select
                    name="source_list_id"
                    defaultValue={
                      preselectedListId && safeLists.some((list) => list.id === preselectedListId)
                        ? preselectedListId
                        : "__all__"
                    }
                    className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  >
                    <option value="__all__">All active contacts</option>
                    {safeLists.map((list) => (
                      <option key={list.id} value={list.id}>
                        {list.name} ({list.ready_row_count} ready
                        {Array.isArray(list.template_variants) &&
                        list.template_variants.length > 0
                          ? ", AI variants ready"
                          : ""}
                        )
                      </option>
                    ))}
                  </select>
                </label>

                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="grid gap-1">
                    <span className="text-xs font-medium text-slate-600">Daily cap</span>
                    <input
                      name="daily_cap"
                      type="number"
                      min={1}
                      max={subscription.campaignDailyLimit}
                      defaultValue={Math.min(
                        policyDefaults.recommendedDailyCap,
                        subscription.campaignDailyLimit,
                      )}
                      className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    />
                  </label>
                  <label className="grid gap-1">
                    <span className="text-xs font-medium text-slate-600">Hard cap</span>
                    <input
                      name="hard_cap"
                      type="number"
                      min={1}
                      max={subscription.hardCapLimit}
                      defaultValue={Math.min(
                        policyDefaults.hardDailyCap,
                        subscription.hardCapLimit,
                      )}
                      className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    />
                  </label>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="grid gap-1">
                    <span className="text-xs font-medium text-slate-600">Min interval (sec)</span>
                    <input
                      name="min_interval_seconds"
                      type="number"
                      min={30}
                      defaultValue={policyDefaults.minIntervalSeconds}
                      className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    />
                  </label>
                  <label className="grid gap-1">
                    <span className="text-xs font-medium text-slate-600">Max interval (sec)</span>
                    <input
                      name="max_interval_seconds"
                      type="number"
                      min={30}
                      defaultValue={policyDefaults.maxIntervalSeconds}
                      className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    />
                  </label>
                </div>

                <label className="flex items-center gap-2 text-sm text-slate-600">
                  <input
                    name="include_role_emails"
                    type="checkbox"
                    defaultChecked={policyDefaults.allowRoleBasedRecipients}
                  />
                  Include role-based mailboxes (info@, contact@, admin@)
                </label>

                <button
                  type="submit"
                  className="inline-flex h-9 items-center justify-center rounded-lg border border-blue-700 bg-blue-600 px-3 text-xs font-semibold text-white hover:bg-blue-700"
                  disabled={safeTemplates.length === 0}
                >
                  Prepare campaign queue
                </button>
              </form>
            </SectionCard>

            <SectionCard title="Preparation notes">
              <ul className="space-y-2 text-sm text-slate-600">
                <li className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                  Plan {subscription.planTier}: daily cap up to{" "}
                  {subscription.campaignDailyLimit}, hard cap up to {subscription.hardCapLimit}.
                </li>
                <li className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                  Source can be all active contacts or one ready list snapshot.
                  {listsMissing ? " (Lists table not ready yet.)" : ""}
                </li>
                <li className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                  Queue uses the selected source rows only.
                </li>
                <li className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                  If a source list has AI variants generated from the same template,
                  queued recipients auto-rotate across those variants.
                </li>
                <li className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                  Suppressed contacts are auto-skipped.
                </li>
                <li className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                  Role-based mailboxes are skipped unless override is enabled.
                </li>
                <li className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                  Gmail compose URLs are generated per recipient and stored in queue.
                </li>
              </ul>
            </SectionCard>
          </section>

          <SectionCard title="Campaign queue">
            {safeCampaigns.length === 0 ? (
              <p className="text-sm text-slate-500">
                No campaigns yet. Create your first campaign above.
              </p>
            ) : (
              <div className="overflow-hidden rounded-xl border border-slate-200">
                <table className="w-full border-collapse text-xs">
                  <thead className="bg-slate-50">
                    <tr>
                      {[
                        "Campaign",
                        "Source",
                        "Template",
                        "Queued",
                        "Skipped",
                        "Opened",
                        "Sent",
                        "Status",
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
                    {safeCampaigns.map((campaign) => (
                      <tr key={campaign.id}>
                        <td className="border-b border-slate-200 px-3 py-2 text-slate-700">
                          {campaign.name}
                        </td>
                        <td className="border-b border-slate-200 px-3 py-2 text-slate-700">
                          {Array.isArray(campaign.source_list)
                            ? campaign.source_list[0]?.name ?? "All contacts"
                            : (campaign.source_list as { name?: string } | null)?.name ??
                              "All contacts"}
                        </td>
                        <td className="border-b border-slate-200 px-3 py-2 text-slate-700">
                          {Array.isArray(campaign.template)
                            ? campaign.template[0]?.name ?? "-"
                            : (campaign.template as { name?: string } | null)?.name ?? "-"}
                        </td>
                        <td className="border-b border-slate-200 px-3 py-2 text-slate-700">
                          {campaign.queued_count}
                        </td>
                        <td className="border-b border-slate-200 px-3 py-2 text-slate-700">
                          {campaign.skipped_count}
                        </td>
                        <td className="border-b border-slate-200 px-3 py-2 text-slate-700">
                          {campaign.opened_count}
                        </td>
                        <td className="border-b border-slate-200 px-3 py-2 text-slate-700">
                          {campaign.sent_count}
                        </td>
                        <td className="border-b border-slate-200 px-3 py-2 text-slate-700">
                          {campaign.status}
                        </td>
                        <td className="border-b border-slate-200 px-3 py-2">
                          <Link
                            href={`/app/campaigns/${campaign.id}`}
                            className="font-medium text-blue-600 hover:text-blue-700"
                          >
                            View detail
                          </Link>
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
