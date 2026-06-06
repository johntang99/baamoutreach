import { NextResponse } from "next/server";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { getOrCreatePrimaryWorkspace } from "@/lib/workspaces";
import { getWorkspaceRole } from "@/lib/workspace-access";
import { toSafeText } from "@/lib/single-send";
import { logWorkspaceAudit } from "@/lib/audit";
import { generateTemplateVariantSet } from "@/lib/ai/template-variant-sets";
import {
  parseTemplateVariantLanguage,
  parseTemplateVariantRows,
} from "@/lib/template-variant-sets";

type VariantSetDbRow = {
  id: string;
  workspace_id: string;
  template_id: string;
  name: string;
  language: "en" | "zh" | "es";
  generation_notes: Record<string, unknown>;
  variants: unknown;
  created_by: string;
  created_at: string;
  updated_at: string;
};

async function getTemplateContext(
  templateId: string,
  supabase: Awaited<ReturnType<typeof createClient>>,
  user: User,
) {
  const workspace = await getOrCreatePrimaryWorkspace(user, supabase);
  const role = await getWorkspaceRole(workspace.workspaceId, user.id, supabase);
  if (!role) {
    return { error: "You cannot access this workspace.", status: 403 as const };
  }

  const { data: template, error } = await supabase
    .from("templates")
    .select("id, workspace_id, name, subject_template, body_template")
    .eq("id", templateId)
    .eq("workspace_id", workspace.workspaceId)
    .maybeSingle();

  if (error) {
    return { error: error.message, status: 400 as const };
  }
  if (!template) {
    return { error: "Template not found.", status: 404 as const };
  }

  return {
    workspaceId: workspace.workspaceId,
    role,
    template,
  };
}

function normalizeVariantSetRow(row: VariantSetDbRow) {
  return {
    ...row,
    variants: parseTemplateVariantRows(row.variants),
  };
}

