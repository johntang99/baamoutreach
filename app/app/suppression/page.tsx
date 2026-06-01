import {
  PageHeader,
  SectionCard,
} from "@/components/product/page-primitives";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getOrCreatePrimaryWorkspace } from "@/lib/workspaces";
import { isMissingTableError, toSafeText } from "@/lib/single-send";
import { logWorkspaceAudit } from "@/lib/audit";

export default async function SuppressionPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const errorMessage =
    typeof params.error === "string" ? decodeURIComponent(params.error) : null;
  const message =
    typeof params.message === "string" ? decodeURIComponent(params.message) : null;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?next=/app/suppression");
  }

  const workspace = await getOrCreatePrimaryWorkspace(user, supabase);

  async function addSuppression(formData: FormData) {
    "use server";

    const email = toSafeText(formData.get("email")).toLowerCase();
    const reason = toSafeText(formData.get("reason"));

    if (!email) {
      redirect(
        "/app/suppression?error=" + encodeURIComponent("Email is required."),
      );
    }

    const serverSupabase = await createClient();
    const {
      data: { user: actionUser },
    } = await serverSupabase.auth.getUser();

    if (!actionUser) {
      redirect("/login?next=/app/suppression");
    }

    const actionWorkspace = await getOrCreatePrimaryWorkspace(
      actionUser,
      serverSupabase,
    );
    const { data: suppressionEntry, error } = await serverSupabase
      .from("suppression_entries")
      .upsert(
      {
        workspace_id: actionWorkspace.workspaceId,
        email,
        reason: reason || "Manual suppression",
        source: "manual",
        created_by: actionUser.id,
      },
      {
        onConflict: "workspace_id,email",
      },
      )
      .select("id")
      .single();

    if (error) {
      if (isMissingTableError(error)) {
        redirect(
          "/app/suppression?error=" +
            encodeURIComponent(
              "Run supabase/migrations/0002_single_send_mvp.sql first.",
            ),
        );
      }
      redirect("/app/suppression?error=" + encodeURIComponent(error.message));
    }

    await logWorkspaceAudit({
      workspaceId: actionWorkspace.workspaceId,
      actorUserId: actionUser.id,
      action: "suppression.upserted",
      entityType: "suppression_entry",
      entityId: suppressionEntry?.id ?? null,
      metadata: {
        email,
        reason: reason || "Manual suppression",
      },
    });

    redirect(
      "/app/suppression?message=" + encodeURIComponent("Suppression entry saved."),
    );
  }

  const { data: entries, error: entriesError } = await supabase
    .from("suppression_entries")
    .select("id, email, reason, source, created_at")
    .eq("workspace_id", workspace.workspaceId)
    .order("created_at", { ascending: false })
    .limit(300);

  const schemaMissing = isMissingTableError(entriesError);

  return (
    <div className="grid gap-3">
      <PageHeader
        title="Suppression"
        description="Central blocklist for unsubscribed, bounced, and policy-blocked recipients."
      />

      {errorMessage ? (
        <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
          {errorMessage}
        </p>
      ) : null}
      {message ? (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
          {message}
        </p>
      ) : null}

      {schemaMissing ? (
        <SectionCard title="Database migration required">
          <p className="text-sm leading-6 text-slate-600">
            Suppression table is not ready. Run
            <code className="mx-1 rounded bg-slate-100 px-1.5 py-0.5 text-xs">
              supabase/migrations/0002_single_send_mvp.sql
            </code>
            and refresh.
          </p>
        </SectionCard>
      ) : (
        <section className="grid gap-3 xl:grid-cols-[1fr_1.3fr]">
          <SectionCard title="Add suppression entry">
            <form action={addSuppression} className="grid gap-3">
              <label className="grid gap-1">
                <span className="text-xs font-medium text-slate-600">Email</span>
                <input
                  name="email"
                  type="email"
                  required
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </label>
              <label className="grid gap-1">
                <span className="text-xs font-medium text-slate-600">Reason</span>
                <input
                  name="reason"
                  type="text"
                  placeholder="Unsubscribed or manual compliance block"
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </label>
              <button
                type="submit"
                className="inline-flex h-9 items-center justify-center rounded-lg border border-blue-700 bg-blue-600 px-3 text-xs font-semibold text-white hover:bg-blue-700"
              >
                Save suppression
              </button>
            </form>
          </SectionCard>

          <SectionCard title="Suppression list">
            {(entries ?? []).length === 0 ? (
              <p className="text-sm text-slate-500">No suppression entries yet.</p>
            ) : (
              <div className="overflow-hidden rounded-xl border border-slate-200">
                <table className="w-full border-collapse text-xs">
                  <thead className="bg-slate-50">
                    <tr>
                      {["Email", "Reason", "Source", "Created"].map((header) => (
                        <th
                          key={header}
                          className="border-b border-slate-200 px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500"
                        >
                          {header}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(entries ?? []).map((entry) => (
                      <tr key={entry.id}>
                        <td className="border-b border-slate-200 px-3 py-2 text-slate-700">
                          {entry.email}
                        </td>
                        <td className="border-b border-slate-200 px-3 py-2 text-slate-700">
                          {entry.reason ?? "-"}
                        </td>
                        <td className="border-b border-slate-200 px-3 py-2 text-slate-700">
                          {entry.source}
                        </td>
                        <td className="border-b border-slate-200 px-3 py-2 text-slate-500">
                          {new Date(entry.created_at).toLocaleDateString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </SectionCard>
        </section>
      )}
    </div>
  );
}
