"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type CampaignRecipientRow = {
  id: string;
  full_name: string | null;
  company_name: string | null;
  email: string;
  status: string;
  risk_level: string;
  scheduled_at: string | null;
  opened_at: string | null;
  sent_at: string | null;
  gmail_compose_url: string;
};

function statusLabel(status: string) {
  if (status === "opened_gmail") return "opened";
  if (status === "skipped_suppressed" || status === "skipped_role") return "skipped";
  return status;
}

function statusBadgeClass(status: string) {
  const label = statusLabel(status);
  if (label === "queued") return "bg-blue-100 text-blue-700";
  if (label === "opened") return "bg-emerald-100 text-emerald-700";
  if (label === "sent") return "bg-cyan-100 text-cyan-700";
  if (label === "skipped") return "bg-amber-100 text-amber-700";
  if (label === "failed") return "bg-rose-100 text-rose-700";
  return "bg-slate-100 text-slate-700";
}

interface CampaignRecipientTableProps {
  campaignId: string;
  recipients: CampaignRecipientRow[];
}

export function CampaignRecipientTable({
  campaignId,
  recipients,
}: CampaignRecipientTableProps) {
  const router = useRouter();
  const [markingRecipientId, setMarkingRecipientId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function markRecipientSent(recipientId: string) {
    setMarkingRecipientId(recipientId);
    setError(null);
    setMessage(null);

    try {
      const response = await fetch(`/api/campaigns/${campaignId}/mark-sent`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ recipientId }),
      });
      const data = (await response.json()) as {
        error?: string;
        alreadySent?: boolean;
        recipientEmail?: string;
      };

      if (!response.ok) {
        setError(data.error ?? "Could not mark recipient as sent.");
        return;
      }

      setMessage(
        data.alreadySent
          ? `${data.recipientEmail ?? "Recipient"} was already marked as sent.`
          : `${data.recipientEmail ?? "Recipient"} marked as sent.`,
      );
      router.refresh();
    } catch {
      setError("Network error while marking recipient as sent.");
    } finally {
      setMarkingRecipientId(null);
    }
  }

  if (recipients.length === 0) {
    return (
      <p className="text-sm text-slate-500">
        No recipients were generated for this campaign.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {error ? (
        <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
          {error}
        </p>
      ) : null}
      {message ? (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
          {message}
        </p>
      ) : null}

      <div className="overflow-hidden rounded-xl border border-slate-200">
        <table className="w-full border-collapse text-xs">
          <thead className="bg-slate-50">
            <tr>
              {[
                "Recipient",
                "Company",
                "Email",
                "Status",
                "Risk",
                "Scheduled",
                "Opened",
                "Sent",
                "Action",
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
            {recipients.map((recipient) => (
              <tr key={recipient.id}>
                <td className="border-b border-slate-200 px-3 py-2 text-slate-700">
                  {recipient.full_name}
                </td>
                <td className="border-b border-slate-200 px-3 py-2 text-slate-700">
                  {recipient.company_name || "-"}
                </td>
                <td className="border-b border-slate-200 px-3 py-2 text-slate-700">
                  {recipient.email}
                </td>
                <td className="border-b border-slate-200 px-3 py-2 text-slate-700">
                  <span
                    className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${statusBadgeClass(
                      recipient.status,
                    )}`}
                  >
                    {statusLabel(recipient.status)}
                  </span>
                </td>
                <td className="border-b border-slate-200 px-3 py-2 text-slate-700">
                  {recipient.risk_level}
                </td>
                <td className="border-b border-slate-200 px-3 py-2 text-slate-500">
                  {recipient.scheduled_at
                    ? new Date(recipient.scheduled_at).toLocaleString()
                    : "-"}
                </td>
                <td className="border-b border-slate-200 px-3 py-2 text-slate-500">
                  {recipient.opened_at
                    ? new Date(recipient.opened_at).toLocaleString()
                    : "-"}
                </td>
                <td className="border-b border-slate-200 px-3 py-2 text-slate-500">
                  {recipient.sent_at ? new Date(recipient.sent_at).toLocaleString() : "-"}
                </td>
                <td className="border-b border-slate-200 px-3 py-2">
                  {recipient.status === "opened_gmail" ? (
                    <div className="flex flex-wrap gap-2">
                      <a
                        href={recipient.gmail_compose_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-medium text-blue-600 hover:text-blue-700"
                      >
                        Open in Gmail
                      </a>
                      <button
                        type="button"
                        onClick={() => markRecipientSent(recipient.id)}
                        disabled={markingRecipientId === recipient.id}
                        className="inline-flex items-center rounded-md border border-slate-300 bg-white px-2 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {markingRecipientId === recipient.id ? "Saving..." : "Mark sent"}
                      </button>
                    </div>
                  ) : (
                    <span className="text-slate-500">-</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
