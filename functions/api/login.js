import { fail, json, readJson, sameOrigin, clientIp } from "../../lib/http.js";
import { issueToken } from "../../lib/auth.js";
import { normaliseEmail, isEmail } from "../../lib/validate.js";
import { rateLimit } from "../../lib/ratelimit.js";
import { sendSignInEmail, sendVerificationEmail } from "../../lib/mail.js";

// Passwordless sign-in: the member asks for a link, we email it. Nothing here
// reveals whether the address is registered.
export async function onRequestPost({ request, env }) {
  if (!sameOrigin(request)) return fail(403, "Request blocked.");

  const db = env.DB;
  const body = await readJson(request);
  if (!body) return fail(400, "Expected a JSON body.");

  const email = normaliseEmail(body.email);
  if (!isEmail(email)) {
    return json({ error: "Please check the highlighted fields.", fields: { email: "Enter a valid email address." } }, 422);
  }

  const limit = await rateLimit(db, `login:${clientIp(request)}`, { limit: 8, windowSeconds: 3600 });
  if (!limit.allowed) {
    return fail(429, "Too many sign-in requests. Please try again later.", {
      retryAfter: limit.retryAfter,
    });
  }

  const siteUrl = env.SITE_URL || new URL(request.url).origin;
  const user = await db
    .prepare("SELECT id, first_name, status FROM users WHERE email = ?")
    .bind(email)
    .first();

  if (user && user.status !== "suspended") {
    // An account that never confirmed gets the confirmation link again rather
    // than a sign-in link it could not use.
    if (user.status === "pending") {
      const token = await issueToken(db, user.id, "verify");
      await sendVerificationEmail(env, {
        to: email,
        firstName: user.first_name,
        link: `${siteUrl}/api/verify?token=${token}`,
      });
    } else {
      const token = await issueToken(db, user.id, "login");
      await sendSignInEmail(env, {
        to: email,
        firstName: user.first_name,
        link: `${siteUrl}/api/auth?token=${token}`,
      });
    }
  }

  return json({
    ok: true,
    message: "If that address has an Okayma account, a sign-in link is on its way.",
  });
}
