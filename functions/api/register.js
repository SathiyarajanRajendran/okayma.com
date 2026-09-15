import { fail, json, readJson, sameOrigin, clientIp, nowIso } from "../../lib/http.js";
import { randomId } from "../../lib/crypto.js";
import { issueToken, pruneExpired } from "../../lib/auth.js";
import { validateRegistration } from "../../lib/validate.js";
import { rateLimit } from "../../lib/ratelimit.js";
import { sendVerificationEmail, sendSignInEmail } from "../../lib/mail.js";

// The same reply goes back whether or not the address is already registered,
// so the endpoint cannot be used to discover who has an account.
const NEUTRAL = {
  ok: true,
  message:
    "Check your inbox. If that address can be used, a confirmation link is on its way. The link is valid for 24 hours.",
};

export async function onRequestPost({ request, env }) {
  if (!sameOrigin(request)) return fail(403, "Request blocked.");

  const db = env.DB;
  const body = await readJson(request);
  if (!body) return fail(400, "Expected a JSON body.");

  const { ok, value, errors } = validateRegistration(body);
  if (!ok) return json({ error: "Please check the highlighted fields.", fields: errors }, 422);

  // Per IP, so colleagues behind one office address share this budget. The
  // real defences against junk sign-ups are email confirmation and manual
  // approval; this only blunts scripted abuse.
  const limit = await rateLimit(db, `register:${clientIp(request)}`, {
    limit: 10,
    windowSeconds: 3600,
  });
  if (!limit.allowed) {
    return fail(429, "Too many sign-up attempts. Please try again later.", {
      retryAfter: limit.retryAfter,
    });
  }

  const siteUrl = env.SITE_URL || new URL(request.url).origin;
  const existing = await db
    .prepare("SELECT id, first_name, status FROM users WHERE email = ?")
    .bind(value.email)
    .first();

  if (existing) {
    // Already known. Nudge them forward rather than admitting the address is
    // taken: unverified accounts get another confirmation link, verified ones
    // get a sign-in link.
    if (existing.status === "suspended") return json(NEUTRAL);

    if (existing.status === "pending") {
      const token = await issueToken(db, existing.id, "verify");
      await sendVerificationEmail(env, {
        to: value.email,
        firstName: existing.first_name,
        link: `${siteUrl}/api/verify?token=${token}`,
      });
    } else {
      const token = await issueToken(db, existing.id, "login");
      await sendSignInEmail(env, {
        to: value.email,
        firstName: existing.first_name,
        link: `${siteUrl}/api/auth?token=${token}`,
      });
    }
    return json(NEUTRAL);
  }

  const id = randomId();
  await db
    .prepare(
      `INSERT INTO users (id, email, phone, first_name, last_name, title, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)`
    )
    .bind(id, value.email, value.phone, value.firstName, value.lastName, value.title, nowIso())
    .run();

  const token = await issueToken(db, id, "verify");
  await sendVerificationEmail(env, {
    to: value.email,
    firstName: value.firstName,
    link: `${siteUrl}/api/verify?token=${token}`,
  });

  await pruneExpired(db);
  return json(NEUTRAL, 201);
}
