import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

function toSafeNextPath(next: string | undefined) {
  if (!next || !next.startsWith("/")) return "/app";
  if (next.startsWith("//")) return "/app";
  return next;
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const nextPath = toSafeNextPath(
    typeof params.next === "string" ? params.next : undefined,
  );
  const errorMessage =
    typeof params.error === "string" ? decodeURIComponent(params.error) : null;
  const message =
    typeof params.message === "string" ? decodeURIComponent(params.message) : null;

  async function signIn(formData: FormData) {
    "use server";

    const email = String(formData.get("email") ?? "").trim();
    const password = String(formData.get("password") ?? "");
    const next = toSafeNextPath(String(formData.get("next") ?? "/app"));

    const supabase = await createClient();
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      redirect(`/login?error=${encodeURIComponent(error.message)}&next=${encodeURIComponent(next)}`);
    }

    redirect(next);
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md items-center px-4 py-10">
      <section className="w-full rounded-2xl border border-slate-200 bg-white p-6 shadow-[0_10px_30px_rgba(15,23,42,0.06)]">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-950">Log in</h1>
        <p className="mt-1 text-sm text-slate-500">
          Access your BAAM Outreach workspace.
        </p>
        {errorMessage ? (
          <p className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
            {errorMessage}
          </p>
        ) : null}
        {message ? (
          <p className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
            {message}
          </p>
        ) : null}
        <form action={signIn} className="mt-5 space-y-3">
          <input type="hidden" name="next" value={nextPath} />
          <label className="grid gap-1">
            <span className="text-xs font-medium text-slate-600">Email</span>
            <input
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
              type="email"
              name="email"
              required
            />
          </label>
          <label className="grid gap-1">
            <span className="text-xs font-medium text-slate-600">Password</span>
            <input
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
              type="password"
              name="password"
              required
            />
          </label>
          <button
            type="submit"
            className="inline-flex h-9 w-full items-center justify-center rounded-lg border border-blue-700 bg-blue-600 text-xs font-semibold text-white hover:bg-blue-700"
          >
            Continue
          </button>
        </form>
        <div className="mt-4 flex items-center justify-between text-xs">
          <Link href="/forgot-password" className="text-blue-600 hover:text-blue-700">
            Forgot password?
          </Link>
          <Link href="/signup" className="text-blue-600 hover:text-blue-700">
            Create account
          </Link>
        </div>
      </section>
    </main>
  );
}
