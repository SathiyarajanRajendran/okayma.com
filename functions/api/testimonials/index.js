import { fail, json, readJson, sameOrigin, clientIp, nowIso, isoIn } from "../../../lib/http.js";
import { randomId, randomToken, sha256Hex } from "../../../lib/crypto.js";
import { validateTestimonial } from "../../../lib/validate.js";
import { rateLimit } from "../../../lib/ratelimit.js";
import { sendTestimonialConfirmEmail } from "../../../lib/mail.js";
import { LINK_SECONDS } from "../../../lib/auth.js";

const PAGE_SIZE = 10;

// The public wall. Only published testimonials are ever returned, and the
// submitter's email never leaves the database.
export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const page = Math.max(1, Number.parseInt(url.searchParams.get("page") || "1", 10) || 1);

  const { results } = await env.DB.prepare(
    `SELECT id, name, role, organisation, relationship, body, decided_at, created_at
       FROM testimonials
      WHERE status = 'published'
      ORDER BY decided_at DESC, created_at DESC
      LIMIT ? OFFSET ?`
  )
    .bind(PAGE_SIZE + 1, (page - 1) * PAGE_SIZE)
    .all();

  const hasMore = results.length > PAGE_SIZE;
  const testimonials = results.slice(0, PAGE_SIZE).map((row) => ({
    id: row.id,
    name: row.name,
    role: row.role,
    organisation: row.organisation,
    relationship: row.relationship,
    body: row.body,
    publishedAt: row.decided_at || row.created_at,
  }));

  return json({ testimonials, page, hasMore }, 200, {
    "Cache-Control": "public, max-age=60",
  });
}

// Submission is open to anyone, but a testimonial sits at 'unconfirmed' until
// the emailed link is followed. Until then it is invisible to the moderation
// queue as well as the public page, so an unconfirmed address can never put
// words in a named person's mouth.
export async function onRequestPost({ request, env }) {
  if (!sameOrigin(request)) return fail(403, "Request blocked.");

  const db = env.DB;
  const body = await readJson(request);
  if (!body) return fail(400, "Expected a JSON body.");

  const { ok, value, errors } = validateTestimonial(body);
  if (!ok) return json({ error: "Please check the highlighted fields.", fields: errors }, 422);

  // Keyed on IP rather than email: the address is unverified at this point, so
  // keying on it would let one sender walk through addresses freely.
  const limit = await rateLimit(db, `testimonial:${clientIp(request)}`, {
    limit: 3,
    windowSeconds: 86400,
  });
  if (!limit.allowed) {
    return fail(429, "That is enough testimonials from here for today. Please try tomorrow.", {
      retryAfter: limit.retryAfter,
    });
  }

  // One pending testimonial per address at a time. Replacing the earlier one
  // keeps a corrected resubmission from arriving as a duplicate in the queue.
  await db
    .prepare("DELETE FROM testimonials WHERE email = ? AND status = 'unconfirmed'")
    .bind(value.email)
    .run();

  const id = randomId();
  const token = randomToken();
  await db
    .prepare(
      `INSERT INTO testimonials
         (id, name, role, organisation, email, relationship, body, status,
          confirm_hash, confirm_expires_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'unconfirmed', ?, ?, ?)`
    )
    .bind(
      id,
      value.name,
      value.role,
      value.organisation,
      value.email,
      value.relationship,
      value.body,
      await sha256Hex(token),
      isoIn(LINK_SECONDS),
      nowIso()
    )
    .run();

  const siteUrl = env.SITE_URL || new URL(request.url).origin;
  await sendTestimonialConfirmEmail(env, {
    to: value.email,
    name: value.name.split(" ")[0] || value.name,
    link: `${siteUrl}/api/testimonials/confirm?token=${token}`,
  });

  return json(
    {
      ok: true,
      message:
        "Thank you. Check your inbox and follow the confirmation link — your testimonial reaches Sathiya for review once you do.",
    },
    201
  );
}
