const ROLE_PREFIXES = [
  "info",
  "contact",
  "admin",
  "office",
  "support",
  "sales",
  "billing",
  "hello",
];

export interface ContactLite {
  id: string;
  full_name: string;
  email: string;
  company_name: string | null;
}

export interface TemplateLite {
  id: string;
  name: string;
  campaign_type: string;
  subject_template: string;
  body_template: string;
}

export function toGmailPlainTextBody(input: string) {
  return input
    .replace(/\\r\\n/g, "\n")
    .replace(/\\n/g, "\n")
    .replace(/\\t/g, "\t")
    .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_, alt: string, url: string) => {
      const safeAlt = alt.trim();
      return safeAlt ? `${safeAlt} (${url})` : url;
    })
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1 ($2)")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/[ \t]+\n/g, "\n")
    .trim();
}

export function interpolateTemplate(
  template: string,
  values: Record<string, string>,
) {
  return template.replace(/\{([a-zA-Z0-9_]+)\}/g, (_, key: string) => {
    return values[key] ?? "";
  });
}

export function buildGmailComposeUrl({
  to,
  subject,
  body,
  senderGmail,
}: {
  to: string;
  subject: string;
  body: string;
  senderGmail?: string | null;
}) {
  const base = "https://mail.google.com/mail/?view=cm&fs=1&tf=1";
  const params = new URLSearchParams({
    to,
    su: subject,
    body,
  });

  const composeBase = `${base}&${params.toString()}`;
  const normalizedSender = (senderGmail ?? "").trim().toLowerCase();
  if (!normalizedSender) {
    return composeBase;
  }

  const continueUrl = `${composeBase}&authuser=${encodeURIComponent(normalizedSender)}`;
  return (
    "https://accounts.google.com/AccountChooser" +
    `?Email=${encodeURIComponent(normalizedSender)}` +
    `&continue=${encodeURIComponent(continueUrl)}`
  );
}

export function isRoleMailbox(email: string) {
  const [localPartRaw] = email.toLowerCase().split("@");
  const localPart = localPartRaw?.trim() ?? "";
  return ROLE_PREFIXES.includes(localPart);
}

export function toSafeText(value: unknown, fallback = "") {
  if (typeof value !== "string") return fallback;
  return value.trim();
}

export function isMissingTableError(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const maybeCode = (error as { code?: string }).code;
  return maybeCode === "42P01";
}
