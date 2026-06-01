import {
  PageHeader,
  SectionCard,
  StatCard,
} from "@/components/product/page-primitives";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getOrCreatePrimaryWorkspace } from "@/lib/workspaces";
import { isMissingTableError, toSafeText } from "@/lib/single-send";
import { logWorkspaceAudit } from "@/lib/audit";

export default async function ContactsPage({
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
    redirect("/login?next=/app/contacts");
  }

  const workspace = await getOrCreatePrimaryWorkspace(user, supabase);

  async function createContact(formData: FormData) {
    "use server";

    const fullName = toSafeText(formData.get("full_name"));
    const email = toSafeText(formData.get("email")).toLowerCase();
    const companyName = toSafeText(formData.get("company_name"));
    const notes = toSafeText(formData.get("notes"));

    if (!fullName || !email) {
      redirect(
        "/app/contacts?error=" +
          encodeURIComponent("Full name and email are required."),
      );
    }

    const serverSupabase = await createClient();
    const {
      data: { user: actionUser },
    } = await serverSupabase.auth.getUser();

    if (!actionUser) {
      redirect("/login?next=/app/contacts");
    }

    const actionWorkspace = await getOrCreatePrimaryWorkspace(
      actionUser,
      serverSupabase,
    );
    const { data: insertedContact, error } = await serverSupabase
      .from("contacts")
      .insert({
      workspace_id: actionWorkspace.workspaceId,
      full_name: fullName,
      email,
      company_name: companyName || null,
      notes: notes || null,
      status: "active",
        created_by: actionUser.id,
      })
      .select("id")
      .single();

    if (error) {
      if (isMissingTableError(error)) {
        redirect(
          "/app/contacts?error=" +
            encodeURIComponent(
              "Run supabase/migrations/0002_single_send_mvp.sql first.",
            ),
        );
      }

      redirect(
        "/app/contacts?error=" + encodeURIComponent(error.message),
      );
    }

    await logWorkspaceAudit({
      workspaceId: actionWorkspace.workspaceId,
      actorUserId: actionUser.id,
      action: "contact.created",
      entityType: "contact",
      entityId: insertedContact?.id ?? null,
      metadata: {
        fullName,
        email,
        companyName: companyName || null,
      },
    });

    redirect(
      "/app/contacts?message=" + encodeURIComponent("Contact created."),
    );
  }

  const { data: contacts, error: contactsError } = await supabase
    .from("contacts")
    .select("id, full_name, email, company_name, created_at")
    .eq("workspace_id", workspace.workspaceId)
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(300);

  const { count: suppressionCount, error: suppressionCountError } = await supabase
    .from("suppression_entries")
    .select("id", { count: "exact", head: true })
    .eq("workspace_id", workspace.workspaceId);

  const schemaMissing =
    isMissingTableError(contactsError) || isMissingTableError(suppressionCountError);

  const totalContacts = contacts?.length ?? 0;
  const totalSuppressed = suppressionCount ?? 0;
  const deliverableCount = Math.max(0, totalContacts - totalSuppressed);
  const deliverablePercent =
    totalContacts > 0
      ? `${Math.round((deliverableCount / totalContacts) * 100)}%`
      : "0%";

  return (
    <div className="grid gap-3">
      <PageHeader
        title="Contacts"
        description="Contact intelligence with quality checks, dedupe, and segmentation."
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

      <section className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Total contacts"
          value={String(totalContacts)}
          detail="Active contacts"
        />
        <StatCard
          label="Suppressed"
          value={String(totalSuppressed)}
          detail="Blocked addresses"
        />
        <StatCard
          label="Deliverable"
          value={deliverablePercent}
          detail="Based on current suppression list"
        />
        <StatCard
          label="Workspace"
          value={workspace.role}
          detail={workspace.workspaceName}
        />
      </section>

      {schemaMissing ? (
        <SectionCard title="Database migration required">
          <p className="text-sm leading-6 text-slate-600">
            Contacts tables are not ready yet. Run
            <code className="mx-1 rounded bg-slate-100 px-1.5 py-0.5 text-xs">
              supabase/migrations/0002_single_send_mvp.sql
            </code>
            and refresh this page.
          </p>
        </SectionCard>
      ) : (
        <section className="grid gap-3 xl:grid-cols-[1fr_1.2fr]">
          <SectionCard title="Add contact">
            <form action={createContact} className="grid gap-3">
              <label className="grid gap-1">
                <span className="text-xs font-medium text-slate-600">Full name</span>
                <input
                  name="full_name"
                  type="text"
                  required
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </label>
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
                <span className="text-xs font-medium text-slate-600">Company name</span>
                <input
                  name="company_name"
                  type="text"
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </label>
              <label className="grid gap-1">
                <span className="text-xs font-medium text-slate-600">Notes</span>
                <textarea
                  name="notes"
                  rows={3}
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </label>
              <button
                type="submit"
                className="inline-flex h-9 items-center justify-center rounded-lg border border-blue-700 bg-blue-600 px-3 text-xs font-semibold text-white hover:bg-blue-700"
              >
                Save contact
              </button>
            </form>
          </SectionCard>

          <SectionCard title="Active contacts">
            {totalContacts === 0 ? (
              <p className="text-sm text-slate-500">
                No contacts yet. Add your first contact to start sending.
              </p>
            ) : (
              <div className="overflow-hidden rounded-xl border border-slate-200">
                <table className="w-full border-collapse text-xs">
                  <thead className="bg-slate-50">
                    <tr>
                      {["Name", "Email", "Company", "Created"].map((header) => (
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
                    {(contacts ?? []).map((contact) => (
                      <tr key={contact.id}>
                        <td className="border-b border-slate-200 px-3 py-2 text-slate-700">
                          {contact.full_name}
                        </td>
                        <td className="border-b border-slate-200 px-3 py-2 text-slate-700">
                          {contact.email}
                        </td>
                        <td className="border-b border-slate-200 px-3 py-2 text-slate-700">
                          {contact.company_name ?? "-"}
                        </td>
                        <td className="border-b border-slate-200 px-3 py-2 text-slate-500">
                          {new Date(contact.created_at).toLocaleDateString()}
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
