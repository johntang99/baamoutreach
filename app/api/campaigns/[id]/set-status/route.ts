import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
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

  const requestedStatus = toSafeText(payload.status);
  if (requestedStatus !== "paused" && requestedStatus !== "active") {
    return NextResponse.json(
      { error: "status must be either paused or active." },
      { status: 400 },
    );
  }

  const { data: campaign, error: campaignError } = await supabase
    .from("campaigns")
    .select("id, workspace_id, status")
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
      { error: "Viewer role cannot update campaign status." },
      { status: 403 },
    );
  }

  if (campaign.status === "completed") {
    return NextResponse.json(
      { error: "Completed campaign cannot be resumed or paused." },
      { status: 409 },
    );
  }

  const { error: updateError } = await supabase
    .from("campaigns")
    .update({
      status: requestedStatus,
    })
    .eq("id", campaign.id);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 400 });
  }

  return NextResponse.json({
    ok: true,
    status: requestedStatus,
  });
}
