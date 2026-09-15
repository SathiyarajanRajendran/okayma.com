import { json } from "../../../lib/http.js";

// Reaching this handler at all means the middleware accepted the session.
export async function onRequestGet({ env }) {
  return json({ admin: true, email: env.ADMIN_EMAIL || null });
}
