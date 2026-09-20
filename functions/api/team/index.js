import { json } from "../../../lib/http.js";

// The public team list. The photo BLOB is deliberately not selected: it would
// be tens of kilobytes of base64 in a JSON payload that most callers would
// throw away. Each member carries a photo URL instead, served separately and
// cached hard.
export async function onRequestGet({ env }) {
  const { results } = await env.DB.prepare(
    `SELECT id, name, role, bio, linkedin_url, photo_updated_at,
            photo IS NOT NULL AS has_photo
       FROM team_members
      WHERE status = 'published'
      ORDER BY sort_order ASC, name ASC`
  ).all();

  const team = results.map((row) => ({
    id: row.id,
    name: row.name,
    role: row.role,
    bio: row.bio,
    linkedinUrl: row.linkedin_url || null,
    // The timestamp in the query string is what lets the photo itself be
    // cached for a year: replacing a portrait changes the URL.
    photoUrl: row.has_photo
      ? `/api/team/${row.id}/photo?v=${encodeURIComponent(row.photo_updated_at || "1")}`
      : null,
  }));

  return json({ team }, 200, { "Cache-Control": "public, max-age=60" });
}
