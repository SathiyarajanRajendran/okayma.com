import { redirect, nowIso } from "../../lib/http.js";
import { consumeToken, createSession } from "../../lib/auth.js";

// Landing point for the emailed sign-in link.
export async function onRequestGet({ request, env }) {
  const db = env.DB;
  const token = new URL(request.url).searchParams.get("token");
  const userId = await consumeToken(db, token, "login");

  if (!userId) return redirect("/ideas?auth=invalid");

  const user = await db.prepare("SELECT status FROM users WHERE id = ?").bind(userId).first();
  if (!user || user.status !== "active") return redirect("/ideas?auth=suspended");

  await db.prepare("UPDATE users SET last_login_at = ? WHERE id = ?").bind(nowIso(), userId).run();
  const cookie = await createSession(db, request, { kind: "user", userId });
  return redirect("/ideas?auth=signed-in", cookie);
}
