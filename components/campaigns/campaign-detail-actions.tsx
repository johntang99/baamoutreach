"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

interface RecipientSummary {
  id: string;
  email: string;
  fullName: string;
}

interface LastSentSummary {
  email: string;
  fullName: string;
  sentAt: string;
}

interface CampaignDetailActionsProps {
  campaignId: string;
  initialQueuedCount: number;
  minIntervalSeconds: number;
  maxIntervalSeconds: number;
  initialStatus: string;
  initialOpenedRecipient: RecipientSummary | null;
  initialLastSentRecipient: LastSentSummary | null;
}

export function CampaignDetailActions({
  campaignId,
  initialQueuedCount,
  minIntervalSeconds,
  maxIntervalSeconds,
  initialStatus,
  initialOpenedRecipient,
  initialLastSentRecipient,
}: CampaignDetailActionsProps) {
  const router = useRouter();
  const [isOpening, setIsOpening] = useState(false);
  const [isMarking, setIsMarking] = useState(false);
  const [isTogglingStatus, setIsTogglingStatus] = useState(false);
  const [campaignStatus, setCampaignStatus] = useState(initialStatus);
  const [openedRecipient, setOpenedRecipient] = useState<RecipientSummary | null>(
    initialOpenedRecipient,
  );
  const [lastSentRecipient, setLastSentRecipient] = useState<LastSentSummary | null>(
    initialLastSentRecipient,
  );
  const [lastGmailUrl, setLastGmailUrl] = useState<string | null>(null);
  const [queuedLeft, setQueuedLeft] = useState(initialQueuedCount);
  const [nextAllowedOpenAt, setNextAllowedOpenAt] = useState<number | null>(null);
  const [nowMs, setNowMs] = useState<number>(() => Date.now());
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isPaused = campaignStatus === "paused";
  const waitSeconds = nextAllowedOpenAt
    ? Math.max(0, Math.ceil((nextAllowedOpenAt - nowMs) / 1000))
    : 0;

  useEffect(() => {
    const timer = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  async function openNextQueued() {
    if (waitSeconds > 0 || isPaused) return;
    setIsOpening(true);
    setError(null);
    setMessage(null);

    try {
      const response = await fetch(`/api/campaigns/${campaignId}/open-next`, {
        method: "POST",
      });
      const data = (await response.json()) as {
        error?: string;
        done?: boolean;
        gmailUrl?: string;
        recipientId?: string;
        recipientEmail?: string;
        recipientName?: string;
        queuedCount?: number;
        openedCount?: number;
        sentCount?: number;
        suggestedDelaySeconds?: number;
        minIntervalSeconds?: number;
        maxIntervalSeconds?: number;
      };

      if (!response.ok) {
        if (data.recipientId && data.recipientEmail) {
          setOpenedRecipient({
            id: data.recipientId,
            email: data.recipientEmail,
            fullName: data.recipientName ?? data.recipientEmail,
          });
          if (data.gmailUrl) {
            setLastGmailUrl(data.gmailUrl);
          }
        }
        setError(data.error ?? "Could not open next queued recipient.");
        return;
      }

      if (data.done) {
        setQueuedLeft(0);
        setOpenedRecipient(null);
        setMessage("No queued recipients remaining.");
        return;
      }

      if (!data.gmailUrl || !data.recipientId || !data.recipientEmail) {
        setError("No Gmail URL returned.");
        return;
      }

      setOpenedRecipient({
        id: data.recipientId,
        email: data.recipientEmail,
        fullName: data.recipientName ?? data.recipientEmail,
      });
      setLastGmailUrl(data.gmailUrl);
      setQueuedLeft((current) =>
        data.queuedCount ?? Math.max(current - 1, 0),
      );
      const delaySeconds = Math.max(
        30,
        data.suggestedDelaySeconds ?? minIntervalSeconds,
      );
      setNextAllowedOpenAt(Date.now() + delaySeconds * 1000);

      const popup = window.open(data.gmailUrl, "_blank", "noopener,noreferrer");
      if (!popup) {
        setMessage(
          `Popup was blocked${data.recipientEmail ? ` for ${data.recipientEmail}` : ""}. Use the fallback Gmail link below, then click "Mark last opened as sent". ${
            data.queuedCount !== undefined ? `${data.queuedCount} queued left.` : ""
          }`,
        );
        router.refresh();
        return;
      }

      setMessage(
        `Opened Gmail compose${data.recipientEmail ? ` for ${data.recipientEmail}` : ""}. Click Send in Gmail, then return here and click "Mark last opened as sent". ${
          data.queuedCount !== undefined ? `${data.queuedCount} queued left.` : ""
        }`,
      );
      router.refresh();
    } catch {
      setError("Network error while opening next recipient.");
    } finally {
      setIsOpening(false);
    }
  }

  async function markLastAsSent() {
    if (!openedRecipient?.id) {
      setError("Open a queued recipient first, then send in Gmail.");
      return;
    }

    setIsMarking(true);
    setError(null);
    setMessage(null);

    try {
      const response = await fetch(`/api/campaigns/${campaignId}/mark-sent`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          recipientId: openedRecipient.id,
        }),
      });
      const data = (await response.json()) as {
        error?: string;
        alreadySent?: boolean;
        queuedCount?: number;
        openedCount?: number;
        sentCount?: number;
        recipientName?: string;
        recipientEmail?: string;
        sentAt?: string;
        campaignStatus?: string;
      };

      if (!response.ok) {
        setError(data.error ?? "Could not mark recipient as sent.");
        return;
      }

      setLastGmailUrl(null);
      setOpenedRecipient(null);
      const sentAt = data.sentAt ?? new Date().toISOString();
      setLastSentRecipient({
        fullName: data.recipientName ?? openedRecipient.fullName,
        email: data.recipientEmail ?? openedRecipient.email,
        sentAt,
      });
      if (data.campaignStatus) {
        setCampaignStatus(data.campaignStatus);
      }
      if (typeof data.queuedCount === "number") {
        setQueuedLeft(data.queuedCount);
      }
      setMessage(data.alreadySent ? "Recipient was already marked as sent." : "Recipient marked as sent.");
      router.refresh();
    } catch {
      setError("Network error while marking sent.");
    } finally {
      setIsMarking(false);
    }
  }

  async function toggleCampaignState() {
    const targetStatus = isPaused ? "active" : "paused";
    setIsTogglingStatus(true);
    setError(null);
    setMessage(null);

    try {
      const response = await fetch(`/api/campaigns/${campaignId}/set-status`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          status: targetStatus,
        }),
      });
      const data = (await response.json()) as {
        error?: string;
        status?: string;
      };

      if (!response.ok) {
        setError(data.error ?? "Could not update campaign status.");
        return;
      }

      if (data.status) {
        setCampaignStatus(data.status);
      }
      setMessage(
        targetStatus === "paused"
          ? "Campaign paused. Open/mark actions are disabled."
          : "Campaign resumed.",
      );
      router.refresh();
    } catch {
      setError("Network error while updating campaign status.");
    } finally {
      setIsTogglingStatus(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={openNextQueued}
          disabled={isOpening || isPaused || waitSeconds > 0 || queuedLeft <= 0}
          className="inline-flex h-9 items-center rounded-lg border border-blue-700 bg-blue-600 px-3 text-xs font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isOpening
            ? "Opening..."
            : waitSeconds > 0
              ? `Wait ${waitSeconds}s (${queuedLeft} queued left)`
              : queuedLeft > 0
                ? `Open next queued in Gmail (${queuedLeft} left)`
                : "No queued recipients left"}
        </button>
        <button
          type="button"
          onClick={markLastAsSent}
          disabled={isMarking || isPaused || !openedRecipient}
          className="inline-flex h-9 items-center rounded-lg border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isMarking ? "Saving..." : "Mark last opened as sent"}
        </button>
        <button
          type="button"
          onClick={toggleCampaignState}
          disabled={isTogglingStatus}
          className="inline-flex h-9 items-center rounded-lg border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isTogglingStatus
            ? "Updating..."
            : isPaused
              ? "Resume campaign"
              : "Pause campaign"}
        </button>
      </div>
      <p className="rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs text-indigo-700">
        Current opened recipient:{" "}
        {openedRecipient
          ? `${openedRecipient.fullName} <${openedRecipient.email}>`
          : "None opened yet."}
      </p>
      <p className="text-xs text-slate-500">
        Campaigns are sent manually through Gmail. This app prepares the next compose
        draft, but you must click <strong>Send</strong> in Gmail, then mark it as sent here.
      </p>
      <p className="text-xs text-slate-500">
        Send interval guidance: keep about{" "}
        <strong>
          {minIntervalSeconds}s-{maxIntervalSeconds}s
        </strong>{" "}
        between opens for safer pacing.
      </p>
      {lastGmailUrl ? (
        <a
          href={lastGmailUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex w-fit items-center rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
        >
          Open fallback Gmail compose link
        </a>
      ) : null}
      <div className="rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs text-indigo-700">
        <p className="font-semibold">Last sent email</p>
        {lastSentRecipient ? (
          <>
            <p>
              {lastSentRecipient.fullName} &lt;{lastSentRecipient.email}&gt;
            </p>
            <p>Sent at {new Date(lastSentRecipient.sentAt).toLocaleString()}</p>
          </>
        ) : (
          <p>No email sent in this session yet.</p>
        )}
      </div>

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
    </div>
  );
}
