import { fail, json, readJson, sameOrigin, nowIso } from "../../../../lib/http.js";
import { cleanString } from "../../../../lib/validate.js";
import { sendTestimonialDecisionEmail } from "../../../../lib/mail.js";

// Publish or reject a testimonial.
export async function onRequestPatch({ request, env, params }) {
  if (!sameOrigin(request)) return fail(403, "Request blocked.");

  const body = await readJson(request);
  if (!body) return fail(400, "Expected a JSON body.");

  const status = body.status;
  if (!["published", "rejected", "pending"].includes(status)) {
    return fail(422, "Status must be published, rejected or pending.");
  }

  const note = cleanString(body.adminNote || "", 300);
  const db = env.DB;

  const row = await db
    .prepare("SELECT id, name, email, status FROM testimonials WHERE id = ?")
    .bind(params.id)
    .first();
  if (!row) return fail(404, "No such testimonial.");

  // An unconfirmed testimonial has not been vouched for by its own author yet,
  // so it cannot be published from the console either.
  if (row.status === "unconfirmed") {
    return fail(409, "This testimonial has not been confirmed by its author yet.");
  }

  const decidedAt = status === "pending" ? null : nowIso();
  await db
    .prepare("UPDATE testimonials SET status = ?, decided_at = ?, admin_note = ? WHERE id = ?")
    .bind(status, decidedAt, note || null, params.id)
    .run();

  // The seeded testimonial carries no address, so there is nobody to tell.
  let notified = false;
  if (status !== row.status && status !== "pending" && body.notify !== false && row.email) {
    const result = await sendTestimonialDecisionEmail(env, {
      to: row.email,
      name: row.name.split(" ")[0] || row.name,
      published: status === "published",
      siteUrl: env.SITE_URL || new URL(request.url).origin,
    });
    notified = result.sent;
  }

  return json({ ok: true, id: params.id, status, decidedAt, notified });
}

export async function onRequestDelete({ request, env, params }) {
  if (!sameOrigin(request)) return fail(403, "Request blocked.");

  const result = await env.DB.prepare("DELETE FROM testimonials WHERE id = ?")
    .bind(params.id)
    .run();
  if (!result.meta || result.meta.changes === 0) return fail(404, "No such testimonial.");

  return json({ ok: true, id: params.id, deleted: true });
}
