import { fail, json } from "../../../lib/http.js";
import { currentUser } from "../../../lib/auth.js";

// A member's own ideas, including the ones still awaiting review.
export async function onRequestGet({ request, env }) {
  const user = await currentUser(env.DB, request);
  if (!user) return fail(401, "Not signed in.");

  const { results } = await env.DB.prepare(
    `SELECT id, title, description, status, created_at, decided_at
       FROM ideas WHERE user_id = ? ORDER BY created_at DESC LIMIT 50`
  )
    .bind(user.id)
    .all();

  return json({
    ideas: results.map((row) => ({
      id: row.id,
      title: row.title,
      description: row.description,
      status: row.status,
      createdAt: row.created_at,
      decidedAt: row.decided_at,
    })),
  });
}
