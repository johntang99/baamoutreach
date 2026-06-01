import { AppShell } from "@/components/product/app-shell";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { hasSupabaseEnv } from "@/lib/supabase/env";
import { getOrCreatePrimaryWorkspace } from "@/lib/workspaces";
import { redirect } from "next/navigation";

export default async function ProductLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  if (!hasSupabaseEnv()) {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-2xl items-center px-4 py-10">
        <section className="w-full rounded-2xl border border-amber-200 bg-amber-50 p-6">
          <h1 className="text-2xl font-semibold tracking-tight text-amber-900">
            Supabase not configured yet
          </h1>
          <p className="mt-2 text-sm leading-6 text-amber-800">
            To enable authentication and workspace tenancy, add
            ` NEXT_PUBLIC_SUPABASE_URL ` and
            ` NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ` (or `NEXT_PUBLIC_SUPABASE_ANON_KEY`)
            in your local environment.
          </p>
          <p className="mt-4 text-sm">
            <Link
              href="/docs/implementation-plan"
              className="font-medium text-amber-900 underline"
            >
              Open implementation plan
            </Link>
          </p>
        </section>
      </main>
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?next=/app");
  }

  const workspace = await getOrCreatePrimaryWorkspace(user, supabase);

  return (
    <AppShell
      workspaceName={workspace.workspaceName}
      roleLabel={workspace.role}
      userEmail={user.email ?? "user"}
    >
      {children}
    </AppShell>
  );
}
