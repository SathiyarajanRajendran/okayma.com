import { json } from "../../lib/http.js";
import { currentUser } from "../../lib/auth.js";

// Drives the signed-in / signed-out state of the ideas page.
export async function onRequestGet({ request, env }) {
  const user = await currentUser(env.DB, request);
  return json({ user });
}
