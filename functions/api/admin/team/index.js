import { fail, json, sameOrigin, nowIso } from "../../../../lib/http.js";
import { randomId } from "../../../../lib/crypto.js";
import { validateTeamMember } from "../../../../lib/validate.js";
import { validatePhoto } from "../../../../lib/images.js";

// Full list for the console, drafts included.
export async function onRequestGet({ env }) {
  const { results } = await env.DB.prepare(
    `SELECT id, name, role, bio, linkedin_url, status, sort_order,
            created_at, updated_at, photo_updated_at,
            photo IS NOT NULL AS has_photo
       FROM team_members
      ORDER BY sort_order ASC, name ASC`
  ).all();

  return json({
    team: results.map((row) => ({
      id: row.id,
      name: row.name,
      role: row.role,
      bio: row.bio,
      linkedinUrl: row.linkedin_url,
      status: row.status,
      sortOrder: row.sort_order,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      photoUrl: row.has_photo
        ? `/api/team/${row.id}/photo?v=${encodeURIComponent(row.photo_updated_at || "1")}`
        : null,
    })),
  });
}

// Reads a multipart submission into the same shape the JSON validators expect,
// plus the raw photo bytes. Multipart rather than base64-in-JSON: it avoids
// inflating every upload by a third, and the browser builds it for free.
export async function readTeamForm(request) {
  const type = request.headers.get("Content-Type") || "";
  if (!type.includes("multipart/form-data")) return null;

  let form;
  try {
    form = await request.formData();
  } catch {
    return null;
  }

  const field = (name) => {
    const value = form.get(name);
    return typeof value === "string" ? value : undefined;
  };

  const body = {
    name: field("name"),
    role: field("role"),
    bio: field("bio"),
    linkedinUrl: field("linkedinUrl"),
    status: field("status"),
    sortOrder: field("sortOrder"),
  };

  const file = form.get("photo");
  const hasFile = file && typeof file !== "string" && file.size > 0;
  const photoBytes = hasFile ? new Uint8Array(await file.arrayBuffer()) : null;

  // A checkbox the console sends when the admin wants the existing portrait
  // removed without supplying a replacement.
  const removePhoto = field("removePhoto") === "true";

  return { body, photoBytes, removePhoto };
}

export async function onRequestPost({ request, env }) {
  if (!sameOrigin(request)) return fail(403, "Request blocked.");

  const parsed = await readTeamForm(request);
  if (!parsed) return fail(400, "Expected a multipart form submission.");

  const { ok, value, errors } = validateTeamMember(parsed.body);
  if (!ok) return json({ error: "Please check the highlighted fields.", fields: errors }, 422);

  let photo = null;
  let photoType = null;
  if (parsed.photoBytes) {
    const check = validatePhoto(parsed.photoBytes);
    if (!check.ok) return json({ error: check.error, fields: { photo: check.error } }, 422);
    photo = check.bytes;
    photoType = check.type;
  }

  const id = randomId();
  const now = nowIso();
  await env.DB.prepare(
    `INSERT INTO team_members
       (id, name, role, bio, linkedin_url, photo, photo_type, photo_updated_at,
        status, sort_order, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      id,
      value.name,
      value.role,
      value.bio,
      value.linkedinUrl,
      photo,
      photoType,
      photo ? now : null,
      value.status,
      value.sortOrder,
      now,
      now
    )
    .run();

  return json({ ok: true, id, name: value.name, status: value.status }, 201);
}
