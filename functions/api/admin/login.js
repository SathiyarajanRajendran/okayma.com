import { fail, json, readJson, sameOrigin, clientIp } from "../../../lib/http.js";
import { verifyPassword, timingSafeEqual } from "../../../lib/crypto.js";
import { createSession } from "../../../lib/auth.js";
import { normaliseEmail } from "../../../lib/validate.js";
import { rateLimit } from "../../../lib/ratelimit.js";

// salt(16 bytes hex) + "$" + derived key(32 bytes hex), as hashPassword emits.
const HASH_FORMAT = /^[0-9a-f]{32}\$[0-9a-f]{64}$/;

export async function onRequestPost({ request, env }) {
  if (!sameOrigin(request)) return fail(403, "Request blocked.");

  const db = env.DB;

  // Check the SHAPE, not just presence. A truncated or half-pasted secret is
  // otherwise indistinguishable from a wrong password: every sign-in returns
  // 401 and looks like operator error rather than broken configuration.
  if (!HASH_FORMAT.test(env.ADMIN_PASSWORD_HASH || "")) {
    return fail(
      503,
      "ADMIN_PASSWORD_HASH is missing or malformed. It must be the full " +
        "salt$hash value printed by `npm run admin-password` — 32 hex " +
        "characters, a dollar sign, then 64 hex characters."
    );
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
  let passwordOk;
  try {
    passwordOk = await verifyPassword(password, env.ADMIN_PASSWORD_HASH);
  } catch (error) {
    console.log("[admin-login] password verification failed:", error && error.name, error && error.message);
    return fail(
      503,
      "Password verification failed on the server. This is a configuration or " +
        "runtime problem, not an incorrect password. Check the Worker logs."
    );
  }
  const emailOk = timingSafeEqual(email, expectedEmail);

  if (!passwordOk || !emailOk) return fail(401, "Those details were not recognised.");

  const cookie = await createSession(db, request, { kind: "admin" });
  return json({ ok: true }, 200, { "Set-Cookie": cookie });
}
