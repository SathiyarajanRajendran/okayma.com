import { json } from "../../../lib/http.js";
import { pruneExpired } from "../../../lib/auth.js";

export async function onRequestGet({ env }) {
  const db = env.DB;
  await pruneExpired(db);

  const [users, ideas] = await db.batch([
    db.prepare(
      `SELECT
         COUNT(*) AS total,
         SUM(CASE WHEN status = 'active'    THEN 1 ELSE 0 END) AS active,
         SUM(CASE WHEN status = 'pending'   THEN 1 ELSE 0 END) AS pending,
         SUM(CASE WHEN status = 'suspended' THEN 1 ELSE 0 END) AS suspended
       FROM users`
    ),
    db.prepare(
      `SELECT
         COUNT(*) AS total,
         SUM(CASE WHEN status = 'pending'  THEN 1 ELSE 0 END) AS pending,
         SUM(CASE WHEN status = 'approved' THEN 1 ELSE 0 END) AS approved,
         SUM(CASE WHEN status = 'rejected' THEN 1 ELSE 0 END) AS rejected
       FROM ideas`
    ),
  ]);

  const u = users.results[0] || {};
  const i = ideas.results[0] || {};
  return json({
    users: {
      total: u.total || 0,
      active: u.active || 0,
      pending: u.pending || 0,
      suspended: u.suspended || 0,
    },
    ideas: {
      total: i.total || 0,
      pending: i.pending || 0,
      approved: i.approved || 0,
      rejected: i.rejected || 0,
    },
  });
}
