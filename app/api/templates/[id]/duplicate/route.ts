import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { logWorkspaceAudit } from "@/lib/audit";
import { generateUniqueTemplateName } from "@/lib/templates";

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

  const { data: template, error: templateError } = await supabase
    .from("templates")
    .select(
      "id, workspace_id, name, campaign_type, subject_template, body_template, is_active",
    )
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
      { error: "Viewer role cannot duplicate templates." },
      { status: 403 },
    );
  }

  const uniqueName = await generateUniqueTemplateName(
    supabase,
    template.workspace_id,
    `${template.name} (copy)`,
  );

  const { data: duplicatedTemplate, error: insertError } = await supabase
    .from("templates")
    .insert({
      workspace_id: template.workspace_id,
      name: uniqueName,
      campaign_type: template.campaign_type,
      subject_template: template.subject_template,
      body_template: template.body_template,
      is_active: template.is_active,
      created_by: user.id,
    })
    .select("id, name, campaign_type, subject_template, body_template, is_active, created_at")
    .single();

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 400 });
  }

  await logWorkspaceAudit({
    workspaceId: template.workspace_id,
    actorUserId: user.id,
    action: "template.duplicated",
    entityType: "template",
    entityId: duplicatedTemplate.id,
    metadata: {
      sourceTemplateId: template.id,
    },
  });

  return NextResponse.json(
    {
      ok: true,
      template: duplicatedTemplate,
    },
    { status: 201 },
  );
}