export async function GET(
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

  const templateContext = await getTemplateContext(id, supabase, user);
  if ("error" in templateContext) {
    return NextResponse.json(
      { error: templateContext.error },
      { status: templateContext.status },
    );
  }

  const { data: variantSets, error } = await supabase
    .from("template_variant_sets")
    .select(
      "id, workspace_id, template_id, name, language, generation_notes, variants, created_by, created_at, updated_at",
    )
    .eq("workspace_id", templateContext.workspaceId)
    .eq("template_id", templateContext.template.id)
    .order("created_at", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({
    ok: true,
    items: (variantSets ?? []).map((row) => normalizeVariantSetRow(row as VariantSetDbRow)),
  });
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

  const templateContext = await getTemplateContext(id, supabase, user);
  if ("error" in templateContext) {
    return NextResponse.json(
      { error: templateContext.error },
      { status: templateContext.status },
    );
  }
  if (templateContext.role === "viewer") {
    return NextResponse.json(
      { error: "Viewer role cannot create template variants." },
      { status: 403 },
    );
  }

  let payload: Record<string, unknown> = {};
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 });
  }

  const name = toSafeText(payload.name);
  if (!name) {
    return NextResponse.json({ error: "Variant set name is required." }, { status: 400 });
  }

  const language = parseTemplateVariantLanguage(
    toSafeText(payload.language, "en"),
  );
  const mustInclude = toSafeText(payload.mustInclude);
  const mustAvoid = toSafeText(payload.mustAvoid);

  const generated = await generateTemplateVariantSet({
    baseSubject: templateContext.template.subject_template,
    baseBody: templateContext.template.body_template,
    language,
    mustInclude,
    mustAvoid,
  });

  if (!generated.ok || !generated.variants) {
    return NextResponse.json(
      { error: generated.error ?? "Could not generate variant set." },
      { status: 400 },
    );
  }

  const { data: inserted, error: insertError } = await supabase
    .from("template_variant_sets")
    .insert({
      workspace_id: templateContext.workspaceId,
      template_id: templateContext.template.id,
      name,
      language,
      generation_notes: {
        mustInclude: mustInclude || null,
        mustAvoid: mustAvoid || null,
        fallbackCount: generated.fallbackCount ?? 0,
      },
      variants: generated.variants as unknown as Record<string, unknown>,
      created_by: user.id,
    })
    .select(
      "id, workspace_id, template_id, name, language, generation_notes, variants, created_by, created_at, updated_at",
    )
    .single();

  if (insertError || !inserted) {
    const maybeCode = (insertError as { code?: string } | null)?.code;
    if (maybeCode === "23505") {
      return NextResponse.json(
        { error: "Variant set name already exists for this template." },
        { status: 409 },
      );
    }
    return NextResponse.json(
      { error: insertError?.message ?? "Could not save variant set." },
      { status: 400 },
    );
  }

  await logWorkspaceAudit({
    workspaceId: templateContext.workspaceId,
    actorUserId: user.id,
    action: "template.variant_set_created",
    entityType: "template",
    entityId: templateContext.template.id,
    metadata: {
      variantSetId: inserted.id,
      variantSetName: inserted.name,
      language,
      fallbackCount: generated.fallbackCount ?? 0,
    },
  });

  return NextResponse.json({
    ok: true,
    item: normalizeVariantSetRow(inserted as VariantSetDbRow),
  });
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

  const templateContext = await getTemplateContext(id, supabase, user);
  if ("error" in templateContext) {
    return NextResponse.json(
      { error: templateContext.error },
      { status: templateContext.status },
    );
  }
  if (templateContext.role === "viewer") {
    return NextResponse.json(
      { error: "Viewer role cannot edit template variants." },
      { status: 403 },
    );
  }

  let payload: Record<string, unknown> = {};
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 });
  }

  const setId = toSafeText(payload.setId);
  if (!setId) {
    return NextResponse.json({ error: "Variant set id is required." }, { status: 400 });
  }

  const { data: variantSet, error: setError } = await supabase
    .from("template_variant_sets")
    .select(
      "id, workspace_id, template_id, name, language, generation_notes, variants, created_by, created_at, updated_at",
    )
    .eq("workspace_id", templateContext.workspaceId)
    .eq("template_id", templateContext.template.id)
    .eq("id", setId)
    .maybeSingle();

  if (setError || !variantSet) {
    return NextResponse.json(
      { error: setError?.message ?? "Variant set not found." },
      { status: 404 },
    );
  }

  const nextName = toSafeText(payload.name, variantSet.name);
  const variants = parseTemplateVariantRows(variantSet.variants);
  const indexRaw = payload.index;
  const hasIndexUpdate =
    typeof indexRaw === "number" ||
    (typeof indexRaw === "string" && indexRaw.trim().length > 0);

  if (hasIndexUpdate) {
    const index =
      typeof indexRaw === "number"
        ? indexRaw
        : Number.parseInt(String(indexRaw), 10);
    if (!Number.isInteger(index) || index < 0 || index >= variants.length) {
      return NextResponse.json({ error: "Variant index out of range." }, { status: 400 });
    }
    const subject = toSafeText(payload.subject);
    const body = toSafeText(payload.body);
    if (!subject || !body) {
      return NextResponse.json(
        { error: "Variant subject and body are required." },
        { status: 400 },
      );
    }
    variants[index] = {
      ...variants[index],
      subject,
      body,
      edited_at: new Date().toISOString(),
    };
  }

  const { data: updated, error: updateError } = await supabase
    .from("template_variant_sets")
    .update({
      name: nextName,
      variants: variants as unknown as Record<string, unknown>,
      updated_at: new Date().toISOString(),
    })
    .eq("workspace_id", templateContext.workspaceId)
    .eq("template_id", templateContext.template.id)
    .eq("id", setId)
    .select(
      "id, workspace_id, template_id, name, language, generation_notes, variants, created_by, created_at, updated_at",
    )
    .single();

  if (updateError || !updated) {
    const maybeCode = (updateError as { code?: string } | null)?.code;
    if (maybeCode === "23505") {
      return NextResponse.json(
        { error: "Variant set name already exists for this template." },
        { status: 409 },
      );
    }
    return NextResponse.json(
      { error: updateError?.message ?? "Could not update variant set." },
      { status: 400 },
    );
  }

  await logWorkspaceAudit({
    workspaceId: templateContext.workspaceId,
    actorUserId: user.id,
    action: "template.variant_set_updated",
    entityType: "template",
    entityId: templateContext.template.id,
    metadata: {
      variantSetId: updated.id,
      variantSetName: updated.name,
      editedVariantIndex: hasIndexUpdate ? Number(indexRaw) : null,
    },
  });

  return NextResponse.json({
    ok: true,
    item: normalizeVariantSetRow(updated as VariantSetDbRow),
  });
}
