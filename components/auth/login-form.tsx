"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

interface LoginFormProps {
  nextPath: string;
}

export function LoginForm({ nextPath }: LoginFormProps) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (error) {
      router.replace(
        `/login?error=${encodeURIComponent(error.message)}&next=${encodeURIComponent(nextPath)}`,
      );
      setSubmitting(false);
      return;
    }

    router.replace(nextPath);
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="mt-5 space-y-3">
      <input type="hidden" name="next" value={nextPath} />
      <label className="grid gap-1">
        <span className="text-xs font-medium text-slate-600">Email</span>
        <input
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
          type="email"
          name="email"
          autoComplete="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
        />
      </label>
      <label className="grid gap-1">
        <span className="text-xs font-medium text-slate-600">Password</span>
        <input
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
          type="password"
          name="password"
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
        />
      </label>
      <button
        type="submit"
        disabled={submitting}
        className="inline-flex h-9 w-full items-center justify-center rounded-lg border border-blue-700 bg-blue-600 text-xs font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-70"
      >
        {submitting ? "Signing in..." : "Continue"}
      </button>
    </form>
  );
}
