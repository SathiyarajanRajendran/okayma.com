import { json, fail, sameOrigin } from "../../lib/http.js";
import { destroySession } from "../../lib/auth.js";

export async function onRequestPost({ request, env }) {
  if (!sameOrigin(request)) return fail(403, "Request blocked.");
  const cookie = await destroySession(env.DB, request, "user");
  return json({ ok: true }, 200, { "Set-Cookie": cookie });
}
