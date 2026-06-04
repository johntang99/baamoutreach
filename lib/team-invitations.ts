import { sendEmailViaResend } from "@/lib/messaging/resend";

interface SendWorkspaceInviteEmailInput {
  recipientEmail: string;
  role: "operator" | "viewer";
  workspaceName: string;
  inviterEmail: string;
  signupUrl: string;
  loginUrl: string;
}

export async function sendWorkspaceInviteEmail({
  recipientEmail,
  role,
  workspaceName,
  inviterEmail,
  signupUrl,
  loginUrl,
}: SendWorkspaceInviteEmailInput) {
  const roleLabel = role === "operator" ? "Operator" : "Viewer";
  const subject = `Invitation to join ${workspaceName} on BAAM Outreach`;
  const text = [
    `You were invited to join ${workspaceName} on BAAM Outreach.`,
    `Role: ${roleLabel}`,
    `Invited by: ${inviterEmail}`,
    "",
    "If you are new, create your account using this email:",
    signupUrl,
    "",
    "If you already have an account, log in here:",
    loginUrl,
    "",
    "Use the same email address as this invitation.",
  ].join("\n");
  const html = `
    <div style="font-family:Inter,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;line-height:1.6;color:#0f172a">
      <h2 style="margin:0 0 12px">You're invited to BAAM Outreach</h2>
      <p style="margin:0 0 10px">
        <strong>${inviterEmail}</strong> invited you to join <strong>${workspaceName}</strong>.
      </p>
      <p style="margin:0 0 16px">Your role: <strong>${roleLabel}</strong></p>
      <p style="margin:0 0 10px">If you are new, create your account:</p>
      <p style="margin:0 0 16px">
        <a href="${signupUrl}" style="color:#2563eb;text-decoration:underline">${signupUrl}</a>
      </p>
      <p style="margin:0 0 10px">If you already have an account, log in:</p>
      <p style="margin:0 0 16px">
        <a href="${loginUrl}" style="color:#2563eb;text-decoration:underline">${loginUrl}</a>
      </p>
      <p style="margin:0;color:#475569;font-size:12px">
        Important: Use <strong>${recipientEmail}</strong> so we can match this invitation.
      </p>
    </div>
  `;

  return sendEmailViaResend({
    to: recipientEmail,
    subject,
    html,
    text,
  });
}
