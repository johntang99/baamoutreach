"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type TemplateSample = {
  id: string;
  sample_key: string;
  name: string;
  purpose: string;
  campaign_type: string;
  language: string;
  tone: string;
  subject_template: string;
  body_template: string;
  tags: string[];
  sort_order: number;
};

type SampleResponse = {
  items: TemplateSample[];
  page: number;
  pageSize: number;
  total: number;
  error?: string;
};

function purposeLabel(purpose: string) {
  if (purpose === "review_request") return "Review request";
  if (purpose === "follow_up") return "Follow-up";
  if (purpose === "reengage") return "Re-engage";
  return purpose.replace(/_/g, " ");
}

export function TemplateStarterGrid() {
  const [items, setItems] = useState<TemplateSample[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [lastCreatedTemplateId, setLastCreatedTemplateId] = useState<string | null>(null);

  const [purpose, setPurpose] = useState("");
  const [language, setLanguage] = useState("");
  const [tone, setTone] = useState("");
  const [expandedSampleId, setExpandedSampleId] = useState<string | null>(null);
  const [creatingSampleId, setCreatingSampleId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadSamples() {
      setLoading(true);
      setError(null);

      const params = new URLSearchParams();
      if (purpose) params.set("purpose", purpose);
      if (language) params.set("language", language);
      if (tone) params.set("tone", tone);

      try {
        const response = await fetch(`/api/template-samples?${params.toString()}`, {
          method: "GET",
        });
        const data = (await response.json()) as SampleResponse;
        if (!response.ok) {
          if (!cancelled) {
            setError(data.error ?? "Could not load starter templates.");
            setItems([]);
          }
          return;
        }

        if (!cancelled) {
          setItems(data.items ?? []);
        }
      } catch {
        if (!cancelled) {
          setError("Network error while loading starter templates.");
          setItems([]);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadSamples();

    return () => {
      cancelled = true;
    };
  }, [purpose, language, tone]);

  const purposeOptions = useMemo(
    () => [
      { value: "", label: "All purposes" },
      { value: "intro", label: "Intro" },
      { value: "review_request", label: "Review request" },
      { value: "follow_up", label: "Follow-up" },
      { value: "reengage", label: "Re-engage" },
      { value: "referral", label: "Referral" },
    ],
    [],
  );

  const languageOptions = useMemo(
    () => [
      { value: "", label: "All languages" },
      { value: "en", label: "English" },
      { value: "zh-CN", label: "Chinese (Simplified)" },
      { value: "zh-TW", label: "Chinese (Traditional)" },
    ],
    [],
  );

  const toneOptions = useMemo(
    () => [
      { value: "", label: "All tones" },
      { value: "friendly", label: "Friendly" },
      { value: "professional", label: "Professional" },
    ],
    [],
  );

  async function createTemplateFromSample(sample: TemplateSample) {
    setCreatingSampleId(sample.id);
    setError(null);
    setNotice(null);
    setLastCreatedTemplateId(null);

    try {
      const response = await fetch("/api/templates/from-sample", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          sampleId: sample.id,
        }),
      });
      const data = (await response.json()) as {
        error?: string;
        template?: { id: string; name: string };
      };

      if (!response.ok || !data.template) {
        setError(data.error ?? "Could not create template from sample.");
        return;
      }

      setNotice(`Created template: ${data.template.name}`);
      setLastCreatedTemplateId(data.template.id);
    } catch {
      setError("Network error while creating template from sample.");
    } finally {
      setCreatingSampleId(null);
    }
  }

  return (
    <div className="grid gap-3">
      <div className="grid gap-2 sm:grid-cols-3">
        <label className="grid gap-1">
          <span className="text-xs font-medium text-slate-600">Purpose</span>
          <select
            value={purpose}
            onChange={(event) => setPurpose(event.target.value)}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
          >
            {purposeOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1">
          <span className="text-xs font-medium text-slate-600">Language</span>
          <select
            value={language}
            onChange={(event) => setLanguage(event.target.value)}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
          >
            {languageOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1">
          <span className="text-xs font-medium text-slate-600">Tone</span>
          <select
            value={tone}
            onChange={(event) => setTone(event.target.value)}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
          >
            {toneOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {error ? (
        <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
          {notice}
          {lastCreatedTemplateId ? (
            <Link
              href={`/app/templates?tab=library&templateId=${lastCreatedTemplateId}`}
              className="ml-2 font-semibold text-emerald-800 underline"
            >
              Open in template library
            </Link>
          ) : null}
        </p>
      ) : null}

      {loading ? (
        <p className="text-sm text-slate-500">Loading starter templates...</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-slate-500">
          No starter templates matched this filter.
        </p>
      ) : (
        <section className="grid gap-2 md:grid-cols-2">
          {items.map((sample) => (
            <article
              key={sample.id}
              className="rounded-xl border border-slate-200 bg-white p-3"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-slate-900">{sample.name}</p>
                  <p className="text-xs text-slate-500">
                    {purposeLabel(sample.purpose)} | {sample.language} | {sample.tone}
                  </p>
                </div>
                <p className="rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-600">
                  {sample.campaign_type}
                </p>
              </div>

              <p className="mt-2 text-xs text-slate-700">
                <span className="font-semibold text-slate-600">Subject:</span>{" "}
                {sample.subject_template}
              </p>

              {expandedSampleId === sample.id ? (
                <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500">
                    Body preview
                  </p>
                  <p className="mt-1 whitespace-pre-wrap text-xs text-slate-700">
                    {sample.body_template}
                  </p>
                </div>
              ) : null}

              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() =>
                    setExpandedSampleId((current) =>
                      current === sample.id ? null : sample.id,
                    )
                  }
                  className="inline-flex h-8 items-center rounded-md border border-slate-300 bg-white px-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  {expandedSampleId === sample.id ? "Hide preview" : "Preview"}
                </button>
                <button
                  type="button"
                  disabled={creatingSampleId === sample.id}
                  onClick={() => createTemplateFromSample(sample)}
                  className="inline-flex h-8 items-center rounded-md border border-blue-700 bg-blue-600 px-2.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {creatingSampleId === sample.id ? "Creating..." : "Use this sample"}
                </button>
              </div>
            </article>
          ))}
        </section>
      )}
    </div>
  );
}
