import { fail, json, readJson, sameOrigin, nowIso } from "../../../../lib/http.js";

// Suspend or reactivate a member.
export async function onRequestPatch({ request, env, params }) {
  if (!sameOrigin(request)) return fail(403, "Request blocked.");

  const body = await readJson(request);
  if (!body) return fail(400, "Expected a JSON body.");

  const status = body.status;
  if (!["active", "suspended", "pending"].includes(status)) {
    return fail(422, "Status must be active, suspended or pending.");
  }

  const user = await env.DB.prepare("SELECT id, email_verified_at FROM users WHERE id = ?")
    .bind(params.id)
    .first();
  if (!user) return fail(404, "No such member.");

  if (status === "active" && !user.email_verified_at) {
    return fail(409, "That member has not confirmed their email address yet.");
  }

  await env.DB.prepare("UPDATE users SET status = ? WHERE id = ?").bind(status, params.id).run();

  // A suspension must take hold immediately, not when the cookie expires.
  if (status !== "active") {
    await env.DB.prepare("DELETE FROM sessions WHERE user_id = ?").bind(params.id).run();
  }

  return json({ ok: true, id: params.id, status, updatedAt: nowIso() });
}

// Delete a member and everything they posted. The child rows are removed
// explicitly rather than leaning on ON DELETE CASCADE, so the outcome does not
// depend on D1's foreign-key pragma.
export async function onRequestDelete({ request, env, params }) {
  if (!sameOrigin(request)) return fail(403, "Request blocked.");

  const db = env.DB;
  const [, , , removed] = await db.batch([
    db.prepare("DELETE FROM ideas WHERE user_id = ?").bind(params.id),
    db.prepare("DELETE FROM tokens WHERE user_id = ?").bind(params.id),
    db.prepare("DELETE FROM sessions WHERE user_id = ?").bind(params.id),
    db.prepare("DELETE FROM users WHERE id = ?").bind(params.id),
  ]);

  if (!removed.meta || removed.meta.changes === 0) return fail(404, "No such member.");
  return json({ ok: true, id: params.id, deleted: true });
}
