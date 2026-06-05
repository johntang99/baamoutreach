import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isMissingTableError, toSafeText } from "@/lib/single-send";

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

export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const url = new URL(request.url);
  const purpose = toSafeText(url.searchParams.get("purpose"));
  const language = toSafeText(url.searchParams.get("language"));
  const tone = toSafeText(url.searchParams.get("tone"));
  const pageRaw = Number(url.searchParams.get("page") ?? 1);
  const pageSizeRaw = Number(url.searchParams.get("pageSize") ?? 20);
  const page = Number.isFinite(pageRaw) ? Math.max(1, Math.floor(pageRaw)) : 1;
  const pageSize = Number.isFinite(pageSizeRaw)
    ? Math.min(100, Math.max(1, Math.floor(pageSizeRaw)))
    : 20;
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabase
    .from("template_samples")
    .select(
      "id, sample_key, name, purpose, campaign_type, language, tone, subject_template, body_template, tags, sort_order",
      { count: "exact" },
    )
    .eq("is_active", true)
    .order("purpose", { ascending: true })
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true })
    .range(from, to);

  if (purpose) query = query.eq("purpose", purpose);
  if (language) query = query.eq("language", language);
  if (tone) query = query.eq("tone", tone);

  const { data, error, count } = await query;
  if (error) {
    if (isTemplateSamplesMissing(error)) {
      return NextResponse.json(
        {
          error:
            "Starter template library is not ready. Run supabase/migrations/0010_template_starter_library.sql first.",
        },
        { status: 400 },
      );
    }
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({
    items: data ?? [],
    page,
    pageSize,
    total: count ?? 0,
  });
}
