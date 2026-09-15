import { fail, json, readJson, sameOrigin, nowIso } from "../../../../lib/http.js";
import { cleanString } from "../../../../lib/validate.js";
import { sendDecisionEmail } from "../../../../lib/mail.js";

// Approve or reject an idea. Approving publishes it to the public board.
export async function onRequestPatch({ request, env, params }) {
  if (!sameOrigin(request)) return fail(403, "Request blocked.");

  const body = await readJson(request);
  if (!body) return fail(400, "Expected a JSON body.");

  const status = body.status;
  if (!["approved", "rejected", "pending"].includes(status)) {
    return fail(422, "Status must be approved, rejected or pending.");
  }

  const note = cleanString(body.adminNote || "", 300);
  const db = env.DB;

  const idea = await db
    .prepare(
      `SELECT i.id, i.title, i.status, u.email, u.first_name
         FROM ideas i JOIN users u ON u.id = i.user_id
        WHERE i.id = ?`
    )
    .bind(params.id)
    .first();
  if (!idea) return fail(404, "No such idea.");

  const decidedAt = status === "pending" ? null : nowIso();
  await db
    .prepare("UPDATE ideas SET status = ?, decided_at = ?, admin_note = ? WHERE id = ?")
    .bind(status, decidedAt, note || null, params.id)
    .run();

  // Tell the author, but only when the decision actually changed and they
  // asked to be notified.
  let notified = false;
  if (status !== idea.status && status !== "pending" && body.notify !== false) {
    const result = await sendDecisionEmail(env, {
      to: idea.email,
      firstName: idea.first_name,
      ideaTitle: idea.title,
      approved: status === "approved",
      siteUrl: env.SITE_URL || new URL(request.url).origin,
    });
    notified = result.sent;
  }

  return json({ ok: true, id: params.id, status, decidedAt, notified });
}

export async function onRequestDelete({ request, env, params }) {
  if (!sameOrigin(request)) return fail(403, "Request blocked.");

  const result = await env.DB.prepare("DELETE FROM ideas WHERE id = ?").bind(params.id).run();
  if (!result.meta || result.meta.changes === 0) return fail(404, "No such idea.");

  return json({ ok: true, id: params.id, deleted: true });
}
