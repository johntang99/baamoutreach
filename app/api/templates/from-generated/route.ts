import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { toSafeText } from "@/lib/single-send";
import { getOrCreatePrimaryWorkspace } from "@/lib/workspaces";
import { getWorkspaceRole } from "@/lib/workspace-access";
import { generateUniqueTemplateName } from "@/lib/templates";
import { logWorkspaceAudit } from "@/lib/audit";

export async function POST(request: Request) {
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

  const nameInput = toSafeText(payload.name);
  const campaignType = toSafeText(payload.campaignType, "general");
  const subjectTemplate = toSafeText(payload.subjectTemplate);
  const bodyTemplate = toSafeText(payload.bodyTemplate);

  if (!subjectTemplate || !bodyTemplate) {
    return NextResponse.json(
      { error: "subjectTemplate and bodyTemplate are required." },
      { status: 400 },
    );
  }

  const workspace = await getOrCreatePrimaryWorkspace(user, supabase);
  const role = await getWorkspaceRole(workspace.workspaceId, user.id, supabase);
  if (!role) {
    return NextResponse.json({ error: "You cannot access this workspace." }, { status: 403 });
  }
  if (role === "viewer") {
    return NextResponse.json(
      { error: "Viewer role cannot create templates." },
      { status: 403 },
    );
  }

  const uniqueName = await generateUniqueTemplateName(
    supabase,
    workspace.workspaceId,
    nameInput || "AI template",
  );

  const { data: template, error: insertError } = await supabase
    .from("templates")
    .insert({
      workspace_id: workspace.workspaceId,
      name: uniqueName,
      campaign_type: campaignType,
      subject_template: subjectTemplate,
      body_template: bodyTemplate,
      is_active: true,
      created_by: user.id,
    })
    .select("id, name, campaign_type, subject_template, body_template, is_active, created_at")
    .single();

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 400 });
  }

  await logWorkspaceAudit({
    workspaceId: workspace.workspaceId,
    actorUserId: user.id,
    action: "template.created_from_ai",
    entityType: "template",
    entityId: template.id,
    metadata: {
      campaignType,
    },
  });

  return NextResponse.json(
    {
      ok: true,
      template,
    },
    { status: 201 },
  );
}
