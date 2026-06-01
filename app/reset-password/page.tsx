import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const errorMessage =
    typeof params.error === "string" ? decodeURIComponent(params.error) : null;
  const message =
    typeof params.message === "string" ? decodeURIComponent(params.message) : null;

  async function updatePassword(formData: FormData) {
    "use server";

    const password = String(formData.get("password") ?? "");
    const confirmPassword = String(formData.get("confirm_password") ?? "");

    if (password !== confirmPassword) {
      redirect(
        `/reset-password?error=${encodeURIComponent(
          "Passwords do not match.",
        )}`,
      );
    }

    const supabase = await createClient();
    const { error } = await supabase.auth.updateUser({
      password,
    });

    if (error) {
      redirect(`/reset-password?error=${encodeURIComponent(error.message)}`);
    }

    await supabase.auth.signOut();
    redirect(
      `/login?message=${encodeURIComponent(
        "Password updated. Please log in with your new password.",
      )}`,
    );
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md items-center px-4 py-10">
      <section className="w-full rounded-2xl border border-slate-200 bg-white p-6 shadow-[0_10px_30px_rgba(15,23,42,0.06)]">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-950">Set new password</h1>
        <p className="mt-1 text-sm text-slate-500">
          Create a new password to continue.
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
        <form action={updatePassword} className="mt-5 space-y-3">
          <label className="grid gap-1">
            <span className="text-xs font-medium text-slate-600">New password</span>
            <input
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
              type="password"
              name="password"
              minLength={8}
              required
            />
          </label>
          <label className="grid gap-1">
            <span className="text-xs font-medium text-slate-600">Confirm password</span>
            <input
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
              type="password"
              name="confirm_password"
              minLength={8}
              required
            />
          </label>
          <button
            type="submit"
            className="inline-flex h-9 w-full items-center justify-center rounded-lg border border-blue-700 bg-blue-600 text-xs font-semibold text-white hover:bg-blue-700"
          >
            Update password
          </button>
        </form>
        <p className="mt-4 text-xs text-slate-500">
          Return to{" "}
          <Link href="/login" className="text-blue-600 hover:text-blue-700">
            login
          </Link>
          .
        </p>
      </section>
    </main>
  );
}
