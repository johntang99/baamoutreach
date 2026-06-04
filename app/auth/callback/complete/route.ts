import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import {
  getSupabasePublishableKey,
  getSupabaseUrl,
  hasSupabaseEnv,
} from "@/lib/supabase/env";

function toSafeNextPath(next: string | null | undefined) {
  if (!next || !next.startsWith("/")) return "/app";
  if (next.startsWith("//")) return "/app";
  return next;
}

interface CallbackCompletePayload {
  code?: string;
  accessToken?: string;
  refreshToken?: string;
  nextPath?: string;
}

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as CallbackCompletePayload;
  const nextPath = toSafeNextPath(body.nextPath);

  if (!hasSupabaseEnv()) {
    return NextResponse.json(
      {
        ok: false,
        error: "Authentication is not configured for this environment.",
      },
      { status: 500 },
    );
  }

  const pendingCookies: Array<{
    name: string;
    value: string;
    options?: Parameters<NextResponse["cookies"]["set"]>[2];
  }> = [];

  const supabase = createServerClient(
    getSupabaseUrl(),
    getSupabasePublishableKey(),
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const c of cookiesToSet) {
            pendingCookies.push({
              name: c.name,
              value: c.value,
              options: c.options,
            });
          }
        },
      },
    },
  );

  if (body.code) {
    const { error } = await supabase.auth.exchangeCodeForSession(body.code);
    if (error) {
      return NextResponse.json(
        {
          ok: false,
          error: error.message,
        },
        { status: 400 },
      );
    }
  } else if (body.accessToken && body.refreshToken) {
    const { error } = await supabase.auth.setSession({
      access_token: body.accessToken,
      refresh_token: body.refreshToken,
    });
    if (error) {
      return NextResponse.json(
        {
          ok: false,
          error: error.message,
        },
        { status: 400 },
      );
    }
  } else {
    return NextResponse.json(
      {
        ok: false,
        error: "Missing callback token payload.",
      },
      { status: 400 },
    );
  }

  const response = NextResponse.json({
    ok: true,
    nextPath,
  });

  for (const c of pendingCookies) {
    response.cookies.set(c.name, c.value, c.options);
  }

  return response;
}
