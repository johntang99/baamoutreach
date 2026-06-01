import { notFound, redirect } from "next/navigation";
import { PageHeader, SectionCard } from "@/components/product/page-primitives";
import { CampaignDetailActions } from "@/components/campaigns/campaign-detail-actions";
import { createClient } from "@/lib/supabase/server";
import { getOrCreatePrimaryWorkspace } from "@/lib/workspaces";
import { isMissingTableError } from "@/lib/single-send";

export default async function CampaignDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/login?next=/app/campaigns/${id}`);
  }

  const workspace = await getOrCreatePrimaryWorkspace(user, supabase);

  const { data: campaign, error: campaignError } = await supabase
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
        min_interval_seconds,
        max_interval_seconds,
        created_at,
        template:templates (
          name,
          campaign_type
        )
      `,
    )
    .eq("id", id)
    .eq("workspace_id", workspace.workspaceId)
    .maybeSingle();

  if (campaignError) {
    if (isMissingTableError(campaignError)) {
      return (
        <SectionCard title="Database migration required">
          <p className="text-sm leading-6 text-slate-600">
            Bulk campaign tables are not ready. Run
            <code className="mx-1 rounded bg-slate-100 px-1.5 py-0.5 text-xs">
              supabase/migrations/0003_bulk_campaign_mvp.sql
            </code>
            and refresh.
          </p>
        </SectionCard>
      );
    }
    throw campaignError;
  }

  if (!campaign) {
    notFound();
  }

  const { data: recipients, error: recipientsError } = await supabase
    .from("campaign_recipients")
    .select(
      `
        id,
        full_name,
        email,
        company_name,
        status,
        risk_level,
        risk_notes,
        variant_index,
        scheduled_at,
        opened_at,
        sent_at
      `,
    )
    .eq("campaign_id", campaign.id)
    .order("created_at", { ascending: true })
    .limit(300);

  if (recipientsError) {
    throw recipientsError;
  }

  const templateInfo = Array.isArray(campaign.template)
    ? campaign.template[0]
    : campaign.template;
  const sourceListInfo = Array.isArray(campaign.source_list)
    ? campaign.source_list[0]
    : campaign.source_list;

  return (
    <div className="grid gap-3">
      <PageHeader
        title={`Campaign: ${campaign.name}`}
        description="Manage queue progression, open recipients in Gmail, and mark sends as completed."
      />

      <section className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        <article className="rounded-xl border border-slate-200 bg-white p-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500">
            Status
          </p>
          <p className="mt-1 text-2xl font-semibold tracking-tight text-slate-950">
            {campaign.status}
          </p>
          <p className="text-[11px] text-slate-500">Template: {templateInfo?.name ?? "-"}</p>
          <p className="text-[11px] text-slate-500">
            Source: {sourceListInfo?.name ?? "All contacts"}
          </p>
        </article>
        <article className="rounded-xl border border-slate-200 bg-white p-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500">
            Queued / Skipped
          </p>
          <p className="mt-1 text-2xl font-semibold tracking-tight text-slate-950">
            {campaign.queued_count} / {campaign.skipped_count}
          </p>
          <p className="text-[11px] text-slate-500">Total contacts: {campaign.total_contacts}</p>
        </article>
        <article className="rounded-xl border border-slate-200 bg-white p-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500">
            Opened / Sent
          </p>
          <p className="mt-1 text-2xl font-semibold tracking-tight text-slate-950">
            {campaign.opened_count} / {campaign.sent_count}
          </p>
          <p className="text-[11px] text-slate-500">Progress tracking</p>
        </article>
        <article className="rounded-xl border border-slate-200 bg-white p-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500">
            Pacing
          </p>
          <p className="mt-1 text-2xl font-semibold tracking-tight text-slate-950">
            {campaign.min_interval_seconds}s-{campaign.max_interval_seconds}s
          </p>
          <p className="text-[11px] text-slate-500">
            Daily cap {campaign.daily_cap}, hard cap {campaign.hard_cap}
          </p>
        </article>
      </section>

      <SectionCard title="Queue operations">
        <CampaignDetailActions
          campaignId={campaign.id}
          initialQueuedCount={campaign.queued_count}
          minIntervalSeconds={campaign.min_interval_seconds}
          maxIntervalSeconds={campaign.max_interval_seconds}
        />
      </SectionCard>

      <SectionCard title="Recipient queue">
        {(recipients ?? []).length === 0 ? (
          <p className="text-sm text-slate-500">
            No recipients were generated for this campaign.
          </p>
        ) : (
          <div className="overflow-hidden rounded-xl border border-slate-200">
            <table className="w-full border-collapse text-xs">
              <thead className="bg-slate-50">
                <tr>
                  {[
                    "Recipient",
                    "Email",
                    "Status",
                    "Risk",
                    "Variant",
                    "Scheduled",
                    "Opened",
                    "Sent",
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
                {(recipients ?? []).map((recipient) => (
                  <tr key={recipient.id}>
                    <td className="border-b border-slate-200 px-3 py-2 text-slate-700">
                      {recipient.full_name}
                    </td>
                    <td className="border-b border-slate-200 px-3 py-2 text-slate-700">
                      {recipient.email}
                    </td>
                    <td className="border-b border-slate-200 px-3 py-2 text-slate-700">
                      {recipient.status}
                    </td>
                    <td className="border-b border-slate-200 px-3 py-2 text-slate-700">
                      {recipient.risk_level}
                    </td>
                    <td className="border-b border-slate-200 px-3 py-2 text-slate-700">
                      {recipient.variant_index === null
                        ? "-"
                        : `V${recipient.variant_index + 1}`}
                    </td>
                    <td className="border-b border-slate-200 px-3 py-2 text-slate-500">
                      {recipient.scheduled_at
                        ? new Date(recipient.scheduled_at).toLocaleString()
                        : "-"}
                    </td>
                    <td className="border-b border-slate-200 px-3 py-2 text-slate-500">
                      {recipient.opened_at
                        ? new Date(recipient.opened_at).toLocaleString()
                        : "-"}
                    </td>
                    <td className="border-b border-slate-200 px-3 py-2 text-slate-500">
                      {recipient.sent_at
                        ? new Date(recipient.sent_at).toLocaleString()
                        : "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>
    </div>
  );
}
