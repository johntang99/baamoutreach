import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { PageHeader, SectionCard } from "@/components/product/page-primitives";
import { createClient } from "@/lib/supabase/server";
import { getOrCreatePrimaryWorkspace } from "@/lib/workspaces";
import { isMissingTableError } from "@/lib/single-send";

export default async function ListDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const errorMessage =
    typeof query.error === "string" ? decodeURIComponent(query.error) : null;
  const message =
    typeof query.message === "string" ? decodeURIComponent(query.message) : null;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/login?next=/app/lists/${id}`);
  }

  const workspace = await getOrCreatePrimaryWorkspace(user, supabase);

  const { data: list, error: listError } = await supabase
    .from("audience_lists")
    .select(
      "id, name, status, source_filename, raw_row_count, valid_row_count, deduped_row_count, suppressed_row_count, ready_row_count, processing_notes, default_language, created_at",
    )
    .eq("workspace_id", workspace.workspaceId)
    .eq("id", id)
    .maybeSingle();

  if (listError) {
    if (isMissingTableError(listError)) {
      return (
        <SectionCard title="Database migration required">
          <p className="text-sm leading-6 text-slate-600">
            Lists tables are not ready. Run
            <code className="mx-1 rounded bg-slate-100 px-1.5 py-0.5 text-xs">
              supabase/migrations/0008_lists_mvp.sql
            </code>
            and refresh.
          </p>
        </SectionCard>
      );
    }
    throw listError;
  }

  if (!list) {
    notFound();
  }

  const { data: entries, error: entriesError } = await supabase
    .from("audience_list_entries")
    .select("id, email, full_name, company_name, language, is_suppressed, created_at")
    .eq("workspace_id", workspace.workspaceId)
    .eq("list_id", list.id)
    .order("created_at", { ascending: true })
    .limit(300);

  if (entriesError) {
    throw entriesError;
  }

  return (
    <div className="grid gap-3">
      <PageHeader
        title={`List: ${list.name}`}
        description="List detail, dedupe/suppression outcomes, and campaign handoff."
        actions={
          <Link
            href={`/app/campaigns?listId=${list.id}`}
            className="inline-flex h-9 items-center rounded-lg border border-blue-700 bg-blue-600 px-3 text-xs font-semibold text-white hover:bg-blue-700"
          >
            Create campaign from this list
          </Link>
        }
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

      <section className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
        <article className="rounded-xl border border-slate-200 bg-white p-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500">
            Status
          </p>
          <p className="mt-1 text-2xl font-semibold tracking-tight text-slate-950">
            {list.status}
          </p>
        </article>
        <article className="rounded-xl border border-slate-200 bg-white p-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500">
            Raw rows
          </p>
          <p className="mt-1 text-2xl font-semibold tracking-tight text-slate-950">
            {list.raw_row_count}
          </p>
        </article>
        <article className="rounded-xl border border-slate-200 bg-white p-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500">
            Valid rows
          </p>
          <p className="mt-1 text-2xl font-semibold tracking-tight text-slate-950">
            {list.valid_row_count}
          </p>
        </article>
        <article className="rounded-xl border border-slate-200 bg-white p-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500">
            Deduped rows
          </p>
          <p className="mt-1 text-2xl font-semibold tracking-tight text-slate-950">
            {list.deduped_row_count}
          </p>
        </article>
        <article className="rounded-xl border border-slate-200 bg-white p-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500">
            Ready rows
          </p>
          <p className="mt-1 text-2xl font-semibold tracking-tight text-slate-950">
            {list.ready_row_count}
          </p>
          <p className="text-[11px] text-slate-500">
            Suppressed {list.suppressed_row_count}
          </p>
        </article>
      </section>

      <SectionCard title="List source">
        <p className="text-sm text-slate-600">
          File: <span className="font-medium text-slate-800">{list.source_filename ?? "-"}</span>
        </p>
        <p className="mt-1 text-sm text-slate-600">
          Default language:{" "}
          <span className="font-medium text-slate-800">
            {(list.default_language ?? "en").toUpperCase()}
          </span>
        </p>
        <p className="mt-1 text-xs text-slate-500">
          Created: {new Date(list.created_at).toLocaleString()}
        </p>
        {list.processing_notes ? (
          <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
            Notes: {list.processing_notes}
          </p>
        ) : null}
      </SectionCard>

      <SectionCard title="How to send this list">
        <ol className="list-decimal space-y-2 pl-5 text-sm text-slate-600">
          <li>Click &quot;Create campaign from this list&quot; in the page header.</li>
          <li>Pick a template and optional template variant set in Campaign setup.</li>
          <li>Prepare recipients, then open queued recipients in Gmail and mark sent.</li>
        </ol>
      </SectionCard>

      <SectionCard title="Entries (first 300)">
        {(entries ?? []).length === 0 ? (
          <p className="text-sm text-slate-500">No entries found in this list.</p>
        ) : (
          <div className="overflow-hidden rounded-xl border border-slate-200">
            <table className="w-full border-collapse text-xs">
              <thead className="bg-slate-50">
                <tr>
                  {["Email", "Name", "Company", "Language", "Suppressed", "Created"].map((header) => (
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
                      {entry.full_name}
                    </td>
                    <td className="border-b border-slate-200 px-3 py-2 text-slate-700">
                      {entry.company_name ?? "-"}
                    </td>
                    <td className="border-b border-slate-200 px-3 py-2 text-slate-700">
                      {(entry.language ?? "en").toUpperCase()}
                    </td>
                    <td className="border-b border-slate-200 px-3 py-2 text-slate-700">
                      {entry.is_suppressed ? "Yes" : "No"}
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
    </div>
  );
}
