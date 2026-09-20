import { fail, json, sameOrigin, nowIso } from "../../../../lib/http.js";
import { validateTeamMember } from "../../../../lib/validate.js";
import { validatePhoto } from "../../../../lib/images.js";
import { readTeamForm } from "./index.js";

// Update a team member. Sent as multipart so the same form can carry a
// replacement portrait; a submission with no file leaves the existing one in
// place, and `removePhoto` clears it.
export async function onRequestPost({ request, env, params }) {
  if (!sameOrigin(request)) return fail(403, "Request blocked.");

  const parsed = await readTeamForm(request);
  if (!parsed) return fail(400, "Expected a multipart form submission.");

  const existing = await env.DB.prepare("SELECT id FROM team_members WHERE id = ?")
    .bind(params.id)
    .first();
  if (!existing) return fail(404, "No such team member.");

  const { ok, value, errors } = validateTeamMember(parsed.body);
  if (!ok) return json({ error: "Please check the highlighted fields.", fields: errors }, 422);

  const now = nowIso();
  const sets = [
    "name = ?",
    "role = ?",
    "bio = ?",
    "linkedin_url = ?",
    "status = ?",
    "sort_order = ?",
    "updated_at = ?",
  ];
  const binds = [
    value.name,
    value.role,
    value.bio,
    value.linkedinUrl,
    value.status,
    value.sortOrder,
    now,
  ];

  if (parsed.photoBytes) {
    const check = validatePhoto(parsed.photoBytes);
    if (!check.ok) return json({ error: check.error, fields: { photo: check.error } }, 422);
    sets.push("photo = ?", "photo_type = ?", "photo_updated_at = ?");
    binds.push(check.bytes, check.type, now);
  } else if (parsed.removePhoto) {
    sets.push("photo = NULL", "photo_type = NULL", "photo_updated_at = NULL");
  }

  binds.push(params.id);
  await env.DB.prepare(`UPDATE team_members SET ${sets.join(", ")} WHERE id = ?`)
    .bind(...binds)
    .run();

  return json({ ok: true, id: params.id, name: value.name, status: value.status });
}

export async function onRequestDelete({ request, env, params }) {
  if (!sameOrigin(request)) return fail(403, "Request blocked.");

  const result = await env.DB.prepare("DELETE FROM team_members WHERE id = ?")
    .bind(params.id)
    .run();
  if (!result.meta || result.meta.changes === 0) return fail(404, "No such team member.");

  return json({ ok: true, id: params.id, deleted: true });
}
