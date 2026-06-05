import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { toSafeText } from "@/lib/single-send";
import { logWorkspaceAudit } from "@/lib/audit";

async function getAuthorizedTemplate(
  templateId: string,
  userId: string,
  supabase: Awaited<ReturnType<typeof createClient>>,
) {
  const { data: template, error: templateError } = await supabase
    .from("templates")
    .select("id, workspace_id, name")
    .eq("id", templateId)
    .maybeSingle();

  if (templateError) {
    return { error: templateError.message, status: 400 as const };
  }
  if (!template) {
    return { error: "Template not found.", status: 404 as const };
  }

  const { data: membership } = await supabase
    .from("workspace_memberships")
    .select("role")
    .eq("workspace_id", template.workspace_id)
    .eq("user_id", userId)
    .maybeSingle();

  if (!membership) {
    return { error: "You cannot access this template.", status: 403 as const };
  }
  if (membership.role === "viewer") {
    return { error: "Viewer role cannot modify templates.", status: 403 as const };
  }

  return { template };
}

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

  const authCheck = await getAuthorizedTemplate(id, user.id, supabase);
  if ("error" in authCheck) {
    return NextResponse.json({ error: authCheck.error }, { status: authCheck.status });
  }
  const { template } = authCheck;

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

export async function DELETE(
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

  const authCheck = await getAuthorizedTemplate(id, user.id, supabase);
  if ("error" in authCheck) {
    return NextResponse.json({ error: authCheck.error }, { status: authCheck.status });
  }
  const { template } = authCheck;

  const { error: deleteError } = await supabase.from("templates").delete().eq("id", template.id);
  if (deleteError) {
    const maybeCode = (deleteError as { code?: string }).code;
    if (maybeCode === "23503") {
      return NextResponse.json(
        {
          error:
            "Template is used by an existing campaign and cannot be deleted. Archive it instead.",
        },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: deleteError.message }, { status: 400 });
  }

  await logWorkspaceAudit({
    workspaceId: template.workspace_id,
    actorUserId: user.id,
    action: "template.deleted",
    entityType: "template",
    entityId: template.id,
    metadata: {
      name: template.name,
    },
  });

  return NextResponse.json({
    ok: true,
    deletedTemplateId: template.id,
  });
}
