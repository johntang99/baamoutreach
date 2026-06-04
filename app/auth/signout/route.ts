import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const requestUrl = new URL(request.url);
  const supabase = await createClient();
  await supabase.auth.signOut();

  const formData = await request.formData().catch(() => null);
  const nextRaw = formData?.get("next");
  const next =
    typeof nextRaw === "string" && nextRaw.startsWith("/") ? nextRaw : "/login";

  return NextResponse.redirect(new URL(next, requestUrl.origin), { status: 303 });
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  return NextResponse.redirect(new URL("/login", requestUrl.origin));
}
