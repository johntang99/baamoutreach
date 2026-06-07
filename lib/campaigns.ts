import {
  buildGmailComposeUrl,
  interpolateTemplate,
  isRoleMailbox,
  toGmailPlainTextBody,
} from "@/lib/single-send";

export function normalizeIntervalRange(
  minIntervalSeconds: number,
  maxIntervalSeconds: number,
) {
  const safeMin = Number.isFinite(minIntervalSeconds)
    ? Math.max(30, Math.floor(minIntervalSeconds))
    : 120;
  const safeMax = Number.isFinite(maxIntervalSeconds)
    ? Math.max(30, Math.floor(maxIntervalSeconds))
    : 180;

  if (safeMin <= safeMax) {
    return { min: safeMin, max: safeMax };
  }

  return { min: safeMax, max: safeMin };
}

export function scheduledAtForIndex(
  index: number,
  startAt: Date,
  minIntervalSeconds: number,
  maxIntervalSeconds: number,
) {
  const range = normalizeIntervalRange(minIntervalSeconds, maxIntervalSeconds);
  const spread = range.max - range.min;
  const deterministicOffset = spread === 0 ? 0 : (index * 17) % (spread + 1);
  const interval = range.min + deterministicOffset;
  const millis = startAt.getTime() + index * interval * 1000;
  return new Date(millis).toISOString();
}

export function campaignRecipientRisk(email: string, includeRoleEmails: boolean) {
  if (isRoleMailbox(email) && !includeRoleEmails) {
    return {
      shouldQueue: false,
      status: "skipped_role" as const,
      riskLevel: "medium" as const,
      riskNotes: ["Role-based mailbox skipped by policy."],
    };
  }

  if (isRoleMailbox(email) && includeRoleEmails) {
    return {
      shouldQueue: true,
      status: "queued" as const,
      riskLevel: "medium" as const,
      riskNotes: ["Role-based mailbox included by operator override."],
    };
  }

  return {
    shouldQueue: true,
    status: "queued" as const,
    riskLevel: "low" as const,
    riskNotes: [] as string[],
  };
}

export function buildRenderedSend({
  email,
  fullName,
  companyName,
  subjectTemplate,
  bodyTemplate,
  senderGmail,
}: {
  email: string;
  fullName: string;
  companyName: string | null;
  subjectTemplate: string;
  bodyTemplate: string;
  senderGmail?: string | null;
}) {
  const values = {
    name: fullName ?? "",
    first_name: (fullName ?? "").split(" ")[0] ?? "",
    email: email ?? "",
    business_name: companyName ?? "",
    company_name: companyName ?? "",
  };

  const subject = interpolateTemplate(subjectTemplate, values).trim();
  const body = toGmailPlainTextBody(interpolateTemplate(bodyTemplate, values));
  const gmailComposeUrl = buildGmailComposeUrl({
    to: email,
    subject,
    body,
    senderGmail,
  });

  return {
    subject,
    body,
    gmailComposeUrl,
  };
}
