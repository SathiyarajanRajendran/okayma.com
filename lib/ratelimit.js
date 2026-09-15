import { nowIso, isoIn } from "./http.js";

// Fixed-window rate limiting backed by D1. Coarse by design: it exists to blunt
// scripted abuse of the public endpoints, not to be precise under contention.
export async function rateLimit(db, key, { limit, windowSeconds }) {
  const now = nowIso();
  const row = await db
    .prepare("SELECT count, reset_at FROM rate_limits WHERE key = ?")
    .bind(key)
    .first();

  if (!row || row.reset_at <= now) {
    await db
      .prepare(
        `INSERT INTO rate_limits (key, count, reset_at) VALUES (?, 1, ?)
         ON CONFLICT(key) DO UPDATE SET count = 1, reset_at = excluded.reset_at`
      )
      .bind(key, isoIn(windowSeconds))
      .run();
    return { allowed: true, remaining: limit - 1 };
  }

  if (row.count >= limit) {
    const retryAfter = Math.max(
      1,
      Math.ceil((new Date(row.reset_at).getTime() - Date.now()) / 1000)
    );
    return { allowed: false, retryAfter };
  }

  await db.prepare("UPDATE rate_limits SET count = count + 1 WHERE key = ?").bind(key).run();
  return { allowed: true, remaining: limit - row.count - 1 };
}
