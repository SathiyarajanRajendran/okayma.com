import { redirect, nowIso } from "../../lib/http.js";
import { consumeToken, createSession } from "../../lib/auth.js";

// Landing point for the emailed confirmation link. Confirming activates the
// account and signs the member straight in, so there is no second step.
export async function onRequestGet({ request, env }) {
  const db = env.DB;
  const token = new URL(request.url).searchParams.get("token");
  const userId = await consumeToken(db, token, "verify");

  if (!userId) return redirect("/ideas?auth=invalid");

  const user = await db.prepare("SELECT status FROM users WHERE id = ?").bind(userId).first();
  if (!user || user.status === "suspended") return redirect("/ideas?auth=suspended");

  const now = nowIso();
  await db
    .prepare(
      `UPDATE users
          SET status = 'active',
              email_verified_at = COALESCE(email_verified_at, ?),
              last_login_at = ?
        WHERE id = ?`
    )
    .bind(now, now, userId)
    .run();

  const cookie = await createSession(db, request, { kind: "user", userId });
  return redirect("/ideas?auth=verified", cookie);
}
