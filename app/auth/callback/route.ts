import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import {
  getSupabasePublishableKey,
  getSupabaseUrl,
  hasSupabaseEnv,
} from "@/lib/supabase/env";

function toSafeNextPath(next: string | null) {
  if (!next || !next.startsWith("/")) return "/app";
  if (next.startsWith("//")) return "/app";
  return next;
}

/**
 * PKCE / OTP confirmation callback.
 *
 * Uses an EXPLICIT response object that's threaded into createServerClient's
 * cookie adapter — `response.cookies.set(...)` is the only way to guarantee
 * the session Set-Cookie headers land on the redirect we return. Earlier we
 * used the shared server `createClient()` which goes through `cookies()`
 * from next/headers; in Next 16 the Set-Cookie attachment behaviour to an
 * explicit `NextResponse.redirect()` is brittle and was losing the freshly-
 * issued session, so the very next request had no auth and middleware
 * bounced the user to /login.
 */
export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const next = toSafeNextPath(requestUrl.searchParams.get("next"));
  const errorDescription = requestUrl.searchParams.get("error_description");

  if (errorDescription) {
    const loginUrl = new URL("/login", requestUrl.origin);
    loginUrl.searchParams.set("error", errorDescription);
    return NextResponse.redirect(loginUrl);
  }

  if (!hasSupabaseEnv()) {
    return NextResponse.redirect(new URL(next, requestUrl.origin));
  }

  // Stage cookies so the destination decision (success → next, error →
  // /login) doesn't orphan any Set-Cookie writes — supabase calls setAll
  // synchronously inside exchangeCodeForSession, before we know which
  // response to return.
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

  let target = new URL(next, requestUrl.origin);
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      target = new URL("/login", requestUrl.origin);
      target.searchParams.set("error", error.message);
    }
  }

  const response = NextResponse.redirect(target);
  for (const c of pendingCookies) {
    response.cookies.set(c.name, c.value, c.options);
  }
  return response;
}
