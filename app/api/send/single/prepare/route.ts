import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { logWorkspaceAudit } from "@/lib/audit";
import { getWorkspacePolicyDefaults } from "@/lib/policies";
import {
  buildGmailComposeUrl,
  interpolateTemplate,
  isMissingTableError,
  isRoleMailbox,
  toGmailPlainTextBody,
  toSafeText,
} from "@/lib/single-send";

function schemaMissingResponse() {
  return NextResponse.json(
    {
      error:
        "Single Send tables are not ready yet. Run supabase/migrations/0002_single_send_mvp.sql and retry.",
    },
    { status: 400 },
  );
}

export async function POST(request: Request) {
  let payload: Record<string, unknown> = {};

  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 });
  }

  const workspaceId = toSafeText(payload.workspaceId);
  const contactId = toSafeText(payload.contactId);
  const templateId = toSafeText(payload.templateId);
  const senderSettingId = toSafeText(payload.senderSettingId);

  if (!workspaceId || !contactId || !templateId || !senderSettingId) {
    return NextResponse.json(
      { error: "workspaceId, contactId, templateId, and senderSettingId are required." },
      { status: 400 },
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const { data: membership, error: membershipError } = await supabase
    .from("workspace_memberships")
    .select("role")
    .eq("workspace_id", workspaceId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (membershipError) {
    if (isMissingTableError(membershipError)) return schemaMissingResponse();
    return NextResponse.json({ error: membershipError.message }, { status: 400 });
  }

  if (!membership) {
    return NextResponse.json(
      { error: "You cannot access this workspace." },
      { status: 403 },
    );
  }

  if (membership.role === "viewer") {
    return NextResponse.json(
      { error: "Viewer role cannot prepare sends." },
      { status: 403 },
    );
  }

  const { data: senderSetting, error: senderError } = await supabase
    .from("workspace_sender_settings")
    .select("id, send_from_name, gmail_preset_email, reply_to_email, is_verified")
    .eq("id", senderSettingId)
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  if (senderError) {
    if (isMissingTableError(senderError)) {
      return NextResponse.json(
        {
          error:
            "Sender settings table is not ready. Run supabase/migrations/0004_policy_and_audit.sql and retry.",
        },
        { status: 400 },
      );
    }
    return NextResponse.json({ error: senderError.message }, { status: 400 });
  }

  if (!senderSetting) {
    return NextResponse.json({ error: "Selected sender not found." }, { status: 404 });
  }

  const senderEmail = (
    senderSetting.gmail_preset_email ??
    senderSetting.reply_to_email ??
    ""
  )
    .trim()
    .toLowerCase();
  if (!senderEmail) {
    return NextResponse.json(
      { error: "Selected sender has no Gmail preset or reply-to email configured." },
      { status: 400 },
    );
  }

  const { data: contact, error: contactError } = await supabase
    .from("contacts")
    .select("id, full_name, email, company_name")
    .eq("id", contactId)
    .eq("workspace_id", workspaceId)
    .eq("status", "active")
    .maybeSingle();

  if (contactError) {
    if (isMissingTableError(contactError)) return schemaMissingResponse();
    return NextResponse.json({ error: contactError.message }, { status: 400 });
  }

  if (!contact) {
    return NextResponse.json(
      { error: "Contact not found or inactive." },
      { status: 404 },
    );
  }

  const { data: template, error: templateError } = await supabase
    .from("templates")
    .select("id, name, campaign_type, subject_template, body_template")
    .eq("id", templateId)
    .eq("workspace_id", workspaceId)
    .eq("is_active", true)
    .maybeSingle();

  if (templateError) {
    if (isMissingTableError(templateError)) return schemaMissingResponse();
    return NextResponse.json({ error: templateError.message }, { status: 400 });
  }

  if (!template) {
    return NextResponse.json(
      { error: "Template not found or inactive." },
      { status: 404 },
    );
  }

  const { data: suppressionEntry, error: suppressionError } = await supabase
    .from("suppression_entries")
    .select("id, reason")
    .eq("workspace_id", workspaceId)
    .eq("email", contact.email.toLowerCase())
    .maybeSingle();

  if (suppressionError) {
    if (isMissingTableError(suppressionError)) return schemaMissingResponse();
    return NextResponse.json({ error: suppressionError.message }, { status: 400 });
  }

  if (suppressionEntry) {
    return NextResponse.json(
      {
        error:
          suppressionEntry.reason?.trim() ||
          "Recipient is in suppression list and cannot be contacted.",
      },
      { status: 400 },
    );
  }

  const policy = await getWorkspacePolicyDefaults(workspaceId);
  if (isRoleMailbox(contact.email) && !policy.allowRoleBasedRecipients) {
    return NextResponse.json(
      {
        error:
          "Recipient appears role-based and workspace policy blocks role-based recipients.",
      },
      { status: 400 },
    );
  }

  const mergeValues: Record<string, string> = {
    name: contact.full_name ?? "",
    first_name: (contact.full_name ?? "").split(" ")[0] ?? "",
    email: contact.email ?? "",
    business_name: contact.company_name ?? "",
    company_name: contact.company_name ?? "",
  };

  const subject = interpolateTemplate(template.subject_template, mergeValues).trim();
  const body = toGmailPlainTextBody(
    interpolateTemplate(template.body_template, mergeValues),
  );

  if (!subject || !body) {
    return NextResponse.json(
      { error: "Rendered subject/body is empty. Update the template." },
      { status: 400 },
    );
  }

  const riskNotes: string[] = [];
  let riskLevel: "low" | "medium" | "high" = "low";

  if (isRoleMailbox(contact.email)) {
    riskLevel = "medium";
    riskNotes.push("Recipient email appears role-based.");
  }

  const gmailComposeUrl = buildGmailComposeUrl({
    to: contact.email,
    subject,
    body,
    senderGmail: senderEmail,
  });

  const { data: sendRequest, error: sendRequestError } = await supabase
    .from("send_requests")
    .insert({
      workspace_id: workspaceId,
      contact_id: contact.id,
      template_id: template.id,
      channel: "gmail_manual",
      status: "draft_prepared",
      subject,
      body,
      gmail_compose_url: gmailComposeUrl,
      risk_level: riskLevel,
      risk_notes: riskNotes,
      created_by: user.id,
    })
    .select("id, created_at")
    .single();

  if (sendRequestError) {
    if (isMissingTableError(sendRequestError)) return schemaMissingResponse();
    return NextResponse.json({ error: sendRequestError.message }, { status: 400 });
  }

  await supabase.from("send_request_events").insert({
    workspace_id: workspaceId,
    send_request_id: sendRequest.id,
    event_type: "draft_prepared",
    event_payload: {
      template_name: template.name,
      contact_email: contact.email,
      risk_level: riskLevel,
      risk_notes: riskNotes,
      sender_setting_id: senderSetting.id,
      sender_email: senderEmail,
    },
    created_by: user.id,
  });

  await logWorkspaceAudit({
    workspaceId,
    actorUserId: user.id,
    action: "single_send.prepared",
    entityType: "send_request",
    entityId: sendRequest.id,
    metadata: {
      contactId: contact.id,
      templateId: template.id,
      senderSettingId: senderSetting.id,
      senderEmail,
      riskLevel,
      riskNotes,
    },
  });

  return NextResponse.json({
    requestId: sendRequest.id,
    gmailUrl: gmailComposeUrl,
    subject,
    body,
    riskLevel,
    riskNotes,
    senderSettingId: senderSetting.id,
    senderEmail,
  });
}
