import type { SupabaseClient } from "@supabase/supabase-js";

type MinimalTemplateClient = SupabaseClient;
export const TEMPLATE_MEDIA_BUCKET = "template-media";

export function sanitizeFileName(name: string) {
  const trimmed = name.trim().toLowerCase();
  const replaced = trimmed.replace(/[^a-z0-9._-]+/g, "-");
  const collapsed = replaced.replace(/-+/g, "-").replace(/^-|-$/g, "");
  return collapsed || "image";
}

export async function generateUniqueTemplateName(
  supabase: MinimalTemplateClient,
  workspaceId: string,
  baseName: string,
): Promise<string> {
  const trimmedBaseName = baseName.trim();
  const fallbackName = "Template";
  const safeBaseName = trimmedBaseName || fallbackName;

  const { data, error } = await supabase
    .from("templates")
    .select("name")
    .eq("workspace_id", workspaceId)
    .ilike("name", `${safeBaseName}%`)
    .limit(500);

  if (error) {
    throw error;
  }

  const usedNames = new Set((data ?? []).map((row) => row.name));
  if (!usedNames.has(safeBaseName)) {
    return safeBaseName;
  }

  for (let index = 2; index < 1000; index += 1) {
    const candidate = `${safeBaseName} (${index})`;
    if (!usedNames.has(candidate)) {
      return candidate;
    }
  }

  return `${safeBaseName} (${Date.now()})`;
}
