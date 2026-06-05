import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { toSafeText } from "@/lib/single-send";
import { logWorkspaceAudit } from "@/lib/audit";

export async function PATCH(
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

  const name = toSafeText(payload.name);
  const campaignType = toSafeText(payload.campaignType, "general");
  const subjectTemplate = toSafeText(payload.subjectTemplate);
  const bodyTemplate = toSafeText(payload.bodyTemplate);

  if (!name || !subjectTemplate || !bodyTemplate) {
    return NextResponse.json(
      { error: "Name, subject, and body are required." },
      { status: 400 },
    );
  }

  const { data: template, error: templateError } = await supabase
    .from("templates")
    .select("id, workspace_id")
    .eq("id", id)
    .maybeSingle();

  if (templateError) {
    return NextResponse.json({ error: templateError.message }, { status: 400 });
  }
  if (!template) {
    return NextResponse.json({ error: "Template not found." }, { status: 404 });
  }

  const { data: membership } = await supabase
    .from("workspace_memberships")
    .select("role")
    .eq("workspace_id", template.workspace_id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!membership) {
    return NextResponse.json(
      { error: "You cannot access this template." },
      { status: 403 },
    );
  }
  if (membership.role === "viewer") {
    return NextResponse.json(
      { error: "Viewer role cannot edit templates." },
      { status: 403 },
    );
  }

  const { data: updatedTemplate, error: updateError } = await supabase
    .from("templates")
    .update({
      name,
      campaign_type: campaignType,
      subject_template: subjectTemplate,
      body_template: bodyTemplate,
      updated_at: new Date().toISOString(),
    })
    .eq("id", template.id)
    .select(
      "id, name, campaign_type, subject_template, body_template, is_active, created_at",
    )
    .single();

  if (updateError) {
    const maybeCode = (updateError as { code?: string }).code;
    if (maybeCode === "23505") {
      return NextResponse.json(
        { error: "Template name already exists in this workspace." },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: updateError.message }, { status: 400 });
  }

  await logWorkspaceAudit({
    workspaceId: template.workspace_id,
    actorUserId: user.id,
    action: "template.updated",
    entityType: "template",
    entityId: template.id,
    metadata: {
      name,
      campaignType,
    },
  });

  return NextResponse.json({
    ok: true,
    template: updatedTemplate,
  });
}
