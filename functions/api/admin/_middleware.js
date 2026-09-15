import { fail } from "../../../lib/http.js";
import { isAdmin } from "../../../lib/auth.js";

// Guards every /api/admin/* route in one place, so an individual handler can
// never be added without its authorisation check.
const PUBLIC_PATHS = new Set(["/api/admin/login"]);

export async function onRequest(context) {
  const { request, env, next } = context;
  const { pathname } = new URL(request.url);

  if (PUBLIC_PATHS.has(pathname)) return next();
  if (!(await isAdmin(env.DB, request))) return fail(401, "Admin sign-in required.");

  return next();
}
