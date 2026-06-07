import {
  ActionButton,
  PageHeader,
  SectionCard,
} from "@/components/product/page-primitives";
import Link from "next/link";
import { redirect } from "next/navigation";
import { SingleSendComposer } from "@/components/send/single-send-composer";
import type { ContactLite, TemplateLite } from "@/lib/single-send";
import { isMissingTableError } from "@/lib/single-send";
import { createClient } from "@/lib/supabase/server";
import { getOrCreatePrimaryWorkspace } from "@/lib/workspaces";
import { getWorkspacePolicyDefaults } from "@/lib/policies";

type SenderOption = {
  id: string;
  send_from_name: string | null;
  gmail_preset_email: string | null;
  reply_to_email: string | null;
  is_verified: boolean;
};

async function ensureDefaultTemplate(
  supabase: Awaited<ReturnType<typeof createClient>>,
  workspaceId: string,
  userId: string,
): Promise<void> {
  const { data: templates, error } = await supabase
    .from("templates")
    .select("id")
    .eq("workspace_id", workspaceId)
    .limit(1);

  if (error || (templates ?? []).length > 0) return;

  await supabase.from("templates").insert({
    workspace_id: workspaceId,
    name: "Intro - concise",
    campaign_type: "business_intro",
    subject_template: "{first_name}, quick intro from BAAM Outreach",
    body_template:
      "Hi {first_name},\n\nI work with local businesses to improve response and review outcomes safely.\n\nIf helpful, I can share a short walkthrough for {business_name}.\n\nBest,\nBAAM Outreach Team",
    is_active: true,
    created_by: userId,
  });
}

