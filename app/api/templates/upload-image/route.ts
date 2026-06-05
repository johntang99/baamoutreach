import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getOrCreatePrimaryWorkspace } from "@/lib/workspaces";
import { getWorkspaceRole } from "@/lib/workspace-access";
import { logWorkspaceAudit } from "@/lib/audit";
import { TEMPLATE_MEDIA_BUCKET, sanitizeFileName } from "@/lib/templates";

const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
] as const;

const EXTENSION_BY_MIME: Record<(typeof ALLOWED_IMAGE_TYPES)[number], string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
};

function normalizeAltText(value: string, fallbackFileName: string) {
  const raw = value.trim();
  if (raw.length > 0) return raw;
  const base = fallbackFileName.replace(/\.[a-z0-9]+$/i, "");
  return base || "image";
}

async function ensureTemplateMediaBucket() {
  const admin = createAdminClient();
  const { data: buckets, error: listError } = await admin.storage.listBuckets();
  if (listError) {
    return { ok: false as const, error: listError.message };
  }

  const exists = (buckets ?? []).some(
    (bucket) => bucket.id === TEMPLATE_MEDIA_BUCKET || bucket.name === TEMPLATE_MEDIA_BUCKET,
  );

  if (!exists) {
    const { error: createError } = await admin.storage.createBucket(TEMPLATE_MEDIA_BUCKET, {
      public: true,
      fileSizeLimit: MAX_IMAGE_SIZE_BYTES,
      allowedMimeTypes: [...ALLOWED_IMAGE_TYPES],
    });
    if (createError) {
      return { ok: false as const, error: createError.message };
    }
  }

  return { ok: true as const, admin };
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const workspace = await getOrCreatePrimaryWorkspace(user, supabase);
  const role = await getWorkspaceRole(workspace.workspaceId, user.id, supabase);
  if (!role) {
    return NextResponse.json({ error: "You cannot access this workspace." }, { status: 403 });
  }
  if (role === "viewer") {
    return NextResponse.json(
      { error: "Viewer role cannot upload template images." },
      { status: 403 },
    );
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "Invalid multipart form payload." }, { status: 400 });
  }

  const fileEntry = formData.get("file");
  if (!(fileEntry instanceof File)) {
    return NextResponse.json({ error: "file is required." }, { status: 400 });
  }

  if (!ALLOWED_IMAGE_TYPES.includes(fileEntry.type as (typeof ALLOWED_IMAGE_TYPES)[number])) {
    return NextResponse.json(
      {
        error:
          "Only PNG, JPEG, WEBP, and GIF images are allowed.",
      },
      { status: 400 },
    );
  }

  if (fileEntry.size > MAX_IMAGE_SIZE_BYTES) {
    return NextResponse.json(
      { error: "Image is too large. Maximum size is 5MB." },
      { status: 400 },
    );
  }

  const altTextInput = String(formData.get("altText") ?? "");
  const ext = EXTENSION_BY_MIME[fileEntry.type as (typeof ALLOWED_IMAGE_TYPES)[number]];
  const rawFileName = fileEntry.name || "image";
  const baseFileName = rawFileName.replace(/\.[a-z0-9]+$/i, "");
  const safeName = sanitizeFileName(baseFileName);
  const objectPath = `${workspace.workspaceId}/${crypto.randomUUID()}-${safeName}.${ext}`;

  const ensured = await ensureTemplateMediaBucket();
  if (!ensured.ok) {
    return NextResponse.json(
      { error: `Could not prepare storage bucket: ${ensured.error}` },
      { status: 400 },
    );
  }
  const admin = ensured.admin;

  const bytes = await fileEntry.arrayBuffer();
  const { error: uploadError } = await admin.storage
    .from(TEMPLATE_MEDIA_BUCKET)
    .upload(objectPath, bytes, {
      contentType: fileEntry.type,
      upsert: false,
      cacheControl: "3600",
    });

  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 400 });
  }

  const { data: publicUrlData } = admin.storage
    .from(TEMPLATE_MEDIA_BUCKET)
    .getPublicUrl(objectPath);
  const publicUrl = publicUrlData.publicUrl;
  const altText = normalizeAltText(altTextInput, rawFileName);
  const markdown = `![${altText}](${publicUrl})`;

  await logWorkspaceAudit({
    workspaceId: workspace.workspaceId,
    actorUserId: user.id,
    action: "template.image_uploaded",
    entityType: "storage_object",
    entityId: objectPath,
    metadata: {
      bucket: TEMPLATE_MEDIA_BUCKET,
      mimeType: fileEntry.type,
      size: fileEntry.size,
    },
  });

  return NextResponse.json({
    ok: true,
    markdown,
    publicUrl,
    path: objectPath,
  });
}
