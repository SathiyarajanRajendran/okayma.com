import { fail, json, readJson, sameOrigin, clientIp } from "../../../lib/http.js";
import { verifyPassword, timingSafeEqual } from "../../../lib/crypto.js";
import { createSession } from "../../../lib/auth.js";
import { normaliseEmail } from "../../../lib/validate.js";
import { rateLimit } from "../../../lib/ratelimit.js";

export async function onRequestPost({ request, env }) {
  if (!sameOrigin(request)) return fail(403, "Request blocked.");

  const db = env.DB;
  if (!env.ADMIN_PASSWORD_HASH) {
    return fail(503, "Admin access is not configured yet. Set the ADMIN_PASSWORD_HASH secret.");
  }

  // Throttle this endpoint: it is the one worth guessing at. Ten tries per
  // quarter hour is nothing against a salted PBKDF2 hash, but leaves enough
  // headroom to sign in and out while testing.
  const limit = await rateLimit(db, `admin-login:${clientIp(request)}`, {
    limit: 10,
    windowSeconds: 900,
  });
  if (!limit.allowed) {
    return fail(429, "Too many attempts. Try again in a few minutes.", {
      retryAfter: limit.retryAfter,
    });
  }

  const body = await readJson(request);
  if (!body) return fail(400, "Expected a JSON body.");

  const email = normaliseEmail(body.email);
  const password = typeof body.password === "string" ? body.password : "";
  const expectedEmail = normaliseEmail(env.ADMIN_EMAIL || "");

  // Always run the password check so a wrong email and a wrong password take
  // the same amount of time.
  const passwordOk = await verifyPassword(password, env.ADMIN_PASSWORD_HASH);
  const emailOk = timingSafeEqual(email, expectedEmail);

  if (!passwordOk || !emailOk) return fail(401, "Those details were not recognised.");

  const cookie = await createSession(db, request, { kind: "admin" });
  return json({ ok: true }, 200, { "Set-Cookie": cookie });
}
