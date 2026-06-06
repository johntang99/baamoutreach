export type TemplateVariantTone = "base" | "brief" | "professional" | "casual" | "warm";

export type TemplateVariantRow = {
  subject: string;
  body: string;
  tone: TemplateVariantTone;
  edited_at?: string | null;
};

export type TemplateVariantSetRow = {
  id: string;
  workspace_id: string;
  template_id: string;
  name: string;
  language: "en" | "zh" | "es";
  generation_notes: Record<string, unknown>;
  variants: TemplateVariantRow[];
  created_by: string;
  created_at: string;
  updated_at: string;
};

const ALLOWED_TONES = new Set<TemplateVariantTone>([
  "base",
  "brief",
  "professional",
  "casual",
  "warm",
]);

export function parseTemplateVariantRows(raw: unknown): TemplateVariantRow[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  return raw
    .filter(
      (item): item is Record<string, unknown> =>
        typeof item === "object" &&
        item !== null &&
        typeof item.subject === "string" &&
        typeof item.body === "string",
    )
    .map((item) => {
      const toneRaw = typeof item.tone === "string" ? item.tone : "base";
      const tone = ALLOWED_TONES.has(toneRaw as TemplateVariantTone)
        ? (toneRaw as TemplateVariantTone)
        : "base";
      return {
        subject: (item.subject as string).trim(),
        body: (item.body as string).trim(),
        tone,
        edited_at:
          typeof item.edited_at === "string" && item.edited_at.trim().length > 0
            ? (item.edited_at as string)
            : null,
      } satisfies TemplateVariantRow;
    })
    .filter((variant) => variant.subject.length > 0 && variant.body.length > 0)
    .slice(0, 5);
}

export function parseTemplateVariantLanguage(value: string): "en" | "zh" | "es" {
  const normalized = value.trim().toLowerCase();
  if (normalized === "zh" || normalized === "es") {
    return normalized;
  }
  return "en";
}
