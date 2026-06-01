import { redirect } from "next/navigation";
import { PageHeader, SectionCard } from "@/components/product/page-primitives";
import { createClient } from "@/lib/supabase/server";
import { getOrCreatePrimaryWorkspace } from "@/lib/workspaces";
import { isMissingTableError } from "@/lib/single-send";

export default async function AuditPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?next=/app/audit");
  }

  const workspace = await getOrCreatePrimaryWorkspace(user, supabase);

  const { data: logs, error: logsError } = await supabase
    .from("workspace_audit_logs")
    .select("id, action, entity_type, entity_id, metadata, created_at")
    .eq("workspace_id", workspace.workspaceId)
    .order("created_at", { ascending: false })
    .limit(300);

  const tableMissing = isMissingTableError(logsError);

  return (
    <div className="grid gap-3">
      <PageHeader
        title="Audit"
        description="Workspace-level audit events for policy, sender, and campaign operations."
      />

      {tableMissing ? (
        <SectionCard title="Database migration required">
          <p className="text-sm leading-6 text-slate-600">
            Audit table is not ready. Run
            <code className="mx-1 rounded bg-slate-100 px-1.5 py-0.5 text-xs">
              supabase/migrations/0004_policy_and_audit.sql
            </code>
            and refresh.
          </p>
        </SectionCard>
      ) : (
        <SectionCard title="Recent audit events">
          {(logs ?? []).length === 0 ? (
            <p className="text-sm text-slate-500">
              No audit events yet. Actions like settings save, single send prepare, and campaign operations will appear here.
            </p>
          ) : (
            <div className="overflow-hidden rounded-xl border border-slate-200">
              <table className="w-full border-collapse text-xs">
                <thead className="bg-slate-50">
                  <tr>
                    {["Timestamp", "Action", "Entity", "Metadata"].map((header) => (
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
                  {(logs ?? []).map((log) => (
                    <tr key={log.id}>
                      <td className="border-b border-slate-200 px-3 py-2 text-slate-500">
                        {new Date(log.created_at).toLocaleString()}
                      </td>
                      <td className="border-b border-slate-200 px-3 py-2 text-slate-700">
                        {log.action}
                      </td>
                      <td className="border-b border-slate-200 px-3 py-2 text-slate-700">
                        {log.entity_type}
                        {log.entity_id ? `:${log.entity_id}` : ""}
                      </td>
                      <td className="border-b border-slate-200 px-3 py-2 text-slate-700">
                        <pre className="whitespace-pre-wrap font-sans text-[11px]">
                          {JSON.stringify(log.metadata, null, 0)}
                        </pre>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>
      )}
    </div>
  );
}
