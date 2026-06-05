"use client";

import Link from "next/link";
import { useState } from "react";

type GeneratedCandidate = {
  name: string;
  campaignType: string;
  subjectTemplate: string;
  bodyTemplate: string;
  rationale: string;
};

export function TemplateAiGenerator() {
  const [purpose, setPurpose] = useState("intro");
  const [audience, setAudience] = useState("");
  const [tone, setTone] = useState("professional");
  const [language, setLanguage] = useState("en");
  const [length, setLength] = useState("short");
  const [cta, setCta] = useState("Invite a short conversation.");
  const [mustInclude, setMustInclude] = useState("");
  const [mustAvoid, setMustAvoid] = useState("");

  const [isGenerating, setIsGenerating] = useState(false);
  const [isSavingIndex, setIsSavingIndex] = useState<number | null>(null);
  const [isSavingBatch, setIsSavingBatch] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [createdTemplateId, setCreatedTemplateId] = useState<string | null>(null);
  const [createdTemplateIds, setCreatedTemplateIds] = useState<string[]>([]);
  const [candidates, setCandidates] = useState<GeneratedCandidate[]>([]);

  async function generateCandidates() {
    setIsGenerating(true);
    setError(null);
    setNotice(null);
    setCreatedTemplateId(null);
    setCreatedTemplateIds([]);

    try {
      const response = await fetch("/api/templates/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          purpose,
          audience,
          tone,
          language,
          length,
          cta,
          mustInclude,
          mustAvoid,
        }),
      });
      const data = (await response.json()) as {
        error?: string;
        candidates?: GeneratedCandidate[];
      };

      if (!response.ok || !data.candidates) {
        setError(data.error ?? "Could not generate template candidates.");
        setCandidates([]);
        return;
      }

      setCandidates(data.candidates);
      setNotice(`Generated ${data.candidates.length} candidates.`);
    } catch {
      setError("Network error while generating templates.");
      setCandidates([]);
    } finally {
      setIsGenerating(false);
    }
  }

  async function saveCandidate(candidate: GeneratedCandidate, index: number) {
    setIsSavingIndex(index);
    setError(null);
    setNotice(null);
    setCreatedTemplateId(null);
    setCreatedTemplateIds([]);

    try {
      const response = await fetch("/api/templates/from-generated", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: candidate.name,
          campaignType: candidate.campaignType,
          subjectTemplate: candidate.subjectTemplate,
          bodyTemplate: candidate.bodyTemplate,
        }),
      });
      const data = (await response.json()) as {
        error?: string;
        template?: { id: string; name: string };
      };

      if (!response.ok || !data.template) {
        setError(data.error ?? "Could not save candidate as template.");
        return;
      }

      setNotice(`Saved template: ${data.template.name}`);
      setCreatedTemplateId(data.template.id);
    } catch {
      setError("Network error while saving template.");
    } finally {
      setIsSavingIndex(null);
    }
  }

  async function saveAllCandidatesAsVariants() {
    if (candidates.length < 2) {
      setError("Need at least 2 generated candidates for A/B save.");
      return;
    }

    setIsSavingBatch(true);
    setError(null);
    setNotice(null);
    setCreatedTemplateId(null);
    setCreatedTemplateIds([]);

    try {
      const response = await fetch("/api/templates/from-generated/batch", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          candidates,
        }),
      });
      const data = (await response.json()) as {
        error?: string;
        count?: number;
        templates?: Array<{ id: string; name: string }>;
      };

      if (!response.ok || !data.templates || data.templates.length === 0) {
        setError(data.error ?? "Could not save A/B variant set.");
        return;
      }

      setNotice(`Saved ${data.count ?? data.templates.length} templates as A/B set.`);
      setCreatedTemplateId(data.templates[0].id);
      setCreatedTemplateIds(data.templates.map((template) => template.id));
    } catch {
      setError("Network error while saving A/B variant set.");
    } finally {
      setIsSavingBatch(false);
    }
  }

  return (
    <div className="grid gap-3">
      <section className="grid gap-2 sm:grid-cols-2">
        <label className="grid gap-1">
          <span className="text-xs font-medium text-slate-600">Purpose</span>
          <select
            value={purpose}
            onChange={(event) => setPurpose(event.target.value)}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="intro">Intro</option>
            <option value="review_request">Review request</option>
            <option value="follow_up">Follow-up</option>
            <option value="reengage">Re-engage</option>
            <option value="referral">Referral</option>
          </select>
        </label>
        <label className="grid gap-1">
          <span className="text-xs font-medium text-slate-600">Audience</span>
          <input
            type="text"
            value={audience}
            onChange={(event) => setAudience(event.target.value)}
            placeholder="clinic owner, restaurant manager..."
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </label>
        <label className="grid gap-1">
          <span className="text-xs font-medium text-slate-600">Tone</span>
          <select
            value={tone}
            onChange={(event) => setTone(event.target.value)}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="professional">Professional</option>
            <option value="friendly">Friendly</option>
            <option value="brief">Brief</option>
          </select>
        </label>
        <label className="grid gap-1">
          <span className="text-xs font-medium text-slate-600">Language</span>
          <select
            value={language}
            onChange={(event) => setLanguage(event.target.value)}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="en">English</option>
            <option value="zh-CN">Chinese (Simplified)</option>
            <option value="zh-TW">Chinese (Traditional)</option>
          </select>
        </label>
        <label className="grid gap-1">
          <span className="text-xs font-medium text-slate-600">Length</span>
          <select
            value={length}
            onChange={(event) => setLength(event.target.value)}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="short">Short</option>
            <option value="medium">Medium</option>
          </select>
        </label>
        <label className="grid gap-1">
          <span className="text-xs font-medium text-slate-600">CTA guidance</span>
          <input
            type="text"
            value={cta}
            onChange={(event) => setCta(event.target.value)}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </label>
      </section>

      <label className="grid gap-1">
        <span className="text-xs font-medium text-slate-600">Must include</span>
        <textarea
          rows={2}
          value={mustInclude}
          onChange={(event) => setMustInclude(event.target.value)}
          placeholder="e.g. mention safe outreach, include WhatsApp CTA..."
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
      </label>
      <label className="grid gap-1">
        <span className="text-xs font-medium text-slate-600">Must avoid</span>
        <textarea
          rows={2}
          value={mustAvoid}
          onChange={(event) => setMustAvoid(event.target.value)}
          placeholder="e.g. no discounts, no urgency claims..."
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
      </label>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={generateCandidates}
          disabled={isGenerating}
          className="inline-flex h-9 items-center justify-center rounded-lg border border-blue-700 bg-blue-600 px-3 text-xs font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isGenerating ? "Generating..." : "Generate templates"}
        </button>
        {candidates.length > 1 ? (
          <button
            type="button"
            onClick={saveAllCandidatesAsVariants}
            disabled={isSavingBatch}
            className="inline-flex h-9 items-center justify-center rounded-lg border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSavingBatch ? "Saving A/B set..." : "Save all as A/B variants"}
          </button>
        ) : null}
      </div>

      {error ? (
        <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
          {notice}
          {createdTemplateId ? (
            <Link
              href={`/app/templates?tab=library&templateId=${createdTemplateId}`}
              className="ml-2 font-semibold text-emerald-800 underline"
            >
              Open first in template library
            </Link>
          ) : null}
          {createdTemplateIds.length > 1 ? (
            <span className="ml-2 text-emerald-700/90">
              ({createdTemplateIds.length} variants saved)
            </span>
          ) : null}
        </p>
      ) : null}

      {candidates.length > 0 ? (
        <section className="grid gap-2">
          {candidates.map((candidate, index) => (
            <article
              key={`${candidate.name}-${index}`}
              className="rounded-xl border border-slate-200 bg-white p-3"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-slate-900">{candidate.name}</p>
                  <p className="text-xs text-slate-500">
                    Variant {String.fromCharCode(65 + index)} |{" "}
                    {candidate.campaignType}
                    {candidate.rationale ? ` | ${candidate.rationale}` : ""}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => saveCandidate(candidate, index)}
                  disabled={isSavingIndex === index}
                  className="inline-flex h-8 items-center rounded-md border border-slate-300 bg-white px-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isSavingIndex === index ? "Saving..." : "Save as template"}
                </button>
              </div>
              <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500">
                  Subject
                </p>
                <p className="mt-1 text-xs text-slate-700">{candidate.subjectTemplate}</p>
              </div>
              <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500">
                  Body
                </p>
                <p className="mt-1 whitespace-pre-wrap text-xs text-slate-700">
                  {candidate.bodyTemplate}
                </p>
              </div>
            </article>
          ))}
        </section>
      ) : null}
    </div>
  );
}
