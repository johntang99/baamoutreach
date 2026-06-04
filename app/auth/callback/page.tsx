"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

function toSafeNextPath(next: string | null) {
  if (!next || !next.startsWith("/")) return "/app";
  if (next.startsWith("//")) return "/app";
  return next;
}

function parseHashParams() {
  if (typeof window === "undefined") return new URLSearchParams();
  const hash = window.location.hash.startsWith("#")
    ? window.location.hash.slice(1)
    : window.location.hash;
  return new URLSearchParams(hash);
}

export default function AuthCallbackPage() {
  const router = useRouter();
  const [status, setStatus] = useState("Finishing sign-in...");
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    const run = async () => {
      const queryParams = new URLSearchParams(window.location.search);
      const code = queryParams.get("code");
      const queryError =
        queryParams.get("error_description") ?? queryParams.get("error");

      const hashParams = parseHashParams();
      const hashType = hashParams.get("type");
      const accessToken = hashParams.get("access_token");
      const refreshToken = hashParams.get("refresh_token");
      const hashError =
        hashParams.get("error_description") ?? hashParams.get("error");

      const nextFromQuery = queryParams.get("next");
      const inferredNext =
        hashType === "recovery" && !nextFromQuery ? "/reset-password" : "/app";
      const nextPath = toSafeNextPath(nextFromQuery ?? inferredNext);

      const redirectToLogin = (message: string) => {
        router.replace(
          `/login?error=${encodeURIComponent(message)}&next=${encodeURIComponent(nextPath)}`,
        );
      };

      let supabase;
      try {
        supabase = createClient();
      } catch {
        redirectToLogin("Authentication is not configured for this environment.");
        return;
      }

      if (queryError || hashError) {
        redirectToLogin(queryError ?? hashError ?? "Authentication failed");
        return;
      }

      // PKCE / OAuth callback flow.
      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (error) {
          redirectToLogin(error.message);
          return;
        }
      } else if (accessToken && refreshToken) {
        // Email confirmation / magic-link flow where tokens arrive in URL hash.
        const { error } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });
        if (error) {
          redirectToLogin(error.message);
          return;
        }
      }

      setStatus("Redirecting...");
      router.replace(nextPath);
    };

    void run();
  }, [router]);

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md items-center px-4 py-10">
      <section className="w-full rounded-2xl border border-slate-200 bg-white p-6 shadow-[0_10px_30px_rgba(15,23,42,0.06)]">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-950">
          Confirming your session
        </h1>
        <p className="mt-2 text-sm text-slate-500">{status}</p>
      </section>
    </main>
  );
}
