import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { logWorkspaceAudit } from "@/lib/audit";

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
    payload = {};
  }
  const archive = payload.archive !== false;

  const { data: template, error: templateError } = await supabase
    .from("templates")
    .select("id, workspace_id, is_active")
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
      { error: "Viewer role cannot archive templates." },
      { status: 403 },
    );
  }

  const targetActive = !archive;
  const { data: updatedTemplate, error: updateError } = await supabase
    .from("templates")
    .update({
      is_active: targetActive,
      updated_at: new Date().toISOString(),
    })
    .eq("id", template.id)
    .select("id, name, campaign_type, subject_template, body_template, is_active, created_at")
    .single();

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 400 });
  }

  await logWorkspaceAudit({
    workspaceId: template.workspace_id,
    actorUserId: user.id,
    action: archive ? "template.archived" : "template.unarchived",
    entityType: "template",
    entityId: template.id,
    metadata: {
      isActive: targetActive,
    },
  });

  return NextResponse.json({
    ok: true,
    template: updatedTemplate,
  });
}
