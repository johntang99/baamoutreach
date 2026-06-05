import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { toSafeText } from "@/lib/single-send";
import { getOrCreatePrimaryWorkspace } from "@/lib/workspaces";
import { getWorkspaceRole } from "@/lib/workspace-access";
import { generateUniqueTemplateName } from "@/lib/templates";
import { logWorkspaceAudit } from "@/lib/audit";

type IncomingCandidate = {
  name?: unknown;
  campaignType?: unknown;
  subjectTemplate?: unknown;
  bodyTemplate?: unknown;
};

const VARIANT_LABELS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

function toCandidate(input: IncomingCandidate) {
  const name = toSafeText(input.name);
  const campaignType = toSafeText(input.campaignType, "general");
  const subjectTemplate = toSafeText(input.subjectTemplate);
  const bodyTemplate = toSafeText(input.bodyTemplate);
  if (!subjectTemplate || !bodyTemplate) return null;
  return {
    name: name || "AI template",
    campaignType,
    subjectTemplate,
    bodyTemplate,
  };
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

  const rawCandidates = Array.isArray(payload.candidates)
    ? (payload.candidates as IncomingCandidate[])
    : [];
  const candidates = rawCandidates
    .map((candidate) => toCandidate(candidate))
    .filter((candidate): candidate is NonNullable<ReturnType<typeof toCandidate>> => {
      return candidate !== null;
    })
    .slice(0, 8);

  if (candidates.length < 2) {
    return NextResponse.json(
      {
        error: "At least 2 valid candidates are required for A/B save.",
      },
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

  const created: Array<{
    id: string;
    name: string;
    campaign_type: string;
    subject_template: string;
    body_template: string;
    is_active: boolean;
    created_at: string;
  }> = [];

  for (let index = 0; index < candidates.length; index += 1) {
    const candidate = candidates[index];
    const label = VARIANT_LABELS[index] ?? `V${index + 1}`;
    const preferredName = `${candidate.name} (${label})`;
    const uniqueName = await generateUniqueTemplateName(
      supabase,
      workspace.workspaceId,
      preferredName,
    );

    const { data: template, error: insertError } = await supabase
      .from("templates")
      .insert({
        workspace_id: workspace.workspaceId,
        name: uniqueName,
        campaign_type: candidate.campaignType || "general",
        subject_template: candidate.subjectTemplate,
        body_template: candidate.bodyTemplate,
        is_active: true,
        created_by: user.id,
      })
      .select(
        "id, name, campaign_type, subject_template, body_template, is_active, created_at",
      )
      .single();

    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 400 });
    }
    created.push(template);

    await logWorkspaceAudit({
      workspaceId: workspace.workspaceId,
      actorUserId: user.id,
      action: "template.created_from_ai_variant",
      entityType: "template",
      entityId: template.id,
      metadata: {
        variantLabel: label,
      },
    });
  }

  return NextResponse.json(
    {
      ok: true,
      templates: created,
      count: created.length,
    },
    { status: 201 },
  );
}
