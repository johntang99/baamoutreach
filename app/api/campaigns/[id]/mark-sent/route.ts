import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { logWorkspaceAudit } from "@/lib/audit";
import { isMissingTableError, toSafeText } from "@/lib/single-send";

function schemaMissingResponse() {
  return NextResponse.json(
    {
      error:
        "Bulk campaign tables are not ready. Run supabase/migrations/0003_bulk_campaign_mvp.sql and retry.",
    },
    { status: 400 },
  );
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  let payload: Record<string, unknown> = {};
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 });
  }

  const recipientId = toSafeText(payload.recipientId);
  if (!recipientId) {
    return NextResponse.json({ error: "recipientId is required." }, { status: 400 });
  }

  const { data: campaign, error: campaignError } = await supabase
    .from("campaigns")
    .select("id, workspace_id")
    .eq("id", id)
    .maybeSingle();

  if (campaignError) {
    if (isMissingTableError(campaignError)) return schemaMissingResponse();
    return NextResponse.json({ error: campaignError.message }, { status: 400 });
  }

  if (!campaign) {
    return NextResponse.json({ error: "Campaign not found." }, { status: 404 });
  }

  const { data: membership } = await supabase
    .from("workspace_memberships")
    .select("role")
    .eq("workspace_id", campaign.workspace_id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!membership) {
    return NextResponse.json(
      { error: "You cannot access this campaign." },
      { status: 403 },
    );
  }

  if (membership.role === "viewer") {
    return NextResponse.json(
      { error: "Viewer role cannot mark recipient as sent." },
      { status: 403 },
    );
  }

  const { data: recipient, error: recipientError } = await supabase
    .from("campaign_recipients")
    .select("id, status, email")
    .eq("id", recipientId)
    .eq("campaign_id", campaign.id)
    .maybeSingle();

  if (recipientError) {
    return NextResponse.json({ error: recipientError.message }, { status: 400 });
  }

  if (!recipient) {
    return NextResponse.json({ error: "Recipient not found." }, { status: 404 });
  }

  if (recipient.status === "sent") {
    return NextResponse.json({ ok: true, alreadySent: true });
  }

  const { error: updateRecipientError } = await supabase
    .from("campaign_recipients")
    .update({
      status: "sent",
      sent_at: new Date().toISOString(),
    })
    .eq("id", recipient.id);

  if (updateRecipientError) {
    return NextResponse.json({ error: updateRecipientError.message }, { status: 400 });
  }

  const [queuedSummary, openedSummary, sentSummary] = await Promise.all([
    supabase
      .from("campaign_recipients")
      .select("id", { count: "exact", head: true })
      .eq("campaign_id", campaign.id)
      .eq("status", "queued"),
    supabase
      .from("campaign_recipients")
      .select("id", { count: "exact", head: true })
      .eq("campaign_id", campaign.id)
      .eq("status", "opened_gmail"),
    supabase
      .from("campaign_recipients")
      .select("id", { count: "exact", head: true })
      .eq("campaign_id", campaign.id)
      .eq("status", "sent"),
  ]);

  const countError =
    queuedSummary.error ?? openedSummary.error ?? sentSummary.error;
  if (countError) {
    return NextResponse.json({ error: countError.message }, { status: 400 });
  }

  const queuedCount = queuedSummary.count ?? 0;
  const openedCount = openedSummary.count ?? 0;
  const sentCount = sentSummary.count ?? 0;
  const nextStatus = queuedCount + openedCount > 0 ? "active" : "completed";

  const { error: updateCampaignError } = await supabase
    .from("campaigns")
    .update({
      status: nextStatus,
      queued_count: queuedCount,
      opened_count: openedCount,
      sent_count: sentCount,
    })
    .eq("id", campaign.id);

  if (updateCampaignError) {
    return NextResponse.json({ error: updateCampaignError.message }, { status: 400 });
  }

  await supabase.from("campaign_events").insert({
    workspace_id: campaign.workspace_id,
    campaign_id: campaign.id,
    campaign_recipient_id: recipient.id,
    event_type: "recipient_marked_sent",
    event_payload: {
      recipient_email: recipient.email,
    },
    created_by: user.id,
  });

  await logWorkspaceAudit({
    workspaceId: campaign.workspace_id,
    actorUserId: user.id,
    action: "campaign.recipient_marked_sent",
    entityType: "campaign_recipient",
    entityId: recipient.id,
    metadata: {
      campaignId: campaign.id,
      email: recipient.email,
    },
  });

  return NextResponse.json({
    ok: true,
    queuedCount,
    openedCount,
    sentCount,
  });
}
