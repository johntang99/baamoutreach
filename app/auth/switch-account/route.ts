import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

function toSafeNextPath(next: string | null) {
  if (!next || !next.startsWith("/")) return "/login";
  if (next.startsWith("//")) return "/login";
  return next;
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const nextPath = toSafeNextPath(url.searchParams.get("next"));
  const supabase = await createClient();

  // Best-effort signout so invite links can force switching accounts.
  await supabase.auth.signOut();

  return NextResponse.redirect(new URL(nextPath, url.origin), { status: 303 });
}
