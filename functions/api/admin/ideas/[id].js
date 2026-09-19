import { fail, json, readJson, sameOrigin, nowIso } from "../../../../lib/http.js";
import { cleanString } from "../../../../lib/validate.js";
import { randomId } from "../../../../lib/crypto.js";
import { sendDecisionEmail } from "../../../../lib/mail.js";
import { isStage } from "../../../../lib/stages.js";

// Approve or reject an idea, and/or move it to another delivery stage.
//
// The two are independent: `status` controls whether the idea is publicly
// visible, `stage` how far it has travelled. A request may carry either or
// both, so the console can move a stage without re-deciding publication.
export async function onRequestPatch({ request, env, params }) {
  if (!sameOrigin(request)) return fail(403, "Request blocked.");

  const body = await readJson(request);
  if (!body) return fail(400, "Expected a JSON body.");

  const hasStatus = body.status !== undefined;
  const hasStage = body.stage !== undefined;
  if (!hasStatus && !hasStage) return fail(422, "Provide a status, a stage, or both.");

  if (hasStatus && !["approved", "rejected", "pending"].includes(body.status)) {
    return fail(422, "Status must be approved, rejected or pending.");
  }
  if (hasStage && !isStage(body.stage)) {
    return fail(422, "Unknown stage.");
  }

  const note = cleanString(body.adminNote || "", 300);
  const db = env.DB;

  const idea = await db
    .prepare(
      `SELECT i.id, i.title, i.status, i.stage, u.email, u.first_name
         FROM ideas i JOIN users u ON u.id = i.user_id
        WHERE i.id = ?`
    )
    .bind(params.id)
    .first();
  if (!idea) return fail(404, "No such idea.");

  const writes = [];
  const now = nowIso();

  if (hasStatus) {
    const decidedAt = body.status === "pending" ? null : now;
    writes.push(
      db
        .prepare("UPDATE ideas SET status = ?, decided_at = ?, admin_note = ? WHERE id = ?")
        .bind(body.status, decidedAt, note || null, params.id)
    );
  }

  // A move to the stage it is already in is a no-op rather than a duplicate
  // history entry, so the timeline stays readable.
  const stageMoved = hasStage && body.stage !== idea.stage;
  if (stageMoved) {
    writes.push(
      db
        .prepare("UPDATE ideas SET stage = ?, stage_changed_at = ? WHERE id = ?")
        .bind(body.stage, now, params.id)
    );
    writes.push(
      db
        .prepare(
          `INSERT INTO idea_stage_events (id, idea_id, from_stage, to_stage, note, created_at)
           VALUES (?, ?, ?, ?, ?, ?)`
        )
        .bind(randomId(), params.id, idea.stage, body.stage, note || null, now)
    );
  }

  if (writes.length) await db.batch(writes);

  // Only a publication decision is worth an email. Stage moves are internal
  // progress and would be noise in an author's inbox.
  let notified = false;
  if (
    hasStatus &&
    body.status !== idea.status &&
    body.status !== "pending" &&
    body.notify !== false
  ) {
    const result = await sendDecisionEmail(env, {
      to: idea.email,
      firstName: idea.first_name,
      ideaTitle: idea.title,
      approved: body.status === "approved",
      siteUrl: env.SITE_URL || new URL(request.url).origin,
    });
    notified = result.sent;
  }

  return json({
    ok: true,
    id: params.id,
    status: hasStatus ? body.status : idea.status,
    stage: hasStage ? body.stage : idea.stage,
    stageMoved,
    decidedAt: hasStatus && body.status !== "pending" ? now : null,
    notified,
  });
}

export async function onRequestDelete({ request, env, params }) {
  if (!sameOrigin(request)) return fail(403, "Request blocked.");

  const result = await env.DB.prepare("DELETE FROM ideas WHERE id = ?").bind(params.id).run();
  if (!result.meta || result.meta.changes === 0) return fail(404, "No such idea.");

  return json({ ok: true, id: params.id, deleted: true });
}
