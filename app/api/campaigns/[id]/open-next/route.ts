import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { logWorkspaceAudit } from "@/lib/audit";
import { isMissingTableError } from "@/lib/single-send";

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
  _request: Request,
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

  const { data: campaign, error: campaignError } = await supabase
    .from("campaigns")
    .select(
      "id, workspace_id, name, template_id, opened_count, status, min_interval_seconds, max_interval_seconds",
    )
    .eq("id", id)
    .maybeSingle();

  if (campaignError) {
    if (isMissingTableError(campaignError)) return schemaMissingResponse();
    return NextResponse.json({ error: campaignError.message }, { status: 400 });
  }

  if (!campaign) {
    return NextResponse.json({ error: "Campaign not found." }, { status: 404 });
  }

  if (campaign.status === "paused") {
    return NextResponse.json(
      { error: "Campaign is paused. Resume campaign before opening next recipient." },
      { status: 409 },
    );
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
      { error: "Viewer role cannot open queued recipients." },
      { status: 403 },
    );
  }

  const { data: existingOpenedRows, error: existingOpenedError } = await supabase
    .from("campaign_recipients")
    .select("id, email, full_name")
    .eq("campaign_id", campaign.id)
    .eq("status", "opened_gmail")
    .order("opened_at", { ascending: false });

  if (existingOpenedError) {
    return NextResponse.json({ error: existingOpenedError.message }, { status: 400 });
  }

  let autoMarkedCount = 0;
  let autoMarkedLastSent:
    | {
        fullName: string;
        email: string;
        sentAt: string;
      }
    | null = null;
  if ((existingOpenedRows ?? []).length > 0) {
    const sentAtIso = new Date().toISOString();
    const { data: autoMarkedRows, error: autoMarkError } = await supabase
      .from("campaign_recipients")
      .update({
        status: "sent",
        sent_at: sentAtIso,
      })
      .eq("campaign_id", campaign.id)
      .eq("status", "opened_gmail")
      .select("id, email, full_name");

    if (autoMarkError) {
      return NextResponse.json({ error: autoMarkError.message }, { status: 400 });
    }

    autoMarkedCount = autoMarkedRows?.length ?? 0;
    if (autoMarkedCount > 0) {
      const firstAutoMarked = autoMarkedRows?.[0];
      if (firstAutoMarked?.email) {
        autoMarkedLastSent = {
          fullName: firstAutoMarked.full_name ?? firstAutoMarked.email,
          email: firstAutoMarked.email,
          sentAt: sentAtIso,
        };
      }
      await supabase.from("campaign_events").insert(
        autoMarkedRows!.map((row) => ({
          workspace_id: campaign.workspace_id,
          campaign_id: campaign.id,
          campaign_recipient_id: row.id,
          event_type: "recipient_auto_marked_sent",
          event_payload: {
            recipient_email: row.email,
            recipient_name: row.full_name,
            reason: "open_next_queued",
          },
          created_by: user.id,
        })),
      );
      await logWorkspaceAudit({
        workspaceId: campaign.workspace_id,
        actorUserId: user.id,
        action: "campaign.recipient_auto_marked_sent",
        entityType: "campaign",
        entityId: campaign.id,
        metadata: {
          autoMarkedCount,
        },
      });
    }
  }

  const { data: nextRecipient, error: nextRecipientError } = await supabase
    .from("campaign_recipients")
    .select(
      "id, contact_id, email, full_name, subject, body, gmail_compose_url, status, risk_level, risk_notes",
    )
    .eq("campaign_id", campaign.id)
    .eq("status", "queued")
    .order("scheduled_at", { ascending: true, nullsFirst: true })
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (nextRecipientError) {
    return NextResponse.json({ error: nextRecipientError.message }, { status: 400 });
  }

  if (nextRecipient) {
    const { error: updateRecipientError } = await supabase
      .from("campaign_recipients")
      .update({
        status: "opened_gmail",
        opened_at: new Date().toISOString(),
      })
      .eq("id", nextRecipient.id)
      .eq("campaign_id", campaign.id);

    if (updateRecipientError) {
      return NextResponse.json({ error: updateRecipientError.message }, { status: 400 });
    }

    const { error: sendRequestError } = await supabase.from("send_requests").insert({
      workspace_id: campaign.workspace_id,
      contact_id: nextRecipient.contact_id,
      template_id: campaign.template_id,
      channel: "gmail_manual",
      status: "opened_gmail",
      subject: nextRecipient.subject,
      body: nextRecipient.body,
      gmail_compose_url: nextRecipient.gmail_compose_url,
      risk_level: nextRecipient.risk_level,
      risk_notes: nextRecipient.risk_notes ?? [],
      created_by: user.id,
    });

    if (sendRequestError && !isMissingTableError(sendRequestError)) {
      return NextResponse.json({ error: sendRequestError.message }, { status: 400 });
    }
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

  if (nextRecipient) {
    await supabase.from("campaign_events").insert({
      workspace_id: campaign.workspace_id,
      campaign_id: campaign.id,
      campaign_recipient_id: nextRecipient.id,
      event_type: "recipient_opened_gmail",
      event_payload: {
        recipient_email: nextRecipient.email,
        recipient_name: nextRecipient.full_name,
      },
      created_by: user.id,
    });

    await logWorkspaceAudit({
      workspaceId: campaign.workspace_id,
      actorUserId: user.id,
      action: "campaign.recipient_opened_gmail",
      entityType: "campaign_recipient",
      entityId: nextRecipient.id,
      metadata: {
        campaignId: campaign.id,
        email: nextRecipient.email,
        riskLevel: nextRecipient.risk_level,
      },
    });
  }

  if (!nextRecipient) {
    return NextResponse.json({
      done: true,
      queuedCount,
      openedCount,
      sentCount,
      campaignStatus: nextStatus,
      autoMarkedCount,
      autoMarkedLastSent,
    });
  }

  return NextResponse.json({
    done: false,
    recipientId: nextRecipient.id,
    recipientEmail: nextRecipient.email,
    recipientName: nextRecipient.full_name,
    gmailUrl: nextRecipient.gmail_compose_url,
    queuedCount,
    openedCount,
    sentCount,
    suggestedDelaySeconds: Math.max(30, campaign.min_interval_seconds ?? 90),
    minIntervalSeconds: campaign.min_interval_seconds ?? 90,
    maxIntervalSeconds: campaign.max_interval_seconds ?? 120,
    campaignStatus: nextStatus,
    autoMarkedCount,
    autoMarkedLastSent,
  });
}
