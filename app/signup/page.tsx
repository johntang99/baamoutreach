import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSiteUrl } from "@/lib/supabase/env";
import { PasswordField } from "@/components/auth/password-field";

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const errorMessage =
    typeof params.error === "string" ? decodeURIComponent(params.error) : null;
  const message =
    typeof params.message === "string" ? decodeURIComponent(params.message) : null;

  async function signUp(formData: FormData) {
    "use server";

    const fullName = String(formData.get("full_name") ?? "").trim();
    const email = String(formData.get("email") ?? "").trim();
    const password = String(formData.get("password") ?? "");

    if (password.length < 8) {
      redirect(
        `/signup?error=${encodeURIComponent(
          "Password must be at least 8 characters.",
        )}`,
      );
    }

    const supabase = await createClient();
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${getSiteUrl()}/auth/callback?next=/app`,
        data: {
          full_name: fullName,
        },
      },
    });

    if (error) {
      redirect(`/signup?error=${encodeURIComponent(error.message)}`);
    }

    if (data.session) {
      redirect("/app");
    }

    redirect(
      `/signup?message=${encodeURIComponent(
        "Account created. Check your email to confirm and finish setup.",
      )}`,
    );
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md items-center px-4 py-10">
      <section className="w-full rounded-2xl border border-slate-200 bg-white p-6 shadow-[0_10px_30px_rgba(15,23,42,0.06)]">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-950">Create account</h1>
        <p className="mt-1 text-sm text-slate-500">
          Start your standalone BAAM Outreach workspace.
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
        <form action={signUp} className="mt-5 space-y-3">
          <label className="grid gap-1">
            <span className="text-xs font-medium text-slate-600">Full name</span>
            <input
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
              type="text"
              name="full_name"
              required
            />
          </label>
          <label className="grid gap-1">
            <span className="text-xs font-medium text-slate-600">Work email</span>
            <input
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
              type="email"
              name="email"
              required
            />
          </label>
          <PasswordField name="password" label="Password" minLength={8} required />
          <button
            type="submit"
            className="inline-flex h-9 w-full items-center justify-center rounded-lg border border-blue-700 bg-blue-600 text-xs font-semibold text-white hover:bg-blue-700"
          >
            Create workspace
          </button>
        </form>
        <p className="mt-4 text-xs text-slate-500">
          Already have an account?{" "}
          <Link href="/login" className="text-blue-600 hover:text-blue-700">
            Log in
          </Link>
        </p>
      </section>
    </main>
  );
}
