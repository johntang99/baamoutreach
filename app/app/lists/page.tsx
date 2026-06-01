import Link from "next/link";
import { redirect } from "next/navigation";
import { PageHeader, SectionCard } from "@/components/product/page-primitives";
import { createClient } from "@/lib/supabase/server";
import { getOrCreatePrimaryWorkspace } from "@/lib/workspaces";
import { getWorkspaceRole } from "@/lib/workspace-access";
import { isMissingTableError, toSafeText } from "@/lib/single-send";
import {
  assertRequiredListFormat,
  parseSpreadsheetRows,
  toListCandidate,
  type ListLanguage,
} from "@/lib/lists";
import { logWorkspaceAudit } from "@/lib/audit";

function chunkArray<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

function parseListLanguage(value: FormDataEntryValue | null): ListLanguage {
  const normalized = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (normalized === "zh" || normalized === "es") {
    return normalized;
  }
  return "en";
}

export default async function ListsPage({
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
    redirect("/login?next=/app/lists");
  }

  const workspace = await getOrCreatePrimaryWorkspace(user, supabase);

  async function uploadList(formData: FormData) {
    "use server";

    const name = toSafeText(formData.get("name"));
    const fileLike = formData.get("list_file");
    const defaultLanguage = parseListLanguage(formData.get("default_language"));

    if (!name) {
      redirect("/app/lists?error=" + encodeURIComponent("List name is required."));
    }

    if (!(fileLike instanceof File) || fileLike.size === 0) {
      redirect(
        "/app/lists?error=" +
          encodeURIComponent("CSV or Excel file is required."),
      );
    }

    const serverSupabase = await createClient();
    const {
      data: { user: actionUser },
    } = await serverSupabase.auth.getUser();

    if (!actionUser) {
      redirect("/login?next=/app/lists");
    }

    const actionWorkspace = await getOrCreatePrimaryWorkspace(
      actionUser,
      serverSupabase,
    );
    const actorRole = await getWorkspaceRole(
      actionWorkspace.workspaceId,
      actionUser.id,
      serverSupabase,
    );
    if (!actorRole || actorRole === "viewer") {
      redirect(
        "/app/lists?error=" + encodeURIComponent("Viewer role cannot upload lists."),
      );
    }

    const { data: insertedList, error: insertListError } = await serverSupabase
      .from("audience_lists")
      .insert({
        workspace_id: actionWorkspace.workspaceId,
        name,
        source_filename: fileLike.name,
        default_language: defaultLanguage,
        status: "processing",
        created_by: actionUser.id,
      })
      .select("id")
      .single();

    if (insertListError || !insertedList) {
      if (isMissingTableError(insertListError)) {
        redirect(
          "/app/lists?error=" +
            encodeURIComponent("Run supabase/migrations/0008_lists_mvp.sql first."),
        );
      }
      redirect(
        "/app/lists?error=" +
          encodeURIComponent(insertListError?.message ?? "Could not create list."),
      );
    }

    try {
      const parsedRows = await parseSpreadsheetRows(fileLike);
      assertRequiredListFormat(parsedRows);
      const rawRowCount = parsedRows.length;

      const { data: suppressionRows, error: suppressionError } = await serverSupabase
        .from("suppression_entries")
        .select("email")
        .eq("workspace_id", actionWorkspace.workspaceId);

      if (suppressionError && !isMissingTableError(suppressionError)) {
        throw suppressionError;
      }

      const suppressionSet = new Set(
        (suppressionRows ?? []).map((row) => row.email.toLowerCase()),
      );

      let validRowCount = 0;
      const dedupe = new Set<string>();
      const candidates: Array<{
        email: string;
        fullName: string;
        companyName: string | null;
        sourceRow: Record<string, string>;
        language: ListLanguage;
      }> = [];

      for (const row of parsedRows) {
        const candidate = toListCandidate(row, defaultLanguage);
        if (!candidate) continue;
        validRowCount += 1;
        if (dedupe.has(candidate.email)) continue;
        dedupe.add(candidate.email);
        candidates.push(candidate);
      }

      const dedupedRowCount = candidates.length;
      const emailToContactId = new Map<string, string>();
      for (const emailChunk of chunkArray(
        candidates.map((item) => item.email),
        500,
      )) {
        const { data: matchingContacts, error: contactLookupError } =
          await serverSupabase
            .from("contacts")
            .select("id, email")
            .eq("workspace_id", actionWorkspace.workspaceId)
            .in("email", emailChunk);

        if (contactLookupError && !isMissingTableError(contactLookupError)) {
          throw contactLookupError;
        }

        for (const contact of matchingContacts ?? []) {
          emailToContactId.set(contact.email.toLowerCase(), contact.id);
        }
      }

      let suppressedRowCount = 0;
      const entryRows = candidates.map((candidate) => {
        const suppressed = suppressionSet.has(candidate.email);
        if (suppressed) suppressedRowCount += 1;
        return {
          workspace_id: actionWorkspace.workspaceId,
          list_id: insertedList.id,
          contact_id: emailToContactId.get(candidate.email) ?? null,
          email: candidate.email,
          full_name: candidate.fullName,
          company_name: candidate.companyName,
          language: candidate.language,
          is_suppressed: suppressed,
          source_row: candidate.sourceRow,
        };
      });

      for (const entryChunk of chunkArray(entryRows, 500)) {
        const { error: insertEntryError } = await serverSupabase
          .from("audience_list_entries")
          .insert(entryChunk);
        if (insertEntryError) throw insertEntryError;
      }

      const readyRowCount = dedupedRowCount - suppressedRowCount;
      const { error: completeError } = await serverSupabase
        .from("audience_lists")
        .update({
          status: "ready",
          raw_row_count: rawRowCount,
          valid_row_count: validRowCount,
          deduped_row_count: dedupedRowCount,
          suppressed_row_count: suppressedRowCount,
          ready_row_count: readyRowCount,
          updated_at: new Date().toISOString(),
        })
        .eq("id", insertedList.id);

      if (completeError) throw completeError;

      await logWorkspaceAudit({
        workspaceId: actionWorkspace.workspaceId,
        actorUserId: actionUser.id,
        action: "lists.upload_completed",
        entityType: "audience_list",
        entityId: insertedList.id,
        metadata: {
          sourceFilename: fileLike.name,
          rawRowCount,
          validRowCount,
          dedupedRowCount,
          suppressedRowCount,
          readyRowCount,
        },
      });

      redirect(
        "/app/lists?message=" +
          encodeURIComponent(
            `List uploaded: ${readyRowCount} ready, ${suppressedRowCount} suppressed.`,
          ),
      );
    } catch (error) {
      const digest =
        error && typeof error === "object" && "digest" in error
          ? String((error as { digest?: unknown }).digest ?? "")
          : "";
      if (digest.startsWith("NEXT_REDIRECT")) {
        throw error;
      }

      const reason =
        error instanceof Error
          ? error.message
          : "Could not parse the uploaded file.";
      await serverSupabase
        .from("audience_lists")
        .update({
          status: "failed",
          processing_notes: reason,
          updated_at: new Date().toISOString(),
        })
        .eq("id", insertedList.id);

      redirect("/app/lists?error=" + encodeURIComponent(reason));
    }
  }

  const { data: lists, error: listsError } = await supabase
    .from("audience_lists")
    .select(
      "id, name, source_filename, status, raw_row_count, deduped_row_count, suppressed_row_count, ready_row_count, default_language, created_at",
    )
    .eq("workspace_id", workspace.workspaceId)
    .order("created_at", { ascending: false })
    .limit(100);

  const schemaMissing = isMissingTableError(listsError);
  if (listsError && !schemaMissing) {
    throw listsError;
  }

  const safeLists = lists ?? [];
  const totalReady = safeLists.reduce((acc, row) => acc + row.ready_row_count, 0);
  const totalSuppressed = safeLists.reduce(
    (acc, row) => acc + row.suppressed_row_count,
    0,
  );

  return (
    <div className="grid gap-3">
      <PageHeader
        title="Lists"
        description="Audience list manager for imports, filters, and campaign-ready list snapshots."
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
            Lists tables are not ready. Run
            <code className="mx-1 rounded bg-slate-100 px-1.5 py-0.5 text-xs">
              supabase/migrations/0008_lists_mvp.sql
            </code>
            and refresh.
          </p>
        </SectionCard>
      ) : (
        <>
          <section className="grid gap-3 xl:grid-cols-[1fr_1.4fr]">
            <SectionCard title="Upload list (CSV or Excel)">
              <form action={uploadList} className="grid gap-3">
                <label className="grid gap-1">
                  <span className="text-xs font-medium text-slate-600">List name</span>
                  <input
                    name="name"
                    type="text"
                    required
                    placeholder="TCM NYC May 2026"
                    className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                </label>
                <label className="grid gap-1">
                  <span className="text-xs font-medium text-slate-600">Default language</span>
                  <select
                    name="default_language"
                    defaultValue="en"
                    className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  >
                    <option value="en">English</option>
                    <option value="zh">Chinese</option>
                    <option value="es">Spanish</option>
                  </select>
                </label>
                <label className="grid gap-1">
                  <span className="text-xs font-medium text-slate-600">
                    CSV / Excel file
                  </span>
                  <input
                    name="list_file"
                    type="file"
                    accept=".csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
                    required
                    className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                </label>
                <div className="flex items-center gap-3 text-xs">
                  <a
                    href="/api/lists/sample?format=csv"
                    className="font-medium text-blue-600 hover:text-blue-700"
                  >
                    Download sample CSV
                  </a>
                  <a
                    href="/api/lists/sample?format=xlsx"
                    className="font-medium text-blue-600 hover:text-blue-700"
                  >
                    Download sample Excel
                  </a>
                </div>
                <p className="text-xs text-slate-500">
                  Required columns: <strong>email</strong>, <strong>name</strong>.
                  Optional: company, language. Supported language values: en/zh/es
                  (or English/Chinese/Spanish).
                </p>
                <button
                  type="submit"
                  className="inline-flex h-9 items-center justify-center rounded-lg border border-blue-700 bg-blue-600 px-3 text-xs font-semibold text-white hover:bg-blue-700"
                >
                  Upload and process
                </button>
              </form>
            </SectionCard>

            <SectionCard title="List pipeline">
              <ul className="space-y-2 text-sm text-slate-600">
                <li className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                  Uploaded: CSV/Excel rows ingested.
                </li>
                <li className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                  Validated: rows missing valid email or name are dropped.
                </li>
                <li className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                  Cleaned: dedupe by normalized email.
                </li>
                <li className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                  Ready: suppressed rows flagged, remaining rows can be used in campaign creation.
                </li>
              </ul>
              <div className="mt-3 grid gap-2 sm:grid-cols-3">
                <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
                  <p className="text-[10px] uppercase tracking-[0.08em] text-slate-500">
                    Lists
                  </p>
                  <p className="text-lg font-semibold text-slate-900">
                    {safeLists.length}
                  </p>
                </div>
                <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
                  <p className="text-[10px] uppercase tracking-[0.08em] text-slate-500">
                    Ready rows
                  </p>
                  <p className="text-lg font-semibold text-slate-900">{totalReady}</p>
                </div>
                <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
                  <p className="text-[10px] uppercase tracking-[0.08em] text-slate-500">
                    Suppressed rows
                  </p>
                  <p className="text-lg font-semibold text-slate-900">{totalSuppressed}</p>
                </div>
              </div>
            </SectionCard>
          </section>

          <SectionCard title="How to send lists">
            <ol className="list-decimal space-y-2 pl-5 text-sm text-slate-600">
              <li>
                Upload a list with <strong>email + name</strong> (company/language
                optional).
              </li>
              <li>
                Open <strong>View detail</strong> to review parsing stats and optional
                AI content variants.
              </li>
              <li>
                Click <strong>Create campaign from this list</strong> and choose a
                template.
              </li>
              <li>
                In campaign detail, use <strong>Open next in Gmail</strong> then{" "}
                <strong>Mark sent</strong> until complete.
              </li>
            </ol>
          </SectionCard>

          <SectionCard title="Current lists">
            {safeLists.length === 0 ? (
              <p className="text-sm text-slate-500">
                No lists yet. Upload your first CSV list above.
              </p>
            ) : (
              <div className="overflow-hidden rounded-xl border border-slate-200">
                <table className="w-full border-collapse text-xs">
                  <thead className="bg-slate-50">
                    <tr>
                      {[
                        "List",
                        "Lang",
                        "Status",
                        "Rows",
                        "Ready",
                        "Suppressed",
                        "Created",
                        "Actions",
                      ].map((header) => (
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
                    {safeLists.map((list) => (
                      <tr key={list.id}>
                        <td className="border-b border-slate-200 px-3 py-2 text-slate-700">
                          <p className="font-medium">{list.name}</p>
                          <p className="text-[11px] text-slate-500">
                            {list.source_filename ?? "-"}
                          </p>
                        </td>
                        <td className="border-b border-slate-200 px-3 py-2 text-slate-700">
                          {(list.default_language ?? "en").toUpperCase()}
                        </td>
                        <td className="border-b border-slate-200 px-3 py-2 text-slate-700">
                          {list.status}
                        </td>
                        <td className="border-b border-slate-200 px-3 py-2 text-slate-700">
                          {list.deduped_row_count}/{list.raw_row_count}
                        </td>
                        <td className="border-b border-slate-200 px-3 py-2 text-slate-700">
                          {list.ready_row_count}
                        </td>
                        <td className="border-b border-slate-200 px-3 py-2 text-slate-700">
                          {list.suppressed_row_count}
                        </td>
                        <td className="border-b border-slate-200 px-3 py-2 text-slate-500">
                          {new Date(list.created_at).toLocaleDateString()}
                        </td>
                        <td className="border-b border-slate-200 px-3 py-2">
                          <div className="flex items-center gap-3">
                            <Link
                              href={`/app/lists/${list.id}`}
                              className="font-medium text-blue-600 hover:text-blue-700"
                            >
                              View detail
                            </Link>
                            <Link
                              href={`/app/campaigns?listId=${list.id}`}
                              className="font-medium text-blue-600 hover:text-blue-700"
                            >
                              Use in campaign
                            </Link>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </SectionCard>
        </>
      )}
    </div>
  );
}
