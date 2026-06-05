import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { toSafeText } from "@/lib/single-send";
import { getOrCreatePrimaryWorkspace } from "@/lib/workspaces";
import { getWorkspaceRole } from "@/lib/workspace-access";
import {
  generateTemplateCandidates,
  type TemplateGenerationInput,
  type TemplateLanguage,
  type TemplateLength,
  type TemplatePurpose,
  type TemplateTone,
} from "@/lib/ai/template-candidates";

function parsePurpose(value: string): TemplatePurpose {
  const normalized = value.trim();
  if (
    normalized === "intro" ||
    normalized === "review_request" ||
    normalized === "follow_up" ||
    normalized === "reengage" ||
    normalized === "referral"
  ) {
    return normalized;
  }
  return "intro";
}

function parseTone(value: string): TemplateTone {
  const normalized = value.trim();
  if (normalized === "friendly" || normalized === "professional" || normalized === "brief") {
    return normalized;
  }
  return "professional";
}

function parseLanguage(value: string): TemplateLanguage {
  const normalized = value.trim();
  if (normalized === "zh-CN" || normalized === "zh-TW" || normalized === "en") {
    return normalized;
  }
  return "en";
}

function parseLength(value: string): TemplateLength {
  const normalized = value.trim();
  if (normalized === "short" || normalized === "medium") {
    return normalized;
  }
  return "short";
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

  const workspace = await getOrCreatePrimaryWorkspace(user, supabase);
  const role = await getWorkspaceRole(workspace.workspaceId, user.id, supabase);
  if (!role) {
    return NextResponse.json({ error: "You cannot access this workspace." }, { status: 403 });
  }
  if (role === "viewer") {
    return NextResponse.json(
      { error: "Viewer role cannot generate AI templates." },
      { status: 403 },
    );
  }

  const input: TemplateGenerationInput = {
    purpose: parsePurpose(toSafeText(payload.purpose, "intro")),
    audience: toSafeText(payload.audience),
    tone: parseTone(toSafeText(payload.tone, "professional")),
    language: parseLanguage(toSafeText(payload.language, "en")),
    cta: toSafeText(payload.cta),
    mustInclude: toSafeText(payload.mustInclude),
    mustAvoid: toSafeText(payload.mustAvoid),
    length: parseLength(toSafeText(payload.length, "short")),
  };

  const generated = await generateTemplateCandidates(input);
  if (!generated.ok || !generated.candidates) {
    return NextResponse.json(
      { error: generated.error ?? "Could not generate templates." },
      { status: 400 },
    );
  }

  return NextResponse.json({
    ok: true,
    candidates: generated.candidates,
  });
}
