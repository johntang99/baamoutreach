import "server-only";
import {
  rewriteOutreachTemplate,
  type RewriteLang,
  type RewriteTone,
} from "@/lib/ai/rewrite-body";

export interface ListVariant {
  subject: string;
  body: string;
  tone: RewriteTone;
}

export interface GenerateListVariantsOptions {
  baseSubject: string;
  baseBody: string;
  language: RewriteLang;
}

export interface GenerateListVariantsResult {
  ok: boolean;
  variants?: ListVariant[];
  error?: string;
}

const VARIANT_TONES: RewriteTone[] = ["brief", "professional", "casual", "warm"];

export async function generateListVariants(
  options: GenerateListVariantsOptions,
): Promise<GenerateListVariantsResult> {
  const variant0: ListVariant = {
    subject: options.baseSubject,
    body: options.baseBody,
    tone: "warm",
  };

  const rewrites = await Promise.all(
    VARIANT_TONES.map(async (tone) => {
      const result = await rewriteOutreachTemplate({
        currentBody: options.baseBody,
        currentSubject: options.baseSubject,
        language: options.language,
        tone,
      });

      if (!result.ok || !result.subject || !result.body) {
        return null;
      }

      return {
        subject: result.subject,
        body: result.body,
        tone,
      } satisfies ListVariant;
    }),
  );

  const aiVariants = rewrites.filter((row): row is ListVariant => row !== null);
  if (aiVariants.length === 0) {
    return {
      ok: false,
      error:
        "AI couldn't generate variants right now. Please retry, or check Anthropic API setup.",
    };
  }

  return {
    ok: true,
    variants: [variant0, ...aiVariants],
  };
}
