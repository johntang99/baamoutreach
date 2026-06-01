import "server-only";
import Anthropic from "@anthropic-ai/sdk";

const DEFAULT_MODEL =
  process.env.AI_REWRITE_CLAUDE_MODEL || "claude-haiku-4-5-20251001";

export type RewriteTone = "warm" | "brief" | "professional" | "casual";
export type RewriteLang = "en" | "zh" | "es";

export interface RewriteInputs {
  currentBody: string;
  currentSubject: string;
  language: RewriteLang;
  tone: RewriteTone;
}

const LANG_NAME: Record<RewriteLang, string> = {
  en: "English",
  zh: "Chinese",
  es: "Spanish",
};

const TONE_GUIDE: Record<RewriteTone, string> = {
  warm: "Warm and personal, like a genuine one-to-one note.",
  brief: "Brief and direct with concise language.",
  professional: "Polite and professional for business communication.",
  casual: "Casual and conversational while still respectful.",
};

function buildSystemPrompt(inputs: RewriteInputs) {
  return [
    "You rewrite outbound outreach emails for business contacts.",
    "",
    `Output language: ${LANG_NAME[inputs.language]}.`,
    `Tone: ${inputs.tone.toUpperCase()} — ${TONE_GUIDE[inputs.tone]}`,
    "",
    "HARD RULES:",
    "1. Keep placeholders exactly: {first_name} and {business_name}.",
    "2. Do not add links, discounts, incentives, or compliance-risk language.",
    "3. Subject should stay under 90 characters.",
    "4. Body should stay under 220 words.",
    "5. No emojis. No all caps.",
    "",
    'Return JSON only in this shape: {"subject":"...","body":"..."}',
  ].join("\n");
}

function extractJsonObject(raw: string): { subject?: string; body?: string } | null {
  const trimmed = raw.replace(/^```(?:json)?\s*|\s*```$/g, "").trim();
  try {
    const parsed = JSON.parse(trimmed);
    if (parsed && typeof parsed === "object") {
      return parsed as { subject?: string; body?: string };
    }
  } catch {
    const match = trimmed.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        return JSON.parse(match[0]) as { subject?: string; body?: string };
      } catch {}
    }
  }
  return null;
}

export interface RewriteResult {
  ok: boolean;
  body?: string;
  subject?: string;
  error?: string;
}

export async function rewriteOutreachTemplate(
  inputs: RewriteInputs,
): Promise<RewriteResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return { ok: false, error: "AI rewrite not configured (missing ANTHROPIC_API_KEY)." };
  }

  const client = new Anthropic({ apiKey });

  try {
    const message = await client.messages.create({
      model: DEFAULT_MODEL,
      max_tokens: 900,
      system: buildSystemPrompt(inputs),
      messages: [
        {
          role: "user",
          content: [
            `Original subject:\n${inputs.currentSubject}`,
            "",
            `Original body:\n${inputs.currentBody}`,
            "",
            "Rewrite now and return JSON only.",
          ].join("\n"),
        },
      ],
    });

    const text = message.content
      .filter((b) => b.type === "text")
      .map((b) => (b as { text: string }).text)
      .join("")
      .trim();

    if (!text) {
      return { ok: false, error: "AI returned empty output." };
    }

    const parsed = extractJsonObject(text);
    if (!parsed || typeof parsed.subject !== "string" || typeof parsed.body !== "string") {
      return { ok: false, error: "AI did not return valid JSON subject/body." };
    }

    const subject = parsed.subject.trim();
    const body = parsed.body.trim();
    if (!subject || !body) {
      return { ok: false, error: "AI rewrite is missing subject or body." };
    }
    if (!body.includes("{first_name}") || !body.includes("{business_name}")) {
      return {
        ok: false,
        error: "AI rewrite removed required placeholders {first_name}/{business_name}.",
      };
    }

    return { ok: true, subject, body };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "AI request failed.",
    };
  }
}