export default async function SingleSendPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?next=/app/send/single");
  }

  const workspace = await getOrCreatePrimaryWorkspace(user, supabase);
  const policyDefaults = await getWorkspacePolicyDefaults(workspace.workspaceId);
  await ensureDefaultTemplate(supabase, workspace.workspaceId, user.id);

  const { data: contacts, error: contactsError } = await supabase
    .from("contacts")
    .select("id, full_name, email, company_name")
    .eq("workspace_id", workspace.workspaceId)
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(200);

  const { data: templates, error: templatesError } = await supabase
    .from("templates")
    .select("id, name, campaign_type, subject_template, body_template")
    .eq("workspace_id", workspace.workspaceId)
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .limit(100);

  const { data: senderRows, error: senderError } = await supabase
    .from("workspace_sender_settings")
    .select("id, send_from_name, gmail_preset_email, reply_to_email, is_verified")
    .eq("workspace_id", workspace.workspaceId)
    .order("created_at", { ascending: true })
    .limit(100);

  const schemaMissing =
    isMissingTableError(contactsError) || isMissingTableError(templatesError);
  const senderSchemaMissing = isMissingTableError(senderError);
  if (senderError && !senderSchemaMissing) {
    throw senderError;
  }

  const safeContacts: ContactLite[] = (contacts ?? []) as ContactLite[];
  const safeTemplates: TemplateLite[] = (templates ?? []) as TemplateLite[];
  const safeSenders: SenderOption[] = (senderRows ?? []) as SenderOption[];
  const hasContacts = safeContacts.length > 0;
  const hasTemplates = safeTemplates.length > 0;
  const hasSenders = safeSenders.length > 0;
  const readyToSend = hasContacts && hasTemplates && hasSenders;

  return (
    <div className="grid gap-3">
      <PageHeader
        title="Single Send"
        description="One-to-one send workflow with pre-send checks and Send in Gmail execution."
        actions={
          <>
            <ActionButton variant="secondary">Preview mode</ActionButton>
            <ActionButton>Gmail manual flow</ActionButton>
          </>
        }
      />

      <SectionCard title="Policy guardrails">
        <p className="text-sm text-slate-600">
          Role-based recipients are currently
          <span className="mx-1 font-semibold text-slate-800">
            {policyDefaults.allowRoleBasedRecipients ? "allowed" : "blocked"}
          </span>
          by workspace policy. Update this at
          <Link
            href="/app/settings/workspace"
            className="ml-1 font-medium text-blue-600 hover:text-blue-700"
          >
            Workspace Settings
          </Link>
          .
        </p>
      </SectionCard>

      {!schemaMissing ? (
        <SectionCard title="Quick start: first single send in 4 steps">
          <ol className="grid gap-2 text-sm">
            <li className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
              <span className="mr-2 text-xs font-semibold text-slate-500">Step 1</span>
              <span className="font-medium text-slate-800">Add at least one contact.</span>
              <span
                className={`ml-2 text-xs font-semibold ${
                  hasContacts ? "text-emerald-700" : "text-amber-700"
                }`}
              >
                {hasContacts ? "Done" : "Pending"}
              </span>
              <Link href="/app/contacts" className="ml-3 text-xs font-medium text-blue-600 hover:text-blue-700">
                Open Contacts
              </Link>
            </li>
            <li className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
              <span className="mr-2 text-xs font-semibold text-slate-500">Step 2</span>
              <span className="font-medium text-slate-800">Create an active template.</span>
              <span
                className={`ml-2 text-xs font-semibold ${
                  hasTemplates ? "text-emerald-700" : "text-amber-700"
                }`}
              >
                {hasTemplates ? "Done" : "Pending"}
              </span>
              <Link href="/app/templates" className="ml-3 text-xs font-medium text-blue-600 hover:text-blue-700">
                Open Templates
              </Link>
            </li>
            <li className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
              <span className="mr-2 text-xs font-semibold text-slate-500">Step 3</span>
              <span className="font-medium text-slate-800">Configure at least one sender.</span>
              <span
                className={`ml-2 text-xs font-semibold ${
                  hasSenders ? "text-emerald-700" : "text-amber-700"
                }`}
              >
                {hasSenders ? "Done" : "Pending"}
              </span>
              <Link href="/app/settings/sender" className="ml-3 text-xs font-medium text-blue-600 hover:text-blue-700">
                Open Sender Settings
              </Link>
            </li>
            <li className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
              <span className="mr-2 text-xs font-semibold text-slate-500">Step 4</span>
              <span className="font-medium text-slate-800">
                Choose sender + contact + template, then click Prepare and open in Gmail.
              </span>
              <span
                className={`ml-2 text-xs font-semibold ${
                  readyToSend ? "text-emerald-700" : "text-slate-500"
                }`}
              >
                {readyToSend ? "Ready" : "Blocked until step 1-2 complete"}
              </span>
            </li>
          </ol>
          <p className="mt-2 text-xs text-slate-500">
            After Gmail opens, review the message, then send manually in Gmail to keep the flow safe and controlled.
          </p>
        </SectionCard>
      ) : null}

      {senderSchemaMissing ? (
        <SectionCard title="Sender settings migration required">
          <p className="text-sm leading-6 text-slate-600">
            Sender selection for Single Send needs sender tables. Please run
            <code className="mx-1 rounded bg-slate-100 px-1.5 py-0.5 text-xs">
              supabase/migrations/0004_policy_and_audit.sql
            </code>
            and
            <code className="mx-1 rounded bg-slate-100 px-1.5 py-0.5 text-xs">
              supabase/migrations/0012_workspace_multiple_senders.sql
            </code>
            first.
          </p>
        </SectionCard>
      ) : null}

      {schemaMissing ? (
        <SectionCard title="Database migration required">
          <p className="text-sm leading-6 text-slate-600">
            Single Send tables are not ready yet. Please run
            <code className="mx-1 rounded bg-slate-100 px-1.5 py-0.5 text-xs">
              supabase/migrations/0002_single_send_mvp.sql
            </code>
            in the BAAM Outreach Supabase project first.
          </p>
        </SectionCard>
      ) : !readyToSend ? (
        <SectionCard title="Complete setup to unlock composer">
          <p className="text-sm leading-6 text-slate-600">
            First-time setup is incomplete. Finish the pending quick-start steps above,
            including Sender Settings, then the composer will appear here.
          </p>
        </SectionCard>
      ) : (
        <SingleSendComposer
          workspaceId={workspace.workspaceId}
          contacts={safeContacts}
          templates={safeTemplates}
          senderOptions={safeSenders}
        />
      )}
    </div>
  );
}
