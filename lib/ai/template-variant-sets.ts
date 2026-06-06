import "server-only";
import {
  rewriteOutreachTemplate,
  type RewriteLang,
  type RewriteTone,
} from "@/lib/ai/rewrite-body";
import type { TemplateVariantRow } from "@/lib/template-variant-sets";

const VARIANT_TONES: RewriteTone[] = ["brief", "professional", "casual", "warm"];

export interface GenerateTemplateVariantSetOptions {
  baseSubject: string;
  baseBody: string;
  language: RewriteLang;
  mustInclude?: string;
  mustAvoid?: string;
}

export interface GenerateTemplateVariantSetResult {
  ok: boolean;
  variants?: TemplateVariantRow[];
  fallbackCount?: number;
  error?: string;
}

export async function generateTemplateVariantSet(
  options: GenerateTemplateVariantSetOptions,
): Promise<GenerateTemplateVariantSetResult> {
  const baseVariant: TemplateVariantRow = {
    subject: options.baseSubject,
    body: options.baseBody,
    tone: "base",
    edited_at: null,
  };

  const rewrites = await Promise.all(
    VARIANT_TONES.map(async (tone) => {
      const result = await rewriteOutreachTemplate({
        currentBody: options.baseBody,
        currentSubject: options.baseSubject,
        language: options.language,
        tone,
        mustInclude: options.mustInclude,
        mustAvoid: options.mustAvoid,
      });

      if (!result.ok || !result.subject || !result.body) {
        return null;
      }

      return {
        subject: result.subject,
        body: result.body,
        tone,
        edited_at: null,
      } satisfies TemplateVariantRow;
    }),
  );

  const finalized = VARIANT_TONES.map((tone) => {
    const matched = rewrites.find((row) => row?.tone === tone);
    if (matched) {
      return matched;
    }
    return {
      subject: options.baseSubject,
      body: options.baseBody,
      tone,
      edited_at: null,
    } satisfies TemplateVariantRow;
  });

  const fallbackCount = finalized.reduce(
    (count, variant) =>
      variant.subject === options.baseSubject && variant.body === options.baseBody
        ? count + 1
        : count,
    0,
  );

  const hasAnyAiRewrite = finalized.some(
    (variant) =>
      !(variant.subject === options.baseSubject && variant.body === options.baseBody),
  );

  if (!hasAnyAiRewrite) {
    return {
      ok: false,
      error:
        "AI could not generate variants right now. Please retry or verify AI configuration.",
    };
  }

  return {
    ok: true,
    variants: [baseVariant, ...finalized],
    fallbackCount,
  };
}
