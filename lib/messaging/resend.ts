export interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

export interface SendEmailResult {
  sent: boolean;
  providerId?: string;
  error?: string;
}

function getResendApiKey() {
  return process.env.RESEND_API_KEY?.trim() ?? "";
}

function getResendFrom() {
  return process.env.RESEND_FROM?.trim() ?? "";
}

export async function sendEmailViaResend(input: SendEmailInput): Promise<SendEmailResult> {
  const apiKey = getResendApiKey();
  const from = getResendFrom();

  if (!apiKey || !from) {
    return {
      sent: false,
      error: "Resend is not configured (RESEND_API_KEY or RESEND_FROM missing).",
    };
  }

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [input.to],
        subject: input.subject,
        html: input.html,
        text: input.text,
      }),
    });

    const payload = (await response.json().catch(() => null)) as
      | { id?: string; message?: string; error?: { message?: string } }
      | null;

    if (!response.ok) {
      return {
        sent: false,
        error:
          payload?.error?.message ??
          payload?.message ??
          `Resend returned HTTP ${response.status}.`,
      };
    }

    return {
      sent: true,
      providerId: payload?.id,
    };
  } catch (error) {
    return {
      sent: false,
      error: error instanceof Error ? error.message : "Unknown Resend error.",
    };
  }
}
