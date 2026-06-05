import "server-only";
import Anthropic from "@anthropic-ai/sdk";

const DEFAULT_MODEL =
  process.env.ANTHROPIC_MAIN_MODEL ||
  process.env.AI_REWRITE_CLAUDE_MODEL ||
  "claude-haiku-4-5-20251001";

export type TemplatePurpose =
  | "intro"
  | "review_request"
  | "follow_up"
  | "reengage"
  | "referral";

export type TemplateTone = "friendly" | "professional" | "brief";
export type TemplateLanguage = "en" | "zh-CN" | "zh-TW";
export type TemplateLength = "short" | "medium";

export interface TemplateGenerationInput {
  purpose: TemplatePurpose;
  audience: string;
  tone: TemplateTone;
  language: TemplateLanguage;
  cta: string;
  mustInclude: string;
  mustAvoid: string;
  length: TemplateLength;
}

export interface TemplateCandidate {
  name: string;
  campaignType: string;
  subjectTemplate: string;
  bodyTemplate: string;
  rationale: string;
}

export interface TemplateGenerationResult {
  ok: boolean;
  candidates?: TemplateCandidate[];
  error?: string;
}

function languageLabel(language: TemplateLanguage) {
  if (language === "zh-CN") return "Chinese (Simplified)";
  if (language === "zh-TW") return "Chinese (Traditional)";
  return "English";
}

function buildSystemPrompt(input: TemplateGenerationInput) {
  return [
    "You are an outbound email template generator for B2B outreach.",
    `Purpose: ${input.purpose}`,
    `Audience: ${input.audience || "general business contacts"}`,
    `Tone: ${input.tone}`,
    `Language: ${languageLabel(input.language)}`,
    `Length: ${input.length}`,
    "",
    "HARD RULES:",
    "1) Return JSON only.",
    "2) Produce exactly 4 candidates.",
    "3) Each candidate must include placeholders {first_name} and {business_name} in the body.",
    "4) Use safe outreach language: no incentives, no false urgency, no spammy claims.",
    "5) Subject should be <= 90 characters.",
    "6) Keep body concise and readable for Gmail manual send.",
    "",
    `CTA guidance: ${input.cta || "Invite a short conversation."}`,
    `Must include: ${input.mustInclude || "N/A"}`,
    `Must avoid: ${input.mustAvoid || "N/A"}`,
    "",
    'Return JSON with shape: {"candidates":[{"name":"...","campaignType":"...","subjectTemplate":"...","bodyTemplate":"...","rationale":"..."}]}',
  ].join("\n");
}

function extractJson(raw: string): { candidates?: TemplateCandidate[] } | null {
  const trimmed = raw.replace(/^```(?:json)?\s*|\s*```$/g, "").trim();
  try {
    const parsed = JSON.parse(trimmed);
    if (parsed && typeof parsed === "object") {
      return parsed as { candidates?: TemplateCandidate[] };
    }
  } catch {
    const match = trimmed.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        return JSON.parse(match[0]) as { candidates?: TemplateCandidate[] };
      } catch {}
    }
  }
  return null;
}

function normalizeCandidate(candidate: TemplateCandidate): TemplateCandidate | null {
  const name = candidate.name?.trim();
  const campaignType = candidate.campaignType?.trim() || "general";
  const subjectTemplate = candidate.subjectTemplate?.trim();
  const bodyTemplate = candidate.bodyTemplate?.trim();
  const rationale = candidate.rationale?.trim() || "";

  if (!name || !subjectTemplate || !bodyTemplate) {
    return null;
  }
  if (!bodyTemplate.includes("{first_name}") || !bodyTemplate.includes("{business_name}")) {
    return null;
  }

  return {
    name,
    campaignType,
    subjectTemplate,
    bodyTemplate,
    rationale,
  };
}

export async function generateTemplateCandidates(
  input: TemplateGenerationInput,
): Promise<TemplateGenerationResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return {
      ok: false,
      error: "AI generator not configured (missing ANTHROPIC_API_KEY).",
    };
  }

  const client = new Anthropic({ apiKey });

  try {
    const result = await client.messages.create({
      model: DEFAULT_MODEL,
      max_tokens: 2200,
      system: buildSystemPrompt(input),
      messages: [
        {
          role: "user",
          content: "Generate template candidates now in JSON only.",
        },
      ],
    });

    const output = result.content
      .filter((block) => block.type === "text")
      .map((block) => (block as { text: string }).text)
      .join("")
      .trim();

    if (!output) {
      return { ok: false, error: "AI returned empty output." };
    }

    const parsed = extractJson(output);
    if (!parsed?.candidates || !Array.isArray(parsed.candidates)) {
      return { ok: false, error: "AI did not return valid candidate list." };
    }

    const normalized = parsed.candidates
      .map((candidate) => normalizeCandidate(candidate))
      .filter((candidate): candidate is TemplateCandidate => candidate !== null)
      .slice(0, 5);

    if (normalized.length < 3) {
      return {
        ok: false,
        error: "AI returned too few valid candidates. Please retry.",
      };
    }

    return { ok: true, candidates: normalized };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "AI request failed.",
    };
  }
}
