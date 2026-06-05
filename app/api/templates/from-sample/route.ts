import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isMissingTableError, toSafeText } from "@/lib/single-send";
import { getOrCreatePrimaryWorkspace } from "@/lib/workspaces";
import { generateUniqueTemplateName } from "@/lib/templates";
import { logWorkspaceAudit } from "@/lib/audit";

function isTemplateSamplesMissing(error: unknown) {
  if (isMissingTableError(error)) return true;
  if (!error || typeof error !== "object") return false;
  const maybeCode = (error as { code?: string }).code;
  const maybeMessage = (error as { message?: string }).message ?? "";
  return (
    maybeCode === "PGRST204" ||
    maybeMessage.includes("public.template_samples")
  );
}

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

  const sampleId = toSafeText(payload.sampleId);
  const nameOverride = toSafeText(payload.nameOverride);
  if (!sampleId) {
    return NextResponse.json({ error: "sampleId is required." }, { status: 400 });
  }

  const { data: sample, error: sampleError } = await supabase
    .from("template_samples")
    .select(
      "id, sample_key, name, purpose, campaign_type, language, tone, subject_template, body_template",
    )
    .eq("id", sampleId)
    .eq("is_active", true)
    .maybeSingle();

  if (sampleError) {
    if (isTemplateSamplesMissing(sampleError)) {
      return NextResponse.json(
        {
          error:
            "Starter template library is not ready. Run supabase/migrations/0010_template_starter_library.sql first.",
        },
        { status: 400 },
      );
    }
    return NextResponse.json({ error: sampleError.message }, { status: 400 });
  }

  if (!sample) {
    return NextResponse.json({ error: "Sample template not found." }, { status: 404 });
  }

  const workspace = await getOrCreatePrimaryWorkspace(user, supabase);
  const { data: membership } = await supabase
    .from("workspace_memberships")
    .select("role")
    .eq("workspace_id", workspace.workspaceId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!membership) {
    return NextResponse.json(
      { error: "You cannot access this workspace." },
      { status: 403 },
    );
  }

  if (membership.role === "viewer") {
    return NextResponse.json(
      { error: "Viewer role cannot create templates." },
      { status: 403 },
    );
  }

  const uniqueName = await generateUniqueTemplateName(
    supabase,
    workspace.workspaceId,
    nameOverride || sample.name,
  );

  const { data: template, error: insertError } = await supabase
    .from("templates")
    .insert({
      workspace_id: workspace.workspaceId,
      name: uniqueName,
      campaign_type: sample.campaign_type,
      subject_template: sample.subject_template,
      body_template: sample.body_template,
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
    action: "template.created_from_sample",
    entityType: "template",
    entityId: template.id,
    metadata: {
      sampleId: sample.id,
      sampleKey: sample.sample_key,
      purpose: sample.purpose,
      language: sample.language,
      tone: sample.tone,
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
